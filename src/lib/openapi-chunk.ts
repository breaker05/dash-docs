import { chunkText } from "./chunk-text";

/**
 * Endpoint-aware chunking for OpenAPI / Swagger specs (JSON only).
 *
 * The generic character-based `chunkText` splits a spec at arbitrary byte
 * offsets, so an endpoint's path, its parameters, and its response schema
 * scatter across unrelated chunks and full-text retrieval rarely lands a
 * coherent hit. This parses the spec and emits one readable chunk per
 * operation (plus one per named schema and an overview), so a keyword like
 * `POST /orders` or a field name matches a single self-contained chunk.
 *
 * Returns null when the content is not a JSON object that looks like an
 * OpenAPI 3 (`openapi`) or Swagger 2 (`swagger`) spec — the caller then
 * falls back to `chunkText`. YAML specs (no JSON.parse) fall back too.
 */
export function chunkOpenApi(content: string): string[] | null {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(doc)) return null;
  const isOpenApi = typeof doc.openapi === "string";
  const isSwagger = typeof doc.swagger === "string";
  if (!isOpenApi && !isSwagger) return null;
  const paths = doc.paths;
  if (!isRecord(paths)) return null;

  const chunks: string[] = [];
  const push = (header: string, body: string) => {
    const text = `${header}\n${body}`.trim();
    if (text === "") return;
    if (text.length <= TARGET_SIZE) {
      chunks.push(text);
      return;
    }
    // A single oversized block (huge description or schema) still needs to
    // fit retrieval chunks — split it but repeat the header on every piece
    // so each remains identifiable.
    for (const piece of chunkText(body, { size: TARGET_SIZE - header.length - 1 })) {
      chunks.push(`${header}\n${piece}`.trim());
    }
  };

  // Overview: title, version, servers, and a map of every operation so
  // "list the endpoints" style questions have somewhere to land.
  push(specTitle(doc), overviewBody(doc, paths));

  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    const sharedParams = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op)) continue;
      const header = `${method.toUpperCase()} ${path}`;
      push(header, operationBody(op, sharedParams, doc));
    }
  }

  for (const [name, schema] of Object.entries(namedSchemas(doc))) {
    if (!isRecord(schema)) continue;
    push(`Schema: ${name}`, schemaBody(schema, doc));
  }

  return chunks.length > 0 ? chunks : null;
}

const TARGET_SIZE = 3500;
const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

function specTitle(doc: Record<string, unknown>): string {
  const info = isRecord(doc.info) ? doc.info : {};
  const title = typeof info.title === "string" ? info.title : "API";
  const version = typeof info.version === "string" ? ` v${info.version}` : "";
  return `${title}${version} — API reference`;
}

function overviewBody(
  doc: Record<string, unknown>,
  paths: Record<string, unknown>,
): string {
  const lines: string[] = [];
  const info = isRecord(doc.info) ? doc.info : {};
  if (typeof info.description === "string" && info.description.trim() !== "") {
    lines.push(info.description.trim());
  }
  const servers = specServers(doc);
  if (servers.length > 0) lines.push(`Servers: ${servers.join(", ")}`);
  lines.push("", "Endpoints:");
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op)) continue;
      const summary =
        typeof op.summary === "string"
          ? op.summary
          : typeof op.description === "string"
            ? firstLine(op.description)
            : "";
      lines.push(`- ${method.toUpperCase()} ${path}${summary ? ` — ${summary}` : ""}`);
    }
  }
  return lines.join("\n");
}

function specServers(doc: Record<string, unknown>): string[] {
  if (Array.isArray(doc.servers)) {
    return doc.servers
      .map((s) => (isRecord(s) && typeof s.url === "string" ? s.url : null))
      .filter((u): u is string => u !== null);
  }
  // Swagger 2: host + basePath + schemes
  if (typeof doc.host === "string") {
    const scheme = Array.isArray(doc.schemes) && typeof doc.schemes[0] === "string"
      ? doc.schemes[0]
      : "https";
    const basePath = typeof doc.basePath === "string" ? doc.basePath : "";
    return [`${scheme}://${doc.host}${basePath}`];
  }
  return [];
}

function operationBody(
  op: Record<string, unknown>,
  sharedParams: unknown[],
  doc: Record<string, unknown>,
): string {
  const lines: string[] = [];
  if (typeof op.summary === "string" && op.summary.trim() !== "") {
    lines.push(`Summary: ${op.summary.trim()}`);
  }
  if (typeof op.operationId === "string") {
    lines.push(`Operation ID: ${op.operationId}`);
  }
  if (Array.isArray(op.tags) && op.tags.length > 0) {
    lines.push(`Tags: ${op.tags.filter((t) => typeof t === "string").join(", ")}`);
  }
  if (typeof op.description === "string" && op.description.trim() !== "") {
    lines.push(`Description: ${op.description.trim()}`);
  }

  const params = [
    ...sharedParams,
    ...(Array.isArray(op.parameters) ? op.parameters : []),
  ].map((p) => deref(p, doc));
  const rendered = params.filter(isRecord).map((p) => renderParam(p, doc));
  if (rendered.length > 0) {
    lines.push("Parameters:", ...rendered);
  }

  const requestBody = renderRequestBody(op, doc);
  if (requestBody) lines.push(requestBody);

  const responses = renderResponses(op, doc);
  if (responses.length > 0) lines.push("Responses:", ...responses);

  return lines.join("\n");
}

