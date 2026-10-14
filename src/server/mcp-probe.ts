/**
 * Minimal MCP (Streamable HTTP) client used only by the admin "Test" button:
 * initialize → tools/list, so an admin can confirm the URL + token work and
 * see the tool names to allowlist. The chat itself never uses this — the
 * Claude API's MCP connector talks to the server directly.
 */

const TIMEOUT_MS = 10_000;

type JsonRpcResponse = {
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

async function rpc(
  url: string,
  token: string,
  body: Record<string, unknown>,
  sessionId: string | null,
): Promise<{ message: JsonRpcResponse | null; sessionId: string | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`The server rejected the token (HTTP ${res.status})`);
  }
  if (!res.ok && res.status !== 202) {
    throw new Error(`HTTP ${res.status} from the MCP server`);
  }
  const nextSession = res.headers.get("mcp-session-id") ?? sessionId;
  if (!("id" in body)) return { message: null, sessionId: nextSession };
  const text = await res.text();
  const type = res.headers.get("content-type") ?? "";
  // SSE responses carry the JSON-RPC message in a data: line
  const candidates = type.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
    : [text];
  for (const c of candidates) {
    try {
      const msg = JSON.parse(c) as JsonRpcResponse;
      if (msg.id === body.id) {
        if (msg.error) throw new Error(msg.error.message ?? "MCP error");
        return { message: msg, sessionId: nextSession };
      }
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
  }
  throw new Error("The server didn't return a JSON-RPC response");
}

export async function probeMcpServer(
  url: string,
  token: string,
): Promise<{ serverName: string; tools: string[] }> {
  const init = await rpc(
    url,
    token,
    {
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "dash-docs", version: "1.0" },
      },
    },
    null,
  );
  const info = init.message?.result?.serverInfo as { name?: string } | undefined;
  await rpc(url, token, { method: "notifications/initialized" }, init.sessionId);
  const list = await rpc(
    url,
    token,
    { id: 2, method: "tools/list", params: {} },
    init.sessionId,
  );
  const tools = (list.message?.result?.tools as { name: string }[] | undefined) ?? [];
  return {
    serverName: info?.name ?? "MCP server",
    tools: tools.map((t) => t.name).sort(),
  };
}
