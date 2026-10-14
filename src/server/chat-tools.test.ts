import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatIntegration } from "./integrations";

const runReadOnlyQuery = vi.fn();
vi.mock("./sql-query", async (orig) => ({
  ...(await orig<typeof import("./sql-query")>()),
  runReadOnlyQuery: (...args: unknown[]) => runReadOnlyQuery(...args),
}));

const { buildChatToolkit, mcpCallsFromContent, MCP_BETA } = await import("./chat-tools");

const pg: ChatIntegration = {
  id: "pg-1",
  name: "dash",
  kind: "postgres",
  description: "Dash platform data",
  url: null,
  secret: "postgresql://reader@h/db",
  allowedTools: [],
};
const mcp: ChatIntegration = {
  id: "mcp-1",
  name: "linear",
  kind: "mcp",
  description: "Issues",
  url: "https://mcp.example.com/mcp",
  secret: "tok",
  allowedTools: ["search_issues"],
};

beforeEach(() => {
  runReadOnlyQuery.mockReset();
});

describe("buildChatToolkit", () => {
  it("returns null with no integrations", () => {
    expect(buildChatToolkit([])).toBeNull();
  });

  it("exposes postgres as a query tool and MCP via the connector, allowlisted", () => {
    const kit = buildChatToolkit([pg, mcp])!;
    const names = kit.tools.map((t) => ("name" in t ? t.name : t.type));
    expect(names).toEqual(["query_dash", "mcp_toolset"]);
    expect(kit.mcpServers).toEqual([
      { type: "url", name: "linear", url: mcp.url, authorization_token: "tok" },
    ]);
    expect(kit.tools[1]).toMatchObject({
      mcp_server_name: "linear",
      default_config: { enabled: false },
      configs: { search_issues: { enabled: true } },
    });
    expect(kit.betas).toEqual([MCP_BETA]);
    expect(kit.promptSection).toContain("query_dash");
    expect(kit.promptSection).toContain("Dash platform data");
  });

  it("needs no beta without MCP and enables all tools when no allowlist", () => {
    expect(buildChatToolkit([pg])!.betas).toEqual([]);
    const open = buildChatToolkit([{ ...mcp, allowedTools: [] }])!;
    expect(open.tools[0]).not.toHaveProperty("default_config");
  });

  it("executes queries and records the call", async () => {
    runReadOnlyQuery.mockResolvedValue({
      columns: ["id", "name"],
      rows: [{ id: "uuid-1", name: "ParkMobile" }],
      rowCount: 1,
      truncated: false,
      ms: 12,
    });
    const kit = buildChatToolkit([pg])!;
    const out = await kit.execute({
      type: "tool_use",
      id: "tu_1",
      name: "query_dash",
      input: { sql: "select id, name from vendors" },
    } as never);
    expect(runReadOnlyQuery).toHaveBeenCalledWith(pg.secret, "select id, name from vendors");
    expect(out.integrationId).toBe("pg-1");
    expect(out.result).toMatchObject({ tool_use_id: "tu_1" });
    expect(String(out.result.content)).toContain("ParkMobile");
    expect(out.call).toMatchObject({ integration: "dash", ok: true, summary: "1 row" });
  });

  it("turns failures into error results the model can read", async () => {
    runReadOnlyQuery.mockImplementation(async () => {
      throw new Error('relation "vendor" does not exist');
    });
    const kit = buildChatToolkit([pg])!;
    const out = await kit.execute({
      type: "tool_use",
      id: "tu_2",
      name: "query_dash",
      input: { sql: "select * from vendor" },
    } as never);
    expect(out.result.is_error).toBe(true);
    expect(String(out.result.content)).toContain("does not exist");
    expect(out.call.ok).toBe(false);
  });
});

describe("mcpCallsFromContent", () => {
  it("pairs MCP tool uses with their results", () => {
    const calls = mcpCallsFromContent([
      { type: "mcp_tool_use", id: "m1", name: "search_issues", server_name: "linear", input: { q: "x" } },
      { type: "mcp_tool_result", tool_use_id: "m1", is_error: false, content: "hello" },
    ] as never);
    expect(calls).toEqual([
      {
        integration: "linear",
        tool: "search_issues",
        input: { q: "x" },
        ok: true,
        summary: "5 chars returned",
      },
    ]);
  });
});
