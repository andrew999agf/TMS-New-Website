"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2, RotateCcw } from "lucide-react";
import { setModuleComplete } from "@/app/admin/(panel)/training/actions";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function ModuleComplete({ slug, completedAt }: { slug: string; completedAt?: string }) {
  const [done, setDone] = useState<string | undefined>(completedAt);
  const [pending, start] = useTransition();

  function toggle(complete: boolean) {
    start(async () => {
      const res = await setModuleComplete(slug, complete);
      if (res.ok) setDone(complete ? new Date().toISOString() : undefined);
    });
  }

  if (done) {
    return (
      <div className="mt-10 flex flex-col gap-3 rounded-xl border border-[var(--c-accent)]/30 bg-[var(--c-accent)]/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={22} className="shrink-0 text-[var(--c-accent)]" />
          <div>
            <p className="font-semibold text-[var(--c-ink)]">Completed</p>
            <p className="text-xs text-[var(--c-ink-muted)]">You marked this complete on {formatDate(done)}.</p>
          </div>
        </div>
        <button
          onClick={() => toggle(false)}
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--c-border)] px-3.5 py-2 text-xs font-medium text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Mark not complete
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-col gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Circle size={22} className="shrink-0 text-[var(--c-ink-muted)]" />
        <div>
          <p className="font-semibold text-[var(--c-ink)]">Finished reading?</p>
          <p className="text-xs text-[var(--c-ink-muted)]">Mark this module complete to record that you&apos;ve read and understood it.</p>
        </div>
      </div>
      <button
        onClick={() => toggle(true)}
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--c-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark complete
      </button>
    </div>
  );
}
