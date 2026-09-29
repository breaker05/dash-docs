import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { pages, users } from "@/db/schema";
import { createApiKey } from "@/server/api-keys";

// route handler end-to-end over MCP JSON-RPC, against the PGlite test DB
const state = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("./route");

let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  let db: Db;
  ({ db, close } = await createTestDb());
  state.db = db;
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io", role: "admin" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
});

async function rpc(
  method: string,
  params: Record<string, unknown>,
  token?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSON-RPC payloads
): Promise<{ status: number; body: any }> {
  const res = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const data = text.startsWith("{")
    ? text
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5))
        .join("");
  return { status: res.status, body: data ? JSON.parse(data) : null };
}

const toolNames = async (token?: string) =>
  (await rpc("tools/list", {}, token)).body.result.tools.map(
    (t: { name: string }) => t.name,
  );

describe("MCP authoring tools", () => {
  it("are only exposed to write-enabled keys", async () => {
    const { token: read } = await createApiKey(state.db, { name: "r", userId });
    const { token: write } = await createApiKey(state.db, {
      name: "w",
      userId,
      canWrite: true,
    });
    expect(await toolNames()).not.toContain("create_page");
    expect(await toolNames(read)).not.toContain("create_page");
    expect(await toolNames(write)).toEqual(
      expect.arrayContaining([
        "search_docs",
        "list_page_tree",
        "get_draft",
        "create_page",
        "update_page",
        "upload_image",
        "get_authoring_guide",
      ]),
    );
  });

  it("sends the authoring workflow and document_code prompt to writers", async () => {
    const { token } = await createApiKey(state.db, {
      name: "w",
      userId,
      canWrite: true,
    });
    const init = await rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
      token,
    );
    expect(init.body.result.instructions).toMatch(/list_page_tree/);
    const prompts = await rpc("prompts/list", {}, token);
    expect(prompts.body.result.prompts.map((p: { name: string }) => p.name)).toContain(
      "document_code",
    );
  });

  it("creates and updates drafts attributed to the key owner", async () => {
    const { token } = await createApiKey(state.db, {
      name: "w",
      userId,
      canWrite: true,
    });
    const created = await rpc(
      "tools/call",
      {
        name: "create_page",
        arguments: { title: "Webhooks", content: "Intro.", visibility: "internal" },
      },
      token,
    );
    const text: string = created.body.result.content[0].text;
    expect(created.body.result.isError).toBeFalsy();
    expect(text).toContain("path: webhooks");
    expect(text).toContain("/admin/pages/");

    const draft = await rpc(
      "tools/call",
      { name: "get_draft", arguments: { path: "webhooks" } },
      token,
    );
    const stamp = draft.body.result.content[0].text.match(
      /draftUpdatedAt: (\S+)/,
    )[1];

    const updated = await rpc(
      "tools/call",
      {
        name: "update_page",
        arguments: { path: "webhooks", content: "New intro.", expectedDraftUpdatedAt: stamp },
      },
      token,
    );
    expect(updated.body.result.isError).toBeFalsy();

    const [row] = await state.db.select().from(pages);
    expect(row).toMatchObject({
      contentMd: "New intro.",
      publishedContentMd: null,
      effectiveVisibility: "internal",
      updatedBy: userId,
    });

    const tree = await rpc("tools/call", { name: "list_page_tree", arguments: {} }, token);
    expect(tree.body.result.content[0].text).toBe(
      "- Webhooks (webhooks) [draft, internal]",
    );
  });

  it("returns actionable tool errors", async () => {
    const { token } = await createApiKey(state.db, {
      name: "w",
      userId,
      canWrite: true,
    });
    const res = await rpc(
      "tools/call",
      {
        name: "create_page",
        arguments: { title: "X", content: "", parentPath: "missing" },
      },
      token,
    );
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toMatch(/list_page_tree/);
  });
});
