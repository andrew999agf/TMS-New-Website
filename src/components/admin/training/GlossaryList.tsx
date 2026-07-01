"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { GlossaryEntry } from "@/lib/training/glossary";

const NAVY = "#1b3a6b";

/**
 * The full training glossary: searchable, grouped by practice area. Each card
 * mirrors the hover popup in the lessons — term, definition, and a
 * flashcard-style hypothetical.
 */
export function GlossaryList({ groups }: { groups: { category: string; entries: GlossaryEntry[] }[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) => ({
        category: g.category,
        entries: g.entries.filter((e) =>
          [e.term, ...e.also, e.definition, e.hypothetical].some((s) => s.toLowerCase().includes(needle)),
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [groups, q]);

  const total = filtered.reduce((n, g) => n + g.entries.length, 0);

  return (
    <div>
      <div className="relative max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms, definitions, or hypotheticals…"
          className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] py-2 pl-9 pr-3 text-sm text-[var(--c-ink)] outline-none placeholder:text-[var(--c-ink-muted)]/70 focus:border-[#1b3a6b]/50"
        />
      </div>
      <p className="mt-2 text-xs text-[var(--c-ink-muted)]">
        {total} term{total === 1 ? "" : "s"}
        {q.trim() ? " match" : ""}.
      </p>

      {total === 0 && (
        <p className="mt-6 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm text-[var(--c-ink-muted)]">
          No terms match “{q}”.
        </p>
      )}

      <div className="mt-6 space-y-10">
        {filtered.map((g) => (
          <section key={g.category}>
            <h2 className="eyebrow mb-3 text-[var(--c-ink-muted)]">{g.category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.entries.map((e) => (
                <div key={e.term} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                  <p className="text-sm font-semibold capitalize" style={{ color: NAVY }}>
                    {e.term}
                    {e.also.length > 0 && (
                      <span className="ml-2 font-normal normal-case text-[var(--c-ink-muted)]">
                        also: {e.also.join(", ")}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--c-ink-muted)]">{e.definition}</p>
                  <p className="mt-2 rounded-md bg-[var(--c-surface-2)] p-2.5 text-xs leading-relaxed text-[var(--c-ink)]">
                    <span className="font-semibold" style={{ color: NAVY }}>
                      Hypothetical:{" "}
                    </span>
                    {e.hypothetical}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