function renderParam(p: Record<string, unknown>, doc: Record<string, unknown>): string {
  const name = typeof p.name === "string" ? p.name : "?";
  const location = typeof p.in === "string" ? ` (${p.in})` : "";
  const required = p.required === true ? " [required]" : "";
  // OpenAPI 3 nests type under schema; Swagger 2 puts it on the parameter.
  const schema = isRecord(p.schema) ? p.schema : p;
  const type = schemaType(schema, doc);
  const desc = typeof p.description === "string" ? ` — ${firstLine(p.description)}` : "";
  return `- ${name}${location}${required}: ${type}${desc}`;
}

function renderRequestBody(
  op: Record<string, unknown>,
  doc: Record<string, unknown>,
): string | null {
  // OpenAPI 3: requestBody.content[mediaType].schema — with fallbacks for
  // specs that hang a schema (or bare properties) directly off requestBody.
  if (isRecord(op.requestBody)) {
    const body = deref(op.requestBody, doc);
    if (isRecord(body)) {
      const schema = isRecord(body.content)
        ? firstMediaSchema(body.content)
        : isRecord(body.schema)
          ? body.schema
          : isRecord(body.properties)
            ? body
            : undefined;
      if (schema) return `Request body: ${schemaType(schema, doc)}`;
    }
  }
  // Swagger 2: a parameter with in="body"
  const params = Array.isArray(op.parameters) ? op.parameters : [];
  for (const raw of params) {
    const p = deref(raw, doc);
    if (isRecord(p) && p.in === "body" && isRecord(p.schema)) {
      return `Request body: ${schemaType(p.schema, doc)}`;
    }
  }
  return null;
}

function renderResponses(
  op: Record<string, unknown>,
  doc: Record<string, unknown>,
): string[] {
  if (!isRecord(op.responses)) return [];
  const out: string[] = [];
  for (const [code, raw] of Object.entries(op.responses)) {
    const res = deref(raw, doc);
    if (!isRecord(res)) continue;
    const desc = typeof res.description === "string" ? res.description : "";
    // OpenAPI 3: content[mediaType].schema; Swagger 2: res.schema
    let schema: unknown = isRecord(res.content)
      ? firstMediaSchema(res.content)
      : undefined;
    if (!schema && "schema" in res) schema = res.schema;
    const shape = schema ? ` — ${schemaType(schema, doc)}` : "";
    out.push(`- ${code}: ${firstLine(desc)}${shape}`);
  }
  return out;
}

function schemaBody(schema: Record<string, unknown>, doc: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof schema.description === "string" && schema.description.trim() !== "") {
    lines.push(schema.description.trim());
  }
  const props = isRecord(schema.properties) ? schema.properties : null;
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((r) => typeof r === "string") : [],
  );
  if (props) {
    lines.push("Fields:");
    for (const [name, raw] of Object.entries(props)) {
      const field = deref(raw, doc);
      const type = isRecord(field) ? schemaType(field, doc) : "any";
      const req = required.has(name) ? " [required]" : "";
      const desc =
        isRecord(field) && typeof field.description === "string"
          ? ` — ${firstLine(field.description)}`
          : "";
      lines.push(`- ${name}${req}: ${type}${desc}`);
    }
  } else {
    lines.push(`Type: ${schemaType(schema, doc)}`);
  }
  return lines.join("\n");
}

/**
 * One-line type summary. `$ref`s resolve to the referenced name only (the
 * referenced schema is emitted as its own chunk, so its fields are indexed
 * there) — this keeps operation chunks compact and ref cycles impossible.
 */
function schemaType(schema: unknown, doc: Record<string, unknown>): string {
  if (!isRecord(schema)) return "any";
  if (typeof schema.$ref === "string") return refName(schema.$ref);
  if (Array.isArray(schema.allOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const key = schema.allOf ? "allOf" : schema.oneOf ? "oneOf" : "anyOf";
    const parts = (schema[key] as unknown[])
      .map((s) => schemaType(s, doc))
      .filter((p) => p !== "any");
    return parts.length > 0 ? parts.join(key === "allOf" ? " & " : " | ") : "object";
  }
  if (schema.type === "array") {
    return `array of ${schemaType(schema.items, doc)}`;
  }
  if (schema.type === "object" || isRecord(schema.properties)) {
    const props = isRecord(schema.properties) ? Object.keys(schema.properties) : [];
    return props.length > 0 ? `object { ${props.join(", ")} }` : "object";
  }
  if (Array.isArray(schema.enum)) {
    return `enum(${schema.enum.map((v) => String(v)).join(", ")})`;
  }
  if (typeof schema.type === "string") {
    return typeof schema.format === "string" ? `${schema.type}<${schema.format}>` : schema.type;
  }
  return "any";
}

/** Named schemas from OpenAPI 3 (components.schemas) or Swagger 2 (definitions). */
function namedSchemas(doc: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(doc.components) && isRecord(doc.components.schemas)) {
    return doc.components.schemas;
  }
  if (isRecord(doc.definitions)) return doc.definitions;
  return {};
}

function firstMediaSchema(content: Record<string, unknown>): unknown {
  for (const media of Object.values(content)) {
    if (isRecord(media) && "schema" in media) return media.schema;
  }
  return undefined;
}

/** Resolve a single internal `$ref` (`#/a/b/c`); returns the input otherwise. */
function deref(value: unknown, doc: Record<string, unknown>): unknown {
  if (!isRecord(value) || typeof value.$ref !== "string") return value;
  const ref = value.$ref;
  if (!ref.startsWith("#/")) return value;
  let node: unknown = doc;
  for (const segment of ref.slice(2).split("/")) {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(node)) return value;
    node = node[key];
  }
  return node ?? value;
}

function refName(ref: string): string {
  const parts = ref.split("/");
  return parts[parts.length - 1] || ref;
}

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/)[0].trim();
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
