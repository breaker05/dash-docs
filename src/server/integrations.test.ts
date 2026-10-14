import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { integrations, users } from "@/db/schema";
import {
  createIntegration,
  deleteIntegration,
  listIntegrations,
  loadChatIntegrations,
  markIntegrationsUsed,
  normalizeIntegrationName,
  parseToolList,
  updateIntegration,
} from "./integrations";

let db: Db;
let close: () => Promise<void>;
let userId: string;
const savedSecret = process.env.INTEGRATIONS_SECRET;

const CONN = "postgresql://docs_reader:s3cret-pw@db.example.com/dash?sslmode=require";

beforeEach(async () => {
  process.env.INTEGRATIONS_SECRET = "integration-test-secret";
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "admin@dashmarketing.io", role: "admin" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
  process.env.INTEGRATIONS_SECRET = savedSecret;
});

describe("integrations", () => {
  it("normalizes names and tool lists", () => {
    expect(normalizeIntegrationName("  Dash Platform ")).toBe("dash_platform");
    expect(parseToolList("a, b  c,,a")).toEqual(["a", "b", "c"]);
  });

  it("stores the credential encrypted and lists a safe hint", async () => {
    await createIntegration(db, {
      name: "Dash",
      kind: "postgres",
      description: "Dash platform data",
      secret: CONN,
      userId,
    });
    const [raw] = await db.select().from(integrations);
    expect(raw.name).toBe("dash");
    expect(raw.secretEnc).not.toContain("s3cret-pw");
    const [row] = await listIntegrations(db);
    expect(row).not.toHaveProperty("secretEnc");
    expect(row.secretHint).toBe("docs_reader@db.example.com/dash");
    expect(row.secretHint).not.toContain("s3cret");
  });

  it("validates kind-specific input", async () => {
    await expect(
      createIntegration(db, { name: "x", kind: "postgres", description: "", secret: CONN, userId }),
    ).rejects.toThrow(/Name must/);
    await expect(
      createIntegration(db, { name: "dash", kind: "postgres", description: "", secret: "mysql://x", userId }),
    ).rejects.toThrow(/postgres:\/\//);
    await expect(
      createIntegration(db, {
        name: "linear",
        kind: "mcp",
        description: "",
        secret: "tok",
        url: "http://insecure.example.com/mcp",
        userId,
      }),
    ).rejects.toThrow(/https/);
    await createIntegration(db, { name: "dash", kind: "postgres", description: "", secret: CONN, userId });
    await expect(
      createIntegration(db, { name: "dash", kind: "postgres", description: "", secret: CONN, userId }),
    ).rejects.toThrow(/already exists/);
  });

  it("loads only enabled integrations, decrypted, for the chat", async () => {
    const pgId = await createIntegration(db, {
      name: "dash",
      kind: "postgres",
      description: "vendors etc",
      secret: CONN,
      userId,
    });
    const mcpId = await createIntegration(db, {
      name: "linear",
      kind: "mcp",
      description: "issues",
      secret: "bearer-token",
      url: "https://mcp.example.com/mcp",
      allowedTools: ["search_issues", "search_issues"],
      userId,
    });
    await updateIntegration(db, mcpId, { enabled: false });
    let chat = await loadChatIntegrations(db);
    expect(chat.map((c) => c.name)).toEqual(["dash"]);
    expect(chat[0].secret).toBe(CONN);

    await updateIntegration(db, mcpId, { enabled: true });
    chat = await loadChatIntegrations(db);
    const linear = chat.find((c) => c.name === "linear")!;
    expect(linear.allowedTools).toEqual(["search_issues"]);
    expect(linear.secret).toBe("bearer-token");

    await markIntegrationsUsed(db, [pgId]);
    const [used] = await db.select().from(integrations).where(eq(integrations.id, pgId));
    expect(used.lastUsedAt).not.toBeNull();
  });

  it("keeps the credential when an update leaves it blank, replaces it otherwise", async () => {
    const id = await createIntegration(db, { name: "dash", kind: "postgres", description: "", secret: CONN, userId });
    await updateIntegration(db, id, { description: "new", secret: "  " });
    let [c] = await loadChatIntegrations(db);
    expect(c.secret).toBe(CONN);
    expect(c.description).toBe("new");
    await updateIntegration(db, id, { secret: "postgres://other@h/db" });
    [c] = await loadChatIntegrations(db);
    expect(c.secret).toBe("postgres://other@h/db");
  });

  it("skips rows whose credential can't be decrypted", async () => {
    await createIntegration(db, { name: "dash", kind: "postgres", description: "", secret: CONN, userId });
    process.env.INTEGRATIONS_SECRET = "rotated";
    expect(await loadChatIntegrations(db)).toEqual([]);
    const [row] = await listIntegrations(db);
    expect(row.secretHint).toMatch(/unreadable/);
  });

  it("deletes", async () => {
    const id = await createIntegration(db, { name: "dash", kind: "postgres", description: "", secret: CONN, userId });
    await deleteIntegration(db, id);
    expect(await listIntegrations(db)).toEqual([]);
  });
});
