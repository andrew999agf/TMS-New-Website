"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { saveResult, deleteResult, type ResultInput } from "@/app/admin/(panel)/results/actions";

type Result = ResultInput & { id: number };
type Practice = { slug: string; title: string };

const CATEGORIES = ["marquee", "appellate", "settlement", "jury", "other"] as const;

export function ResultsManager({
  results,
  practices,
  dbEnabled,
}: {
  results: Result[];
  practices: Practice[];
  dbEnabled: boolean;
}) {
  const [editing, setEditing] = useState<ResultInput | null>(null);

  const groups = CATEGORIES.map((c) => ({ id: c, items: results.filter((r) => r.category === c) }));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[var(--c-ink-muted)]">{results.length} results</p>
        <button onClick={() => setEditing({ category: "settlement", title: "", featuredHome: false })} disabled={!dbEnabled} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50">
          <Plus size={16} /> New result
        </button>
      </div>

      {editing && <ResultForm initial={editing} practices={practices} onClose={() => setEditing(null)} />}

      <div className="mt-5 space-y-6">
        {groups.map((g) => g.items.length > 0 && (
          <section key={g.id}>
            <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--c-accent)] mb-2 capitalize">{g.id}</h3>
            <div className="rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
              {g.items.map((r) => (
                <Row key={r.id} result={r} onEdit={() => setEditing(r)} dbEnabled={dbEnabled} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Row({ result, onEdit, dbEnabled }: { result: Result; onEdit: () => void; dbEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="px-5 py-3.5 bg-[var(--c-surface)] flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium">{result.title}</div>
        {result.cite && <div className="text-xs text-[var(--c-ink-muted)] truncate">{result.cite}</div>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {result.stat && <span className="text-sm text-[var(--c-accent)]">{result.stat}</span>}
        <button onClick={onEdit} disabled={!dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-40"><Pencil size={15} /></button>
        <button onClick={() => startTransition(() => { void deleteResult(result.id); })} disabled={pending || !dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)] disabled:opacity-40"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function ResultForm({ initial, practices, onClose }: { initial: ResultInput; practices: Practice[]; onClose: () => void }) {
  const [form, setForm] = useState<ResultInput>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  function save() {
    startTransition(async () => {
      const res = await saveResult(form);
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed");
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-ui)] font-semibold">{initial.id ? "Edit result" : "New result"}</h3>
        <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ResultInput["category"] })} className={cls}>
            {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
        </label>
        <label className="text-sm">Practice area
          <select value={form.practiceSlug ?? ""} onChange={(e) => setForm({ ...form, practiceSlug: e.target.value })} className={cls}>
            <option value="">—</option>
            {practices.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          </select>
        </label>
      </div>
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={cls} />
      <div className="grid grid-cols-3 gap-3">
        <input value={form.stat ?? ""} onChange={(e) => setForm({ ...form, stat: e.target.value })} placeholder="Stat (e.g. $11.2M)" className={cls} />
        <input value={form.statLabel ?? ""} onChange={(e) => setForm({ ...form, statLabel: e.target.value })} placeholder="Stat label" className={cls} />
        <input value={form.year ?? ""} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year" className={cls} />
      </div>
      <textarea value={form.summary ?? ""} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Summary" rows={2} className={cls} />
      <textarea value={form.detail ?? ""} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Detail (citation, court)" rows={2} className={cls} />
      <div className="grid grid-cols-2 gap-3">
        <input value={form.cite ?? ""} onChange={(e) => setForm({ ...form, cite: e.target.value })} placeholder="Cite" className={cls} />
        <input value={form.link ?? ""} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Link (optional)" className={cls} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.featuredHome} onChange={(e) => setForm({ ...form, featuredHome: e.target.checked })} className="accent-[var(--c-accent)]" />
        Feature on home page
      </label>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60"><Check size={15} /> Save</button>
        <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
      </div>
    </div>
  );
}
