import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { verifyApiKey } from "@/server/api-keys";
import { resolveImageType, storeImage, UploadError } from "@/server/uploads";

export const runtime = "nodejs";

/**
 * Who is uploading: a signed-in editor (the editor's drag/paste/toolbar), or
 * a write-enabled API key (Claude Code / scripts: `curl -F file=@shot.png
 * -H "Authorization: Bearer dashdocs_…"`). Returns the user id to attribute,
 * undefined when unauthorized.
 */
async function uploader(request: Request): Promise<string | null | undefined> {
  const header = request.headers.get("authorization");
  if (header) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    const key = match ? await verifyApiKey(db, match[1].trim()) : null;
    return key?.canWrite ? key.createdBy : undefined;
  }
  const session = await auth();
  return session?.user?.id ?? undefined;
}

export async function POST(request: Request) {
  const userId = await uploader(request);
  if (userId === undefined) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const { url } = await storeImage(db, {
      bytes: file,
      filename: file.name,
      contentType: resolveImageType(file.type, file.name),
      userId,
    });
    return NextResponse.json({ url, markdown: `![](${url})` });
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
