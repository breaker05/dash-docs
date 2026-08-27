"use client";

import * as React from "react";
import Markdoc from "@markdoc/markdoc";

/**
 * Renders an assistant answer (streamed markdown) as formatted content.
 * Markdoc is already the site's renderer, and parsing partial markdown on
 * each stream chunk is cheap at chat-answer sizes; a parse hiccup falls
 * back to plain text so streaming never breaks the panel.
 */
export function AnswerMarkdown({ text }: { text: string }) {
  const content = React.useMemo(() => {
    try {
      return Markdoc.transform(Markdoc.parse(text));
    } catch {
      return null;
    }
  }, [text]);

  if (content === null) {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }

  return (
    <div className="prose prose-sm prose-neutral max-w-none text-foreground prose-p:my-1.5 prose-p:text-foreground prose-headings:my-2 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:text-foreground prose-strong:text-foreground prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:my-2 prose-pre:rounded-lg prose-pre:border prose-pre:bg-muted/50 prose-pre:p-3 prose-pre:text-xs prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit">
      {Markdoc.renderers.react(content, React)}
    </div>
  );
}
