import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  getEmbeddingProvider,
} from "./embeddings";

const KEY = "VOYAGE_API_KEY";

afterEach(() => {
  delete process.env[KEY];
  vi.restoreAllMocks();
});

describe("getEmbeddingProvider", () => {
  it("returns null when no provider key is set", () => {
    delete process.env[KEY];
    expect(getEmbeddingProvider()).toBeNull();
  });

  it("returns the Voyage provider when VOYAGE_API_KEY is set", () => {
    process.env[KEY] = "test-key";
    const provider = getEmbeddingProvider();
    expect(provider).not.toBeNull();
    expect(provider!.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });
});

describe("Voyage provider embed()", () => {
  it("posts to the Voyage API and returns one vector per input, in input order", async () => {
    process.env[KEY] = "test-key";
    // Voyage may return items out of order; each carries its own `index`.
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.4, 0.5, 0.6] },
            { index: 0, embedding: [0.1, 0.2, 0.3] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = getEmbeddingProvider()!;
    const vectors = await provider.embed(["first", "second"]);

    expect(vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("voyageai.com");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    const body = JSON.parse(init!.body as string);
    expect(body.input).toEqual(["first", "second"]);
  });

  it("throws on a non-OK response so a bad upload/backfill fails loudly", async () => {
    process.env[KEY] = "test-key";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    const provider = getEmbeddingProvider()!;
    await expect(provider.embed(["x"])).rejects.toThrow();
  });
});
