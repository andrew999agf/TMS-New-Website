"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

export type GlossItem = {
  slug: string;
  term: string;
  definition: string;
  hypothetical: string;
};

export function GlossaryIndex({ terms }: { terms: GlossItem[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return terms;
    return terms.filter(
      (t) =>
        t.term.toLowerCase().includes(needle) ||
        t.definition.toLowerCase().includes(needle),
    );
  }, [terms, q]);

  const groups = useMemo(() => {
    const m = new Map<string, GlossItem[]>();
    for (const t of filtered) {
      const letter = t.term[0].toUpperCase();
      if (!m.has(letter)) m.set(letter, []);
      m.get(letter)!.push(t);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div>
      <div className="relative w-full max-w-sm">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms"
          className="w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-2.5 pl-10 pr-4 text-sm focus:border-[var(--c-accent)] outline-none"
          aria-label="Search glossary terms"
        />
      </div>

      <div className="mt-12 space-y-12">
        {groups.map(([letter, items]) => (
          <section key={letter} id={letter}>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--c-accent)] border-b border-[var(--c-border)] pb-2">
              {letter}
            </h2>
            <dl className="mt-6 space-y-8">
              {items.map((t) => (
                <div key={t.slug} className="grid gap-2 lg:grid-cols-[0.4fr_1fr] lg:gap-10">
                  <dt>
                    <Link
                      href={`/glossary/${t.slug}`}
                      className="font-[family-name:var(--font-display)] text-xl hover:text-[var(--c-accent)] transition-colors"
                    >
                      {t.term}
                    </Link>
                  </dt>
                  <dd>
                    <p className="text-[var(--c-ink)]">{t.definition}</p>
                    {t.hypothetical && (
                      <p className="mt-2 text-sm text-[var(--c-ink-muted)] leading-relaxed">
                        <span className="font-semibold">Hypothetical: </span>
                        {t.hypothetical}
                      </p>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-12 text-center text-[var(--c-ink-muted)]">No terms match your search.</p>
      )}
    </div>
  );
}
