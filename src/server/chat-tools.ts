import type Anthropic from "@anthropic-ai/sdk";
import type { MessageToolCall } from "@/db/schema";
import type { ChatIntegration } from "@/server/integrations";
import { formatQueryResult, runReadOnlyQuery } from "@/server/sql-query";

type BetaTool = Anthropic.Beta.Messages.BetaToolUnion;
type McpServer = Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition;
type ToolUse = Anthropic.Beta.Messages.BetaToolUseBlock;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;

export const MCP_BETA = "mcp-client-2025-11-20";

/**
 * Turns the team's integrations into what a Messages request needs:
 * client tools for postgres integrations (we run them — see sql-query.ts),
 * MCP connector servers + toolsets for MCP integrations (Anthropic's side
 * calls them), and a system-prompt section describing each source. Only ever
 * built for signed-in team members.
 */
export type ChatToolkit = {
  tools: BetaTool[];
  mcpServers: McpServer[];
  betas: string[];
  promptSection: string;
  /** a human label for the status line while a tool runs */
  describe: (toolName: string) => string;
  execute: (block: ToolUse) => Promise<{
    result: ToolResult;
    call: MessageToolCall;
    integrationId: string | null;
  }>;
};

export function queryToolName(integrationName: string): string {
  return `query_${integrationName}`;
}

export function buildChatToolkit(list: ChatIntegration[]): ChatToolkit | null {
  if (list.length === 0) return null;
  const pg = list.filter((i) => i.kind === "postgres");
  const mcp = list.filter((i) => i.kind === "mcp");
  const byTool = new Map(pg.map((i) => [queryToolName(i.name), i]));

  const tools: BetaTool[] = pg.map((i) => ({
    name: queryToolName(i.name),
    description:
      `Run ONE read-only PostgreSQL query against “${i.name}” and get the rows back as JSON (max 200 rows). ` +
      (i.description ? `What it holds: ${i.description} ` : "") +
      "Discover the schema first when unsure (information_schema.tables / information_schema.columns), " +
      "select only the columns you need, and always add a LIMIT. Writes are impossible.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "A single SELECT / WITH / EXPLAIN statement.",
        },
      },
      required: ["sql"],
      additionalProperties: false,
    },
    strict: true,
  }));

  const mcpServers: McpServer[] = mcp.map((i) => ({
    type: "url" as const,
    name: i.name,
    url: i.url!,
    authorization_token: i.secret,
  }));
  for (const i of mcp) {
    tools.push({
      type: "mcp_toolset",
      mcp_server_name: i.name,
      // an allowlist turns everything off by default and opts tools back in
      ...(i.allowedTools.length > 0
        ? {
            default_config: { enabled: false },
            configs: Object.fromEntries(
              i.allowedTools.map((t) => [t, { enabled: true }]),
            ),
          }
        : {}),
    });
  }

  const lines = list.map((i) => {
    const how =
      i.kind === "postgres"
        ? `the \`${queryToolName(i.name)}\` tool (read-only SQL)`
        : `the tools from the “${i.name}” MCP server`;
    return `- **${i.name}** via ${how}${i.description ? `: ${i.description}` : ""}`;
  });
  const promptSection = [
    "## Live data sources (team only)",
    "",
    "This person is a signed-in Dash team member, so besides the docs you can look things up in these live systems:",
    "",
    ...lines,
    "",
    "Use them when the question needs real records — IDs, UUIDs, names, counts, current configuration — rather than documentation. Never guess or invent an ID: look it up, and say so if it isn't found. For SQL, check the schema before guessing table or column names, keep queries narrow, and match names case-insensitively (ILIKE) when the user's spelling may differ. Present results compactly (a short table or list) and mention which source they came from. Data-source results are not documentation — don't cite them with [n] markers.",
  ].join("\n");

  return {
    tools,
    mcpServers,
    betas: mcp.length > 0 ? [MCP_BETA] : [],
    promptSection,
    describe: (toolName) => {
      const i = byTool.get(toolName);
      return i ? `Querying ${i.name}…` : `Using ${toolName}…`;
    },
    async execute(block) {
      const integration = byTool.get(block.name);
      const sql =
        block.input && typeof block.input === "object" && "sql" in block.input
          ? String((block.input as { sql: unknown }).sql ?? "")
          : "";
      if (!integration) {
        return {
          integrationId: null,
          result: {
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Unknown tool ${block.name}`,
          },
          call: {
            integration: "?",
            tool: block.name,
            input: block.input,
            ok: false,
            summary: "unknown tool",
          },
        };
      }
      const started = Date.now();
      try {
        const res = await runReadOnlyQuery(integration.secret, sql);
        return {
          integrationId: integration.id,
          result: {
            type: "tool_result",
            tool_use_id: block.id,
            content: formatQueryResult(res),
          },
          call: {
            integration: integration.name,
            tool: block.name,
            input: { sql },
            ok: true,
            summary: `${res.rowCount} row${res.rowCount === 1 ? "" : "s"}${res.truncated ? " (truncated)" : ""}`,
            ms: res.ms,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          integrationId: integration.id,
          result: {
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Query failed: ${message}`,
          },
          call: {
            integration: integration.name,
            tool: block.name,
            input: { sql },
            ok: false,
            summary: message.slice(0, 300),
            ms: Date.now() - started,
          },
        };
      }
    },
  };
}

/**
 * MCP connector calls happen on Anthropic's side and come back as
 * mcp_tool_use / mcp_tool_result blocks in the response — collect them for
 * the audit trail.
 */
export function mcpCallsFromContent(content: ContentBlock[]): MessageToolCall[] {
  const results = new Map<string, { is_error: boolean; size: number }>();
  for (const b of content) {
    if (b.type === "mcp_tool_result") {
      const size =
        typeof b.content === "string"
          ? b.content.length
          : b.content.reduce((n, t) => n + t.text.length, 0);
      results.set(b.tool_use_id, { is_error: b.is_error, size });
    }
  }
  return content.flatMap((b) => {
    if (b.type !== "mcp_tool_use") return [];
    const r = results.get(b.id);
    return [
      {
        integration: b.server_name,
        tool: b.name,
        input: b.input,
        ok: r ? !r.is_error : false,
        summary: r
          ? r.is_error
            ? "error"
            : `${r.size.toLocaleString()} chars returned`
          : "no result",
      },
    ];
  });
}
