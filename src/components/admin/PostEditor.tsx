"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  BookPlus,
  Check,
} from "lucide-react";
import { savePost, createGlossaryTerm, type PostInput } from "@/app/admin/(panel)/blog/post-actions";
import { ImageUploadField } from "./ImageUploadField";
import { slugify } from "@/lib/utils";

type Practice = { slug: string; title: string };

export function PostEditor({
  initial,
  practices,
}: {
  initial: Partial<PostInput> & { id?: number };
  practices: Practice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial.title ?? "");
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial.excerpt ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [status, setStatus] = useState<PostInput["status"]>(initial.status ?? "draft");
  const [publishAt, setPublishAt] = useState(
    initial.publishAt ? initial.publishAt.slice(0, 16) : "",
  );
  const [bannerImage, setBannerImage] = useState(initial.bannerImage ?? "");
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription ?? "");
  const [isFirmNews, setIsFirmNews] = useState(initial.isFirmNews ?? false);
  const [relatedPractices, setRelatedPractices] = useState<string[]>(initial.relatedPractices ?? []);

  const [termModal, setTermModal] = useState<{ term: string; definition: string; hypothetical: string } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener" } }),
    ],
    content: initial.body ?? "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-firm min-h-[320px] focus:outline-none",
      },
    },
  });

  function openTermModal() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ").trim();
    setTermModal({ term: text, definition: "", hypothetical: "" });
  }

  function saveTerm() {
    if (!termModal) return;
    startTransition(async () => {
      const res = await createGlossaryTerm(termModal);
      if (res.ok) setTermModal(null);
      else setError(res.error ?? "Could not create term");
    });
  }

  function handleSave(nextStatus?: PostInput["status"]) {
    const finalStatus = nextStatus ?? status;
    const input: PostInput = {
      id: initial.id,
      slug: slug || slugify(title),
      title,
      excerpt,
      body: editor?.getHTML() ?? "",
      bannerImage,
      category: category || undefined,
      tags: category ? [category] : [],
      isFirmNews,
      status: finalStatus,
      publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || excerpt,
      relatedPractices,
    };
    startTransition(async () => {
      const res = await savePost(input);
      if (res.ok) {
        setSaved(true);
        setStatus(finalStatus);
        router.refresh();
      } else setError(res.error ?? "Save failed");
    });
  }

  if (!editor) return null;

  const btn = (active: boolean) =>
    `p-2 rounded hover:bg-[var(--c-surface2)] ${active ? "text-[var(--c-accent)] bg-[var(--c-surface2)]" : "text-[var(--c-ink-muted)]"}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      {/* Editor */}
      <div>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!initial.id && !slug) setSlug(slugify(e.target.value));
          }}
          placeholder="Post title"
          className="w-full font-[family-name:var(--font-display)] text-3xl bg-transparent outline-none mb-4 border-b border-[var(--c-border)] pb-3"
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 border border-[var(--c-border)] rounded-t-lg bg-[var(--c-surface)] p-1.5 sticky top-0 z-10">
          <button className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold size={16} /></button>
          <button className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic size={16} /></button>
          <span className="w-px h-5 bg-[var(--c-border)] mx-1" />
          <button className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 size={16} /></button>
          <button className={btn(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><Heading3 size={16} /></button>
          <span className="w-px h-5 bg-[var(--c-border)] mx-1" />
          <button className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={16} /></button>
          <button className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={16} /></button>
          <button className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote size={16} /></button>
          <span className="w-px h-5 bg-[var(--c-border)] mx-1" />
          <button
            className={btn(editor.isActive("link"))}
            onClick={() => {
              const url = window.prompt("Link URL (e.g. /practice-areas/appellate-law)");
              if (url) editor.chain().focus().setLink({ href: url }).run();
              else editor.chain().focus().unsetLink().run();
            }}
            title="Link"
          >
            <Link2 size={16} />
          </button>
          <button className={btn(false)} onClick={openTermModal} title="Mark selection as glossary term">
            <BookPlus size={16} />
          </button>
        </div>

        <div className="border border-t-0 border-[var(--c-border)] rounded-b-lg bg-[var(--c-surface)] p-5">
          <EditorContent editor={editor} />
        </div>

        <p className="mt-2 text-xs text-[var(--c-ink-muted)]">
          Glossary terms auto-highlight in the published post based on the glossary. Use{" "}
          <BookPlus size={12} className="inline" /> to create a new term from selected text.
        </p>
      </div>

      {/* Sidebar */}
      <aside className="space-y-5">
        <div className="flex items-center gap-2">
          <button onClick={() => handleSave()} disabled={pending} className="btn btn-accent text-sm py-2.5 px-4 flex-1 disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          {status !== "published" && (
            <button onClick={() => handleSave("published")} disabled={pending} className="btn btn-outline text-sm py-2.5 px-4">
              Publish
            </button>
          )}
        </div>
        {saved && <p className="text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Saved</p>}
        {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as PostInput["status"])} className={selectCls}>
            <option value="draft">Draft</option>
            <option value="hidden">Hidden</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
        </Field>

        {(status === "scheduled" || status === "published") && (
          <Field label="Publish date/time">
            <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className={inputCls} />
          </Field>
        )}

        <Field label="Slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inputCls} />
        </Field>

        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
            <option value="">—</option>
            {practices.map((p) => (
              <option key={p.slug} value={p.slug}>{p.title}</option>
            ))}
          </select>
        </Field>

        <Field label="Excerpt">
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} className={inputCls} />
        </Field>

        <Field label="Banner image">
          <ImageUploadField value={bannerImage} onChange={setBannerImage} slot="blogBanner" folder="blog" />
        </Field>

        <Field label="Related practice areas">
          <div className="flex flex-wrap gap-1.5">
            {practices.map((p) => {
              const on = relatedPractices.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  onClick={() => setRelatedPractices((r) => (on ? r.filter((x) => x !== p.slug) : [...r, p.slug]))}
                  className={`text-xs px-2 py-1 rounded border ${on ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"}`}
                >
                  {p.title}
                </button>
              );
            })}
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFirmNews} onChange={(e) => setIsFirmNews(e.target.checked)} className="accent-[var(--c-accent)]" />
          Firm news (adds results disclaimer)
        </label>

        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--c-ink-muted)]">SEO</summary>
          <div className="mt-3 space-y-3">
            <Field label="SEO title"><input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputCls} /></Field>
            <Field label="SEO description"><textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} className={inputCls} /></Field>
          </div>
        </details>
      </aside>

      {/* Glossary term modal */}
      {termModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTermModal(null)}>
          <div className="bg-[var(--c-surface)] rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-[family-name:var(--font-display)] text-xl mb-4">New glossary term</h3>
            <div className="space-y-3">
              <Field label="Term"><input value={termModal.term} onChange={(e) => setTermModal({ ...termModal, term: e.target.value })} className={inputCls} /></Field>
              <Field label="Definition"><textarea value={termModal.definition} onChange={(e) => setTermModal({ ...termModal, definition: e.target.value })} rows={3} className={inputCls} /></Field>
              <Field label="Hypothetical"><textarea value={termModal.hypothetical} onChange={(e) => setTermModal({ ...termModal, hypothetical: e.target.value })} rows={3} className={inputCls} /></Field>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveTerm} disabled={pending || !termModal.term || !termModal.definition} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">Create term</button>
              <button onClick={() => setTermModal(null)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";
const selectCls = inputCls;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
