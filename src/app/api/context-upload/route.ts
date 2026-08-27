import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  createContextDoc,
  MAX_CONTEXT_DOC_BYTES,
} from "@/server/context-docs";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = /\.(json|ya?ml|md|txt|csv|xml)$/i;

/** Admin upload of AI context files — text stored in the DB, not Blob. */
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = await checkRateLimit(db, {
    key: `context-upload:ip:${requestIp(request)}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);

  const form = await request.formData();
  const file = form.get("file");
  const name = form.get("name");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    return NextResponse.json(
      { error: "Text files only: .json .yaml .yml .md .txt .csv .xml" },
      { status: 415 },
    );
  }
  if (file.size > MAX_CONTEXT_DOC_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 2MB)" },
      { status: 413 },
    );
  }

  try {
    const content = await file.text();
    const result = await createContextDoc(db, {
      name: typeof name === "string" && name.trim() !== "" ? name : file.name,
      filename: file.name,
      contentType: file.type || "text/plain",
      content,
      userId: session.user.id!,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
