import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useState } from "react";
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered,
  Link as LinkIcon, Image as ImageIcon, Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: Props) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Write your content here…" }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "min-h-[400px] focus:outline-none prose-content",
      },
    },
  });

  const addLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
    setLinkUrl("");
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imageUrl.trim()) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setImageUrl("");
    setShowImageInput(false);
  }, [editor, imageUrl]);

  if (!editor) return null;

  const ToolBtn = ({
    onClick, active, title, children,
  }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 bg-muted/40 border-b border-border">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 className="h-4 w-4" />
        </ToolBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </ToolBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolBtn onClick={() => { setShowLinkInput(!showLinkInput); setShowImageInput(false); }} active={editor.isActive("link")} title="Add link">
          <LinkIcon className="h-4 w-4" />
        </ToolBtn>
        {editor.isActive("link") && (
          <ToolBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            <Unlink className="h-4 w-4" />
          </ToolBtn>
        )}
        <ToolBtn onClick={() => { setShowImageInput(!showImageInput); setShowLinkInput(false); }} title="Insert image">
          <ImageIcon className="h-4 w-4" />
        </ToolBtn>
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div className="flex gap-2 px-3 py-2 bg-muted/20 border-b border-border">
          <Input
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            className="h-8 text-sm rounded-lg"
          />
          <Button size="sm" onClick={addLink} className="h-8 rounded-lg">Add</Button>
          <Button size="sm" variant="outline" onClick={() => setShowLinkInput(false)} className="h-8 rounded-lg">Cancel</Button>
        </div>
      )}

      {/* Image input */}
      {showImageInput && (
        <div className="flex gap-2 px-3 py-2 bg-muted/20 border-b border-border">
          <Input
            placeholder="https://example.com/image.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addImage()}
            className="h-8 text-sm rounded-lg"
          />
          <Button size="sm" onClick={addImage} className="h-8 rounded-lg">Insert</Button>
          <Button size="sm" variant="outline" onClick={() => setShowImageInput(false)} className="h-8 rounded-lg">Cancel</Button>
        </div>
      )}

      {/* Editor area */}
      <style>{`
        .prose-content h2 { font-size: 1.5rem; font-weight: 700; margin: 1.2em 0 0.5em; }
        .prose-content h3 { font-size: 1.2rem; font-weight: 600; margin: 1em 0 0.4em; }
        .prose-content p { margin: 0.75em 0; line-height: 1.7; }
        .prose-content ul { list-style-type: disc; padding-left: 1.5em; margin: 0.75em 0; }
        .prose-content ol { list-style-type: decimal; padding-left: 1.5em; margin: 0.75em 0; }
        .prose-content li { margin: 0.3em 0; }
        .prose-content a { color: hsl(32, 95%, 55%); text-decoration: underline; }
        .prose-content img { max-width: 100%; border-radius: 0.5rem; margin: 1em 0; }
        .prose-content strong { font-weight: 700; }
        .prose-content em { font-style: italic; }
        .prose-content .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left; color: hsl(30 15% 45%); pointer-events: none; height: 0;
        }
      `}</style>
      <div className="p-4 bg-background">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
