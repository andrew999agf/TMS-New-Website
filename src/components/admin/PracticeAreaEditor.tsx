"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { savePracticeArea, type PracticeInput } from "@/app/admin/(panel)/practice-areas/actions";

export function PracticeAreaEditor({ initial }: { initial: PracticeInput }) {
  const [form, setForm] = useState<PracticeInput>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  function save() {
    startTransition(async () => {
      const res = await savePracticeArea(form);
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Save failed");
    });
  }

  function setParagraph(i: number, v: string) {
    setForm((f) => ({ ...f, body: f.body.map((p, idx) => (idx === i ? v : p)) }));
    setSaved(false);
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-60">
          {pending ? "Publishing…" : "Publish"}
        </button>
        {saved && <span className="text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Saved</span>}
        {error && <span className="text-sm text-[var(--c-error)]">{error}</span>}
        <Link href={`/practice-areas/${form.slug}`} target="_blank" className="text-sm text-[var(--c-accent)] flex items-center gap-1 ml-auto">
          Preview <ExternalLink size={14} />
        </Link>
      </div>

      <Field label="Title"><input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setSaved(false); }} className={cls} /></Field>
      <Field label="Tagline"><input value={form.tagline} onChange={(e) => { setForm({ ...form, tagline: e.target.value }); setSaved(false); }} className={cls} /></Field>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Body paragraphs</label>
          <button onClick={() => setForm((f) => ({ ...f, body: [...f.body, ""] }))} className="text-xs text-[var(--c-accent)] flex items-center gap-1"><Plus size={13} /> Add paragraph</button>
        </div>
        <div className="space-y-2">
          {form.body.map((p, i) => (
            <div key={i} className="flex gap-2">
              <textarea value={p} onChange={(e) => setParagraph(i, e.target.value)} rows={3} className={cls} />
              <button onClick={() => setForm((f) => ({ ...f, body: f.body.filter((_, idx) => idx !== i) }))} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)] shrink-0"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      <Field label="How we approach it"><textarea value={form.approach} onChange={(e) => { setForm({ ...form, approach: e.target.value }); setSaved(false); }} rows={3} className={cls} /></Field>

      <Field label="Intake keywords (comma-separated)">
        <input
          value={form.keywords.join(", ")}
          onChange={(e) => { setForm({ ...form, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }); setSaved(false); }}
          className={cls}
        />
      </Field>

      <Field label="Hero image URL"><input value={form.heroImage ?? ""} onChange={(e) => { setForm({ ...form, heroImage: e.target.value }); setSaved(false); }} placeholder="/… or https://…" className={cls} /></Field>

      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--c-ink-muted)]">SEO</summary>
        <div className="mt-3 space-y-3">
          <Field label="SEO title"><input value={form.seoTitle ?? ""} onChange={(e) => { setForm({ ...form, seoTitle: e.target.value }); setSaved(false); }} className={cls} /></Field>
          <Field label="SEO description"><textarea value={form.seoDescription ?? ""} onChange={(e) => { setForm({ ...form, seoDescription: e.target.value }); setSaved(false); }} rows={2} className={cls} /></Field>
        </div>
      </details>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.visible} onChange={(e) => { setForm({ ...form, visible: e.target.checked }); setSaved(false); }} className="accent-[var(--c-accent)]" />
        Visible on the site
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
