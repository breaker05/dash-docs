import { describe, expect, it } from "vitest";
import { chunkOpenApi } from "./openapi-chunk";

const spec = {
  openapi: "3.0.1",
  info: { title: "Orders API", version: "2.1", description: "Manage orders." },
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/orders": {
      get: {
        summary: "List orders",
        tags: ["Orders"],
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string" }, description: "Filter by status" },
        ],
        responses: {
          "200": {
            description: "A page of orders",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
          },
        },
      },
      post: {
        summary: "Create an order",
        operationId: "createOrder",
        tags: ["Orders"],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/orders/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      delete: { summary: "Delete an order", responses: { "204": { description: "Gone" } } },
    },
  },
  components: {
    schemas: {
      Order: {
        type: "object",
        required: ["id", "total"],
        properties: {
          id: { type: "string", description: "Unique order id" },
          total: { type: "number", format: "float" },
          items: { type: "array", items: { $ref: "#/components/schemas/LineItem" } },
        },
      },
      LineItem: {
        type: "object",
        properties: { sku: { type: "string" }, qty: { type: "integer" } },
      },
    },
  },
};

describe("chunkOpenApi", () => {
  it("returns null for non-spec JSON and for non-JSON", () => {
    expect(chunkOpenApi('{"foo": "bar"}')).toBeNull();
    expect(chunkOpenApi("not json at all")).toBeNull();
    expect(chunkOpenApi(JSON.stringify({ openapi: "3.0.0" }))).toBeNull(); // no paths
  });

  it("emits one chunk per operation, keyed by method + path", () => {
    const chunks = chunkOpenApi(JSON.stringify(spec))!;
    expect(chunks).not.toBeNull();
    const get = chunks.find((c) => c.startsWith("GET /orders\n"));
    const post = chunks.find((c) => c.startsWith("POST /orders\n"));
    const del = chunks.find((c) => c.startsWith("DELETE /orders/{id}\n"));
    expect(get).toBeTruthy();
    expect(post).toBeTruthy();
    expect(del).toBeTruthy();
    expect(get).toContain("status (query)");
    expect(post).toContain("Operation ID: createOrder");
    expect(post).toContain("Request body: Order");
  });

  it("merges path-level parameters into each operation", () => {
    const chunks = chunkOpenApi(JSON.stringify(spec))!;
    const del = chunks.find((c) => c.startsWith("DELETE /orders/{id}\n"))!;
    expect(del).toContain("id (path) [required]");
  });

  it("emits a schema chunk per named schema with its fields", () => {
    const chunks = chunkOpenApi(JSON.stringify(spec))!;
    const order = chunks.find((c) => c.startsWith("Schema: Order\n"))!;
    expect(order).toContain("id [required]: string");
    expect(order).toContain("total [required]: number<float>");
    expect(order).toContain("items: array of LineItem");
    expect(chunks.some((c) => c.startsWith("Schema: LineItem\n"))).toBe(true);
  });

  it("emits an overview chunk mapping every endpoint", () => {
    const chunks = chunkOpenApi(JSON.stringify(spec))!;
    const overview = chunks.find((c) => c.includes("Orders API"))!;
    expect(overview).toContain("Servers: https://api.example.com/v1");
    expect(overview).toContain("- GET /orders — List orders");
    expect(overview).toContain("- DELETE /orders/{id} — Delete an order");
  });

  it("supports Swagger 2.0 definitions and body/host conventions", () => {
    const swagger = {
      swagger: "2.0",
      info: { title: "Legacy", version: "1" },
      host: "api.legacy.com",
      basePath: "/v2",
      schemes: ["https"],
      paths: {
        "/widgets": {
          post: {
            summary: "Add widget",
            parameters: [{ name: "body", in: "body", schema: { $ref: "#/definitions/Widget" } }],
            responses: { "200": { description: "ok", schema: { $ref: "#/definitions/Widget" } } },
          },
        },
      },
      definitions: { Widget: { type: "object", properties: { color: { type: "string" } } } },
    };
    const chunks = chunkOpenApi(JSON.stringify(swagger))!;
    expect(chunks.some((c) => c.includes("Servers: https://api.legacy.com/v2"))).toBe(true);
    const post = chunks.find((c) => c.startsWith("POST /widgets\n"))!;
    expect(post).toContain("Request body: Widget");
    expect(post).toContain("200: ok — Widget");
    expect(chunks.some((c) => c.startsWith("Schema: Widget\n"))).toBe(true);
  });
});
