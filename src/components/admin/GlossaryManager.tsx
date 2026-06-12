"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { saveTerm, deleteTerm, type TermInput } from "@/app/admin/(panel)/glossary/actions";

type Term = TermInput & { id: number; slug: string };
type Practice = { slug: string; title: string };

export function GlossaryManager({
  terms,
  practices,
  dbEnabled,
}: {
  terms: Term[];
  practices: Practice[];
  dbEnabled: boolean;
}) {
  const [editing, setEditing] = useState<TermInput | null>(null);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[var(--c-ink-muted)]">{terms.length} terms</p>
        <button onClick={() => setEditing({ term: "", definition: "", hypothetical: "", relatedPractices: [], aliases: [] })} disabled={!dbEnabled} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50">
          <Plus size={16} /> New term
        </button>
      </div>

      {editing && (
        <TermForm
          initial={editing}
          practices={practices}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-5 rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
        {terms.map((t) => (
          <Row key={t.id} term={t} onEdit={() => setEditing(t)} dbEnabled={dbEnabled} />
        ))}
      </div>
    </div>
  );
}

function Row({ term, onEdit, dbEnabled }: { term: Term; onEdit: () => void; dbEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="px-5 py-3.5 bg-[var(--c-surface)] flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium">{term.term}</div>
        <div className="text-xs text-[var(--c-ink-muted)] line-clamp-1">{term.definition}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={onEdit} disabled={!dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-40"><Pencil size={15} /></button>
        <button onClick={() => startTransition(() => { void deleteTerm(term.id); })} disabled={pending || !dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)] disabled:opacity-40"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function TermForm({ initial, practices, onClose }: { initial: TermInput; practices: Practice[]; onClose: () => void }) {
  const [form, setForm] = useState<TermInput>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      const res = await saveTerm(form);
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed");
    });
  }

  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  return (
    <div className="rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-ui)] font-semibold">{initial.id ? "Edit term" : "New term"}</h3>
        <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
      </div>
      <input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="Term" className={cls} />
      <textarea value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} placeholder="Definition" rows={3} className={cls} />
      <textarea value={form.hypothetical} onChange={(e) => setForm({ ...form, hypothetical: e.target.value })} placeholder="Hypothetical (flashcard-style example)" rows={3} className={cls} />
      <input
        value={form.aliases.join(", ")}
        onChange={(e) => setForm({ ...form, aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
        placeholder="Aliases (comma-separated)"
        className={cls}
      />
      <div>
        <div className="text-xs text-[var(--c-ink-muted)] mb-1.5">Related practice areas</div>
        <div className="flex flex-wrap gap-1.5">
          {practices.map((p) => {
            const on = form.relatedPractices.includes(p.slug);
            return (
              <button
                key={p.slug}
                onClick={() => setForm((f) => ({ ...f, relatedPractices: on ? f.relatedPractices.filter((x) => x !== p.slug) : [...f.relatedPractices, p.slug] }))}
                className={`text-xs px-2 py-1 rounded border ${on ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"}`}
              >
                {p.title}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60"><Check size={15} /> Save</button>
        <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
      </div>
    </div>
  );
}
