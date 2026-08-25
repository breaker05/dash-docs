import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Raw markdown for a published page — the machine-readable view used by
 * "View as Markdown", the open-in-LLM links, and llms.txt consumers.
 * Pretty URLs like /lead-submission-api.md redirect here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const path = slug.map(decodeURIComponent).join("/");

  const [page] = await db.select().from(pages).where(eq(pages.path, path));
  if (!page || page.publishedContentMd === null) {
    return new Response("Not found", { status: 404 });
  }
  if (page.effectiveVisibility === "internal") {
    const session = await auth();
    if (!session?.user) return new Response("Not found", { status: 404 });
  }

  const site = siteUrl();
  const body = `# ${page.publishedTitle}\n\nSource: ${site}/${page.path}\n\n${page.publishedContentMd}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "inline",
    },
  });
}
