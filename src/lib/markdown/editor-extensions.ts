import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Markdown } from "tiptap-markdown";
import { CalloutNode } from "./callout-node";
import { PreserveIndent } from "./preserve-indent";

// Shared by the admin editor UI and the headless round-trip tests, so what
// the tests prove is exactly what the editor does.
export const editorExtensions = [
  StarterKit.configure({
    // markdown is the storage format; disable marks with no md mapping
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Link.configure({ openOnClick: false, autolink: false }),
  Image,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  CalloutNode,
  PreserveIndent,
  Markdown.configure({
    html: true, // legacy docs contain occasional inline HTML — pass through
    linkify: false,
    breaks: false,
    tightLists: true,
  }),
];
