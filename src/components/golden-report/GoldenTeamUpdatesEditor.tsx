"use client";

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
} from "@/lib/goldenReportEditorSerialization";
import {
  countGoldenTeamUpdatesWords,
  GOLDEN_TEAM_UPDATES_MAX_WORDS,
  sanitizeTeamUpdatesContent,
} from "@/lib/goldenReportTeamUpdate";

type GoldenTeamUpdatesEditorCoreProps = {
  markdown: string;
  onMarkdownChange: (md: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

function GoldenTeamUpdatesEditorCore({
  markdown,
  onMarkdownChange,
  placeholder,
  disabled,
}: GoldenTeamUpdatesEditorCoreProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Placeholder.configure({
        placeholder: placeholder || "Write an update for token holders…",
      }),
    ],
    content: markdownToEditorHtml(markdown),
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "golden-team-updates-prose min-h-[200px] px-3 py-2 text-base sm:text-sm text-white focus:outline-none max-w-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const markdownNext = editorHtmlToMarkdown(ed.getHTML());
      const sanitized = sanitizeTeamUpdatesContent(markdownNext);
      if (sanitized !== markdownNext) {
        ed.commands.setContent(markdownToEditorHtml(sanitized), false);
      }
      onMarkdownChange(sanitized);
    },
  });

  const wordsUsed = useMemo(
    () => countGoldenTeamUpdatesWords(markdown),
    [markdown],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    return (
      <div className="min-h-[220px] rounded-md border border-white/15 bg-black/40" />
    );
  }

  const btn = (active: boolean) =>
    `rounded p-1.5 transition ${
      active
        ? "bg-[#ffc000] text-black"
        : "text-white/80 hover:bg-white/10 hover:text-white"
    } ${disabled ? "pointer-events-none opacity-50" : ""}`;

  return (
    <div className="rounded-md border border-[#ffc000]/35 bg-black/40 overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-white/10 bg-black/30 px-1.5 py-1.5">
        <button
          type="button"
          className={btn(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
          aria-label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <span className="mx-0.5 w-px self-stretch bg-white/15" aria-hidden />
        <button
          type="button"
          className={btn(editor.isActive("heading", { level: 2 }))}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title="Heading 2"
          aria-label="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("heading", { level: 3 }))}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          title="Heading 3"
          aria-label="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </button>
        <span className="mx-0.5 w-px self-stretch bg-white/15" aria-hidden />
        <button
          type="button"
          className={btn(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("blockquote"))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
          aria-label="Quote"
        >
          <Quote className="h-4 w-4" />
        </button>
        <span className="mx-0.5 w-px self-stretch bg-white/15" aria-hidden />
        <button
          type="button"
          className={`rounded p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white ${
            disabled || !editor.can().undo()
              ? "cursor-not-allowed opacity-35"
              : ""
          }`}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !editor.can().undo()}
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`rounded p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white ${
            disabled || !editor.can().redo()
              ? "cursor-not-allowed opacity-35"
              : ""
          }`}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !editor.can().redo()}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
      <div className="border-t border-white/10 bg-black/30 px-3 py-1.5 text-right text-xs text-white/65">
        {wordsUsed}/{GOLDEN_TEAM_UPDATES_MAX_WORDS} words
      </div>
    </div>
  );
}

export type GoldenTeamUpdatesEditorProps = GoldenTeamUpdatesEditorCoreProps & {
  /** Change when switching project or when server content should replace the editor. */
  documentKey: string;
};

export function GoldenTeamUpdatesEditor({
  documentKey,
  ...rest
}: GoldenTeamUpdatesEditorProps) {
  return <GoldenTeamUpdatesEditorCore key={documentKey} {...rest} />;
}
