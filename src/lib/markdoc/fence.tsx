import { codeToHtml } from "shiki";
import { CopyButton } from "@/components/public/copy-button";

export async function Fence({
  content,
  language,
}: {
  content: string;
  language?: string;
}) {
  const code = content.replace(/\n$/, "");
  let html: string;
  try {
    html = await codeToHtml(code, {
      lang: language || "text",
      theme: "github-light",
    });
  } catch {
    // unknown language — plain block
    html = await codeToHtml(code, { lang: "text", theme: "github-light" });
  }
  return (
    <div className="markdoc-fence not-prose group relative my-5 overflow-hidden rounded-xl border bg-[#fafafa]">
      <div className="flex h-9 items-center justify-between border-b bg-muted/40 pl-4 pr-1.5">
        <span className="font-mono text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
          {language || "code"}
        </span>
        <CopyButton text={code} />
      </div>
      <div
        className="overflow-x-auto text-[0.85rem] leading-relaxed [&_pre]:m-0 [&_pre]:!bg-transparent [&_pre]:p-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
