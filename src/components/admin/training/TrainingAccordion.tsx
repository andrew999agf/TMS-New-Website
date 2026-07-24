"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, CheckCircle2, BookOpen, Clock, FolderClosed, FolderOpen } from "lucide-react";

export type ModuleCard = { slug: string; title: string; summary: string; audience: string; lessons: number; estMinutes: number; done: boolean };
export type TrainingGroup = { category: string; items: ModuleCard[] };

export function TrainingAccordion({ groups }: { groups: TrainingGroup[] }) {
  // First category open, the rest collapsed — decluttered, like a file tree.
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map((g, i) => [g.category, i === 0])));

  return (
    <div className="space-y-2.5">
      {groups.map((g) => {
        const isOpen = !!open[g.category];
        const done = g.items.filter((m) => m.done).length;
        return (
          <div key={g.category} className="overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
            <button
              onClick={() => setOpen((o) => ({ ...o, [g.category]: !o[g.category] }))}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--c-surface2)]"
            >
              <ChevronRight size={16} className={`shrink-0 text-[var(--c-ink-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`} />
              {isOpen ? <FolderOpen size={18} className="shrink-0 text-[var(--c-accent)]" /> : <FolderClosed size={18} className="shrink-0 text-[var(--c-accent)]" />}
              <span className="min-w-0 flex-1 font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--c-ink)]">{g.category}</span>
              <span className="shrink-0 text-xs text-[var(--c-ink-muted)]">
                {done === g.items.length && g.items.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[var(--c-accent)]"><CheckCircle2 size={13} /> All done</span>
                ) : (
                  `${done}/${g.items.length} done`
                )}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-[var(--c-border)] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.items.map((m) => (
                    <Link
                      key={m.slug}
                      href={`/admin/training/${m.slug}`}
                      className="group flex flex-col rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-4 transition hover:border-[var(--c-accent)]/50 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-[family-name:var(--font-display)] text-base leading-tight text-[var(--c-ink)]">{m.title}</h3>
                        {m.done ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]"><CheckCircle2 size={12} /> Done</span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-[var(--c-border)] px-2 py-0.5 text-[11px] text-[var(--c-ink-muted)]">{m.audience}</span>
                        )}
                      </div>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--c-ink-muted)]">{m.summary}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-[var(--c-ink-muted)]">
                        <span className="flex items-center gap-3">
                          <span className="flex items-center gap-1"><BookOpen size={13} /> {m.lessons} lessons</span>
                          <span className="flex items-center gap-1"><Clock size={13} /> {m.estMinutes} min</span>
                        </span>
                        <span className="flex items-center gap-0.5 font-medium text-[var(--c-accent)]">{m.done ? "Review" : "Start"}<ChevronRight size={14} className="transition group-hover:translate-x-0.5" /></span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
