"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Eye, EyeOff, Pencil, Check, X, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import {
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  setTestimonialOrder,
} from "@/app/admin/(panel)/testimonials/actions";
import type { TestimonialView } from "@/lib/content";

export function TestimonialsManager({
  initial,
  dbEnabled,
}: {
  initial: TestimonialView[];
  dbEnabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState("");
  const [attribution, setAttribution] = useState("");
  const [context, setContext] = useState("");
  const [pending, startTransition] = useTransition();

  const [list, setList] = useState<TestimonialView[]>(initial);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Keep local order in sync when the server data changes.
  useEffect(() => setList(initial), [initial]);

  function add() {
    startTransition(async () => {
      const res = await createTestimonial({ quote, attribution, context });
      if (res.ok) {
        setQuote("");
        setAttribution("");
        setContext("");
        setAdding(false);
      }
    });
  }

  function commitOrder(next: TestimonialView[]) {
    setList(next);
    startTransition(() => {
      void setTestimonialOrder(next.map((t) => t.id));
    });
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    commitOrder(next);
  }

  function handleDrop(target: number) {
    if (dragIdx === null || dragIdx === target) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...list];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    commitOrder(next);
  }

  return (
    <div className="max-w-3xl">
      {!dbEnabled && (
        <p className="mb-5 text-sm text-[var(--c-ink-muted)]">
          Connect the database to add testimonials. None are shown on the site until added.
        </p>
      )}

      <p className="text-sm text-[var(--c-ink-muted)] mb-4">
        These appear on the home page in the order below. <strong>Use the arrows</strong> (or drag
        the handle) to reorder, and the pencil to edit any wording that isn&apos;t right.
      </p>

      {!adding ? (
        <button onClick={() => setAdding(true)} disabled={!dbEnabled} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50">
          <Plus size={16} /> Add testimonial
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-3">
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Quote"
            rows={3}
            className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-3 text-sm outline-none focus:border-[var(--c-accent)]"
          />
          <div className="flex gap-3">
            <input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Attribution (e.g., Rene Sanders)" className="flex-1 border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
            <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Context (e.g., Google review)" className="flex-1 border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div className="flex gap-2">
            <button onClick={add} disabled={pending} className="btn btn-accent text-sm py-2 px-4">Save</button>
            <button onClick={() => setAdding(false)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {list.map((t, i) => (
          <div
            key={t.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(i);
            }}
            onDrop={() => handleDrop(i)}
            className={`rounded-lg border bg-[var(--c-surface)] transition-colors ${
              overIdx === i && dragIdx !== null ? "border-[var(--c-accent)]" : "border-[var(--c-border)]"
            } ${dragIdx === i ? "opacity-50" : ""}`}
          >
            {editingId === t.id ? (
              <EditTestimonialForm t={t} onClose={() => setEditingId(null)} />
            ) : (
              <div className="p-4 flex items-start gap-3">
                <button
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  className="hidden sm:block cursor-grab active:cursor-grabbing text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] shrink-0 mt-0.5 touch-none"
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                >
                  <GripVertical size={18} />
                </button>
                <span className="text-xs font-medium text-[var(--c-ink-muted)] w-5 text-center shrink-0 mt-0.5">{i + 1}</span>
                <div className={`min-w-0 flex-1 ${t.visible ? "" : "opacity-50"}`}>
                  <p className="text-sm">“{t.quote}”</p>
                  <p className="text-xs text-[var(--c-ink-muted)] mt-1">
                    {t.attribution} {t.context ? `· ${t.context}` : ""}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-2.5 shrink-0">
                  <button disabled={i === 0 || pending} onClick={() => move(i, -1)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-30" title="Move up"><ChevronUp size={18} /></button>
                  <button disabled={i === list.length - 1 || pending} onClick={() => move(i, 1)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-30" title="Move down"><ChevronDown size={18} /></button>
                  <button onClick={() => setEditingId(t.id)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={16} /></button>
                  <button
                    title={t.visible ? "Hide" : "Show"}
                    onClick={() => startTransition(() => { void updateTestimonial(t.id, { quote: t.quote, attribution: t.attribution ?? "", context: t.context ?? "", visible: !t.visible }); })}
                    disabled={pending}
                    className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
                  >
                    {t.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    title="Delete"
                    onClick={() => startTransition(() => { void deleteTestimonial(t.id); })}
                    disabled={pending}
                    className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && dbEnabled && (
          <p className="text-sm text-[var(--c-ink-muted)] py-6">No testimonials yet.</p>
        )}
      </div>
    </div>
  );
}

function EditTestimonialForm({ t, onClose }: { t: TestimonialView; onClose: () => void }) {
  const [quote, setQuote] = useState(t.quote);
  const [attribution, setAttribution] = useState(t.attribution ?? "");
  const [context, setContext] = useState(t.context ?? "");
  const [pending, startTransition] = useTransition();
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  function save() {
    startTransition(async () => {
      const res = await updateTestimonial(t.id, { quote, attribution, context, visible: t.visible });
      if (res.ok) onClose();
    });
  }

  return (
    <div className="p-4 space-y-3 border-l-2 border-[var(--c-accent)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Edit testimonial</span>
        <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={16} /></button>
      </div>
      <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={4} className={cls} placeholder="Quote" />
      <div className="flex gap-3">
        <input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Attribution (e.g., Rene Sanders)" className={cls} />
        <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Context (e.g., Google review)" className={cls} />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={pending || !quote.trim()} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50"><Check size={15} /> Save</button>
        <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
      </div>
    </div>
  );
}
