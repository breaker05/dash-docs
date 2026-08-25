import React from "react";
import Markdoc from "@markdoc/markdoc";
import { createMarkdocConfig } from "./config";
import { Callout } from "./callout";
import { Fence } from "./fence";

/** Render stored markdown to React (used by public pages and PDF export). */
export function renderMarkdoc(markdown: string): React.ReactNode {
  const ast = Markdoc.parse(markdown);
  const content = Markdoc.transform(ast, createMarkdocConfig());
  return Markdoc.renderers.react(content, React, {
    components: { Fence, Callout },
  });
}
