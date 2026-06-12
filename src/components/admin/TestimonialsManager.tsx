"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import {
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
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

  return (
    <div className="max-w-3xl">
      {!dbEnabled && (
        <p className="mb-5 text-sm text-[var(--c-ink-muted)]">
          Connect the database to add testimonials. None are shown on the site until added.
        </p>
      )}

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
            <input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Attribution (e.g., Former client)" className="flex-1 border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
            <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Context (e.g., Litigation)" className="flex-1 border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
          </div>
          <div className="flex gap-2">
            <button onClick={add} disabled={pending} className="btn btn-accent text-sm py-2 px-4">Save</button>
            <button onClick={() => setAdding(false)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {initial.map((t) => (
          <TestimonialRow key={t.id} t={t} />
        ))}
        {initial.length === 0 && dbEnabled && (
          <p className="text-sm text-[var(--c-ink-muted)] py-6">No testimonials yet.</p>
        )}
      </div>
    </div>
  );
}

function TestimonialRow({ t }: { t: TestimonialView }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 flex items-start justify-between gap-4">
      <div className={t.visible ? "" : "opacity-50"}>
        <p className="text-sm">“{t.quote}”</p>
        <p className="text-xs text-[var(--c-ink-muted)] mt-1">
          {t.attribution} {t.context ? `· ${t.context}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
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
  );
}
