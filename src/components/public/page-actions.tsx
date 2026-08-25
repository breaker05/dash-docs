"use client";

import { useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCode,
  Link as LinkIcon,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

async function copyText(text: string, message: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
    return true;
  } catch {
    toast.error("Couldn’t access the clipboard");
    return false;
  }
}

export function PageActions({
  pageId,
  path,
  title,
  markdown,
  isInternal,
}: {
  pageId: string;
  path: string;
  title: string;
  markdown: string;
  isInternal: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const pageUrl = () =>
    typeof window === "undefined" ? `/${path}` : window.location.href;
  const mdUrl = () =>
    typeof window === "undefined"
      ? `/${path}.md`
      : `${window.location.origin}/${path}.md`;

  const llmText = () =>
    `# ${title}\n\nSource: ${pageUrl()}\n\n---\n\n${markdown}`;

  const llmPrompt = () =>
    `Read ${mdUrl()} so I can ask you questions about "${title}" from the Dash Marketing docs.`;

  async function copyPage() {
    if (await copyText(markdown, "Markdown copied")) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="inline-flex h-8.5 items-stretch overflow-hidden rounded-lg border bg-background shadow-xs">
      <button
        type="button"
        onClick={copyPage}
        className="flex items-center gap-1.5 px-3 text-[0.82rem] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3.5 text-green-600" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy page"}
      </button>
      <div className="w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center px-1.5 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
          )}
          aria-label="More page actions"
        >
          <ChevronDown className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Copy
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={copyPage}>
              <Copy className="size-4" /> Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                copyText(llmText(), "Copied with title + source for your LLM")
              }
            >
              <Sparkles className="size-4" /> Copy for LLM
              <span className="ml-auto text-[0.65rem] text-muted-foreground">
                + context
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => copyText(pageUrl(), "Link copied")}
            >
              <LinkIcon className="size-4" /> Copy link
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Export
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => window.open(`/${path}.md`, "_blank")}
            >
              <FileCode className="size-4" /> View as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open(`/api/pages/${pageId}/pdf`, "_blank")}
            >
              <Download className="size-4" /> Download PDF
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {!isInternal && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Open in
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      `https://claude.ai/new?q=${encodeURIComponent(llmPrompt())}`,
                      "_blank",
                    )
                  }
                >
                  <MessageSquareText className="size-4" /> Claude
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      `https://chatgpt.com/?hints=search&q=${encodeURIComponent(llmPrompt())}`,
                      "_blank",
                    )
                  }
                >
                  <Bot className="size-4" /> ChatGPT
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => (window.location.href = "/mcp")}
                >
                  <Sparkles className="size-4" /> Any MCP client…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
