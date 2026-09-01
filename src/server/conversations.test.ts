import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import {
  addMessage,
  conversationForRequest,
  createConversation,
  deleteConversation,
  deleteUserConversation,
  getConversation,
  getUserConversation,
  listAllConversations,
  listUserConversations,
  loadConversationHistory,
} from "./conversations";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: "u1", email: "alice@dashmarketing.io", name: "Alice", role: "editor" },
    { id: "u2", email: "bob@dashmarketing.io", name: "Bob", role: "editor" },
  ]);
});

afterEach(async () => {
  await close();
});

const base = {
  model: "claude-sonnet-5",
  effort: "low",
  includeInternal: false,
};

describe("createConversation", () => {
  it("derives a truncated title from the first question and stores the snapshot", async () => {
    const longQ = "How do I ".concat("x".repeat(200));
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      includeInternal: true,
      firstQuestion: longQ,
    });

    const found = await getConversation(db, id);
    expect(found).not.toBeNull();
    expect(found!.conversation.title!.length).toBeLessThanOrEqual(80);
    expect(found!.conversation.title!.startsWith("How do I")).toBe(true);
    expect(found!.conversation.userId).toBe("u1");
    expect(found!.conversation.model).toBe("claude-sonnet-5");
    expect(found!.conversation.includeInternal).toBe(true);
  });

  it("allows an anonymous conversation (null user)", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "what is rate limiting",
    });
    const found = await getConversation(db, id);
    expect(found!.conversation.userId).toBeNull();
  });
});

describe("addMessage / loadConversationHistory", () => {
  it("returns turns in chronological order", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "first",
    });
    await addMessage(db, { conversationId: id, role: "user", content: "first" });
    await addMessage(db, {
      conversationId: id,
      role: "assistant",
      content: "an answer",
      sources: [{ n: 1, title: "Rate limits", path: "api/limits", kind: "page" }],
    });
    await addMessage(db, {
      conversationId: id,
      role: "user",
      content: "follow up",
    });

    const history = await loadConversationHistory(db, id);
    expect(history).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "an answer" },
      { role: "user", content: "follow up" },
    ]);
  });

  it("bumps lastMessageAt when a message is added", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "q",
    });
    const before = (await getConversation(db, id))!.conversation.lastMessageAt;
    await new Promise((r) => setTimeout(r, 10));
    await addMessage(db, { conversationId: id, role: "user", content: "q" });
    const after = (await getConversation(db, id))!.conversation.lastMessageAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("conversationForRequest", () => {
  it("lets the owner continue their conversation", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "q",
    });
    const row = await conversationForRequest(db, {
      conversationId: id,
      userId: "u1",
    });
    expect(row?.id).toBe(id);
  });

  it("rejects a different member continuing someone else's conversation", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "q",
    });
    const row = await conversationForRequest(db, {
      conversationId: id,
      userId: "u2",
    });
    expect(row).toBeNull();
  });

  it("lets anyone holding the id continue an anonymous conversation", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "q",
    });
    const row = await conversationForRequest(db, {
      conversationId: id,
      userId: null,
    });
    expect(row?.id).toBe(id);
  });

  it("returns null for an unknown id", async () => {
    const row = await conversationForRequest(db, {
      conversationId: "00000000-0000-0000-0000-000000000000",
      userId: "u1",
    });
    expect(row).toBeNull();
  });
});

describe("user-facing history (signed-in, own-only)", () => {
  it("lists only the user's own conversations, newest first", async () => {
    const a = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "older",
    });
    await new Promise((r) => setTimeout(r, 10));
    const b = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "newer",
    });
    await createConversation(db, {
      ...base,
      userId: "u2",
      firstQuestion: "bob's",
    });
    await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "anon",
    });

    const list = await listUserConversations(db, "u1");
    expect(list.map((c) => c.id)).toEqual([b, a]);
  });

  it("returns a conversation with messages for the owner", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "q",
    });
    await addMessage(db, { conversationId: id, role: "user", content: "q" });
    const got = await getUserConversation(db, { userId: "u1", conversationId: id });
    expect(got!.messages).toHaveLength(1);
  });

  it("returns null when a user requests another user's conversation", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "q",
    });
    const got = await getUserConversation(db, { userId: "u2", conversationId: id });
    expect(got).toBeNull();
  });

  it("deletes only the user's own conversation", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "q",
    });
    expect(
      await deleteUserConversation(db, { userId: "u2", conversationId: id }),
    ).toBe(false);
    expect(
      await deleteUserConversation(db, { userId: "u1", conversationId: id }),
    ).toBe(true);
    expect(await getConversation(db, id)).toBeNull();
  });
});

describe("admin review", () => {
  it("filters by audience and includes email + message count", async () => {
    const signedIn = await createConversation(db, {
      ...base,
      userId: "u1",
      firstQuestion: "signed in question",
    });
    await addMessage(db, {
      conversationId: signedIn,
      role: "user",
      content: "signed in question",
    });
    await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "anon question",
    });

    const all = await listAllConversations(db, {});
    expect(all).toHaveLength(2);

    const onlyUser = await listAllConversations(db, { audience: "user" });
    expect(onlyUser).toHaveLength(1);
    expect(onlyUser[0].userEmail).toBe("alice@dashmarketing.io");
    expect(onlyUser[0].messageCount).toBe(1);

    const onlyAnon = await listAllConversations(db, { audience: "anon" });
    expect(onlyAnon).toHaveLength(1);
    expect(onlyAnon[0].userEmail).toBeNull();
  });

  it("searches titles", async () => {
    await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "rate limiting details",
    });
    await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "importing customers",
    });
    const hits = await listAllConversations(db, { q: "rate" });
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toContain("rate");
  });

  it("deletes any conversation and cascades its messages", async () => {
    const id = await createConversation(db, {
      ...base,
      userId: null,
      firstQuestion: "q",
    });
    await addMessage(db, { conversationId: id, role: "user", content: "q" });
    expect(await deleteConversation(db, id)).toBe(true);
    expect(await getConversation(db, id)).toBeNull();
  });
});
