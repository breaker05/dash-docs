import { Bot, FileCode, ListTree, Search, Sparkles } from "lucide-react";
import { CopyButton } from "@/components/public/copy-button";
import { siteUrl } from "@/lib/site-url";

export const metadata = {
  title: "Connect an AI assistant — Dash Marketing Docs",
  description:
    "Use the Dash Marketing docs from Claude, Cursor, ChatGPT, or any MCP client.",
};

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex h-9 items-center justify-between border-b bg-muted/40 pl-4 pr-1.5">
        <span className="font-mono text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto p-4 text-[0.82rem] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

const TOOLS = [
  {
    icon: Search,
    name: "search_docs",
    description:
      "Full-text search across every published page, including code samples and endpoint paths.",
  },
  {
    icon: FileCode,
    name: "get_page",
    description: "Fetch a page's complete content as markdown by its path.",
  },
  {
    icon: ListTree,
    name: "list_pages",
    description: "List all published pages as a tree of titles and paths.",
  },
];

export default function McpPage() {
  const site = siteUrl();
  const endpoint = `${site}/api/mcp`;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          For AI assistants
        </p>
      </div>
      <h1 className="mb-3 text-[1.9rem] font-bold leading-tight tracking-tight">
        Use these docs from Claude, Cursor, or any MCP client
      </h1>
      <p className="mb-8 text-[0.98rem] leading-relaxed text-muted-foreground">
        This site runs a public, read-only{" "}
        <a
          href="https://modelcontextprotocol.io"
          className="text-primary hover:underline"
        >
          Model Context Protocol
        </a>{" "}
        server. Connect it once and your AI assistant can search and read every
        published page — so it answers questions about the Dash Marketing API
        with current, first-party information instead of guesses.
      </p>

      <div className="space-y-6">
        <Snippet label="MCP endpoint" text={endpoint} />
        <Snippet
          label="Claude Code"
          text={`claude mcp add --transport http dash-docs ${endpoint}`}
        />
        <Snippet
          label="Cursor · mcp.json"
          text={`{\n  "mcpServers": {\n    "dash-docs": { "url": "${endpoint}" }\n  }\n}`}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          In <strong>Claude.ai</strong> or <strong>Claude Desktop</strong>, add
          it under Settings → Connectors → Add custom connector using the
          endpoint URL above. Most other MCP-capable tools accept the same URL
          as a remote HTTP server.
        </p>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold tracking-tight">
        Available tools
      </h2>
      <ul className="space-y-2.5">
        {TOOLS.map((tool) => (
          <li key={tool.name} className="flex gap-3 rounded-xl border p-4">
            <tool.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-mono text-sm font-semibold">{tool.name}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 mt-10 text-lg font-semibold tracking-tight">
        Prefer plain files?
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        <Bot className="mr-1.5 inline size-4 align-text-bottom text-primary" />
        No MCP needed: every page is also available as raw markdown — append{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">.md</code>{" "}
        to any page URL — and{" "}
        <a href={`${site}/llms.txt`} className="text-primary hover:underline">
          /llms.txt
        </a>{" "}
        indexes everything for tools that discover docs automatically.
        There&apos;s also a “Copy for LLM” action on every page, and the
        “Ask AI” chat in the corner answers questions with cited sources.
      </p>
      <h2 className="mb-3 mt-10 text-lg font-semibold tracking-tight">
        Team access to internal docs
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
        Internal team systems (chatbots, Claude Code, skills) can read
        internal published pages through the same MCP server by sending an
        API key — an admin can mint one under{" "}
        <span className="font-medium text-foreground">Admin → Settings</span>:
      </p>
      <pre className="mb-4 overflow-x-auto rounded-xl border bg-muted/50 p-4 text-xs leading-relaxed">
        {`claude mcp add --transport http dashdocs ${site}/api/mcp \\
  --header "Authorization: Bearer dashdocs_…"`}
      </pre>
      <p className="text-xs text-muted-foreground">
        Without a key, the MCP server only exposes published, public pages —
        never drafts or internal content. Invalid keys are rejected rather
        than downgraded.
      </p>
    </div>
  );
}
