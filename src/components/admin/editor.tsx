"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import Placeholder from "@tiptap/extension-placeholder";
import { editorExtensions } from "@/lib/markdown/editor-extensions";
import { CALLOUT_TYPES, type CalloutType } from "@/lib/markdown/callout-node";
import { LinkPopover, type LinkTarget } from "@/components/admin/link-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadImage, IMAGE_TYPES } from "@/lib/upload-image";
import { updateDraftAction } from "@/server/actions/pages";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MetadataPanel, type PageMeta } from "./metadata-panel";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "dirty" | "saving";

export function PageEditor({
  page,
  role,
  tags,
  linkTargets = [],
}: {
  page: PageMeta & { contentMd: string };
  role: "editor" | "admin";
  tags: { all: { id: string; name: string }[]; selected: string[] };
  linkTargets?: LinkTarget[];
}) {
  const [title, setTitle] = useState(page.title);
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [rawMarkdown, setRawMarkdown] = useState(page.contentMd);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  // single source of truth for content: the markdown string
  const markdownRef = useRef(page.contentMd);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await updateDraftAction({
          id: page.id,
          title: titleRef.current,
          contentMd: markdownRef.current,
        });
        setSaveState("saved");
      } catch (e) {
        setSaveState("dirty");
        toast.error(e instanceof Error ? e.message : "Autosave failed");
      }
    }, 2000);
  }, [page.id]);

  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      Placeholder.configure({
        placeholder:
          "Start writing… Paste markdown, drag in images, or use the toolbar — including callouts via the ⓘ menu. The Markdown tab shows the raw source.",
      }),
    ],
    content: page.contentMd,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          // prose-pre:* restyles TipTap's bare <pre> to the light fence look
          // of the public site; the [&_pre_code]:* resets stop the inline-
          // code chip utilities (prose-code:*) from leaking into code lines
          // inside pre blocks (they'd render light chips on a dark block)
          "tiptap prose prose-neutral max-w-none min-h-[60vh] px-10 py-8 text-[1rem] focus:outline-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:my-5 prose-pre:rounded-xl prose-pre:border prose-pre:bg-muted/50 prose-pre:p-4 prose-pre:text-[0.85rem] prose-pre:leading-relaxed prose-pre:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_pre_code]:text-[1em] [&_pre_code]:text-inherit",
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          IMAGE_TYPES.includes(f.type),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (f) => IMAGE_TYPES.includes(f.type),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      markdownRef.current = editor.storage.markdown.getMarkdown();
      scheduleSave();
    },
  });

  const insertImages = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const url = await uploadImage(file);
          editor
            ?.chain()
            .focus()
            .setImage({ src: url, alt: file.name.replace(/\.\w+$/, "") })
            .run();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Image upload failed");
        }
      }
    },
    [editor],
  );

  // flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function switchMode(next: "visual" | "raw") {
    if (next === mode) return;
    if (next === "raw") {
      setRawMarkdown(markdownRef.current);
    } else {
      markdownRef.current = rawMarkdown;
      editor?.commands.setContent(rawMarkdown);
    }
    setMode(next);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center gap-4 border-b px-6">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave();
          }}
          className="min-w-0 flex-1 bg-transparent text-xl font-semibold tracking-tight placeholder:text-muted-foreground/50 focus:outline-none"
          placeholder="Untitled page"
          aria-label="Page title"
        />
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            saveState === "saved"
              ? "text-muted-foreground"
              : "text-amber-600",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              saveState === "saved" ? "bg-green-500" : "bg-amber-500",
            )}
          />
          {saveState === "saved"
            ? "Saved"
            : saveState === "saving"
              ? "Saving…"
              : "Unsaved"}
        </span>
        <Tabs value={mode} onValueChange={(v) => switchMode(v as "visual" | "raw")}>
          <TabsList>
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="raw">Markdown</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {mode === "visual" ? (
            <>
              <EditorToolbar
                editor={editor}
                onPickImage={insertImages}
                linkTargets={linkTargets}
                currentPageId={page.id}
              />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <EditorContent editor={editor} />
              </div>
            </>
          ) : (
            <Textarea
              value={rawMarkdown}
              onChange={(e) => {
                setRawMarkdown(e.target.value);
                markdownRef.current = e.target.value;
                scheduleSave();
              }}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none rounded-none border-0 p-8 font-mono text-sm focus-visible:ring-0"
              placeholder="# Write markdown…  ({% callout %} tags supported)"
            />
          )}
        </div>
        <MetadataPanel page={{ ...page, title }} role={role} tags={tags} />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn("size-8 p-0", active && "bg-accent")}
    >
      {children}
    </Button>
  );
}

