"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import {
  TextB,
  TextItalic,
  TextHOne,
  TextHTwo,
  ListBullets,
  ListNumbers,
  Quotes,
  CodeSimple,
  TextStrikethrough,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Rich text (WYSIWYG) editor that reads + writes MARKDOWN, so the founder edits
 * their knowledge docs visually while the agents keep reading clean markdown from
 * disk. Built on tiptap (StarterKit + tiptap-markdown). The parent re-mounts it
 * per document (via `key`) so each doc loads its own markdown.
 */
export default function RichEditor({
  value,
  onChange,
  placeholder = "Start writing…",
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false, // Next SSR — avoid hydration mismatch
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown.configure({ html: false, linkify: true, breaks: true, transformPastedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rich-editor min-h-full px-5 py-4 text-[14px] leading-relaxed text-foreground/90 outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
      onChange(md);
    },
  });

  if (!editor) return <div className="flex-1" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto" data-placeholder={placeholder} data-lenis-prevent>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const Btn = ({
    on,
    active,
    label,
    children,
  }: {
    on: () => void;
    active?: boolean;
    label: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition",
        active ? "bg-accent-400/25 text-accent-100" : "text-foreground/50 hover:bg-white/[0.06] hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
  const Sep = () => <span className="mx-1 h-5 w-px bg-white/10" />;

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-white/8 px-3 py-1.5">
      <Btn label="Bold" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}>
        <TextB size={15} weight="bold" />
      </Btn>
      <Btn label="Italic" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}>
        <TextItalic size={15} weight="bold" />
      </Btn>
      <Btn label="Strikethrough" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}>
        <TextStrikethrough size={15} weight="bold" />
      </Btn>
      <Sep />
      <Btn label="Heading 1" active={editor.isActive("heading", { level: 1 })} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <TextHOne size={16} weight="bold" />
      </Btn>
      <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <TextHTwo size={16} weight="bold" />
      </Btn>
      <Sep />
      <Btn label="Bullet list" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}>
        <ListBullets size={16} weight="bold" />
      </Btn>
      <Btn label="Numbered list" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListNumbers size={16} weight="bold" />
      </Btn>
      <Btn label="Quote" active={editor.isActive("blockquote")} on={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quotes size={15} weight="bold" />
      </Btn>
      <Btn label="Code block" active={editor.isActive("codeBlock")} on={() => editor.chain().focus().toggleCodeBlock().run()}>
        <CodeSimple size={16} weight="bold" />
      </Btn>
    </div>
  );
}