function EditorToolbar({
  editor,
  onPickImage,
  linkTargets,
  currentPageId,
}: {
  editor: Editor | null;
  onPickImage: (files: File[]) => void;
  linkTargets: LinkTarget[];
  currentPageId: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  if (!editor) return null;
  const c = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-4 py-1.5">
      <ToolbarButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => c().undo().run()}
      >
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => c().redo().run()}
      >
        <Redo2 className="size-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => c().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => c().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => c().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => c().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => c().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={editor.isActive("code")}
        onClick={() => c().toggleCode().run()}
      >
        <Code className="size-4" />
      </ToolbarButton>
      <LinkPopover
        editor={editor}
        targets={linkTargets}
        currentPageId={currentPageId}
      />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => c().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => c().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => c().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => c().toggleCodeBlock().run()}
      >
        <SquareCode className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Divider"
        onClick={() => c().setHorizontalRule().run()}
      >
        <Minus className="size-4" />
      </ToolbarButton>
      <CalloutMenu editor={editor} />
      <TableMenu editor={editor} />
      <ToolbarButton label="Insert image" onClick={() => fileInput.current?.click()}>
        <ImageIcon className="size-4" />
      </ToolbarButton>
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onPickImage(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const CALLOUT_DOTS: Record<CalloutType, string> = {
  note: "bg-blue-400",
  warning: "bg-amber-400",
  success: "bg-green-400",
  danger: "bg-red-400",
};

function CalloutMenu({ editor }: { editor: Editor }) {
  const active = editor.isActive("callout");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Callout"
            aria-label="Callout"
            className={cn("h-8 gap-0.5 px-1.5", active && "bg-accent")}
          />
        }
      >
        <Info className="size-4" />
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {active ? "Callout type" : "Insert callout"}
          </DropdownMenuLabel>
          {CALLOUT_TYPES.map((type) => (
            <DropdownMenuItem
              key={type}
              onClick={() => {
                const chain = editor.chain().focus();
                if (editor.isActive("callout")) {
                  chain.setCalloutType(type).run();
                } else {
                  chain.setCallout({ type }).run();
                }
              }}
            >
              <span className={cn("size-2 rounded-full", CALLOUT_DOTS[type])} />
              <span className="capitalize">{type}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().unsetCallout().run()}
              >
                Remove callout
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableMenu({ editor }: { editor: Editor }) {
  if (!editor.isActive("table")) {
    return (
      <ToolbarButton
        label="Insert table"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <TableIcon className="size-4" />
      </ToolbarButton>
    );
  }
  const c = () => editor.chain().focus();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Table options"
            aria-label="Table options"
            className="h-8 gap-0.5 bg-accent px-1.5"
          />
        }
      >
        <TableIcon className="size-4" />
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Table</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => c().addRowAfter().run()}>
            Add row below
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => c().addRowBefore().run()}>
            Add row above
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => c().addColumnAfter().run()}>
            Add column right
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => c().addColumnBefore().run()}>
            Add column left
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => c().deleteRow().run()}>
            Delete row
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => c().deleteColumn().run()}>
            Delete column
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => c().deleteTable().run()}
          >
            Delete table
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
