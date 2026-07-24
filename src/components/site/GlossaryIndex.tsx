"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, ChevronDown, Check } from "lucide-react";

export type GlossItem = {
  slug: string;
  term: string;
  definition: string;
  hypothetical: string;
  practices: string[];
};

export function GlossaryIndex({ terms, practiceAreas }: { terms: GlossItem[]; practiceAreas: { slug: string; title: string }[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Only offer practice areas that actually tag a term.
  const usable = useMemo(() => {
    const used = new Set<string>();
    for (const t of terms) for (const p of t.practices) used.add(p);
    return practiceAreas.filter((p) => used.has(p.slug));
  }, [terms, practiceAreas]);

  // Default: everything selected.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(usable.map((p) => p.slug)));
  const allOn = selected.size === usable.length;

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (slug: string) => setSelected((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return terms.filter((t) => {
      if (needle && !(t.term.toLowerCase().includes(needle) || t.definition.toLowerCase().includes(needle))) return false;
      // Untagged terms are general and always show; tagged terms need a selected practice.
      if (!allOn && t.practices.length > 0 && !t.practices.some((p) => selected.has(p))) return false;
      return true;
    });
  }, [terms, q, selected, allOn]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {usable.length > 0 && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-2 border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5 text-sm hover:border-[var(--c-accent)]"
            >
              <SlidersHorizontal size={15} />
              {allOn ? "All practice areas" : `${selected.size} of ${usable.length} areas`}
              <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="absolute right-0 z-30 mt-1 w-64 max-h-80 overflow-y-auto border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
                <div className="flex items-center justify-between border-b border-[var(--c-border)] px-3 py-2 text-xs">
                  <button onClick={() => setSelected(new Set(usable.map((p) => p.slug)))} className="text-[var(--c-accent)]">Select all</button>
                  <button onClick={() => setSelected(new Set())} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Clear</button>
                </div>
                {usable.map((p) => {
                  const on = selected.has(p.slug);
                  return (
                    <button key={p.slug} onClick={() => toggle(p.slug)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--c-surface2)]">
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)]"}`}>{on && <Check size={12} />}</span>
                      <span className="min-w-0 flex-1">{p.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 space-y-12">
        {groups.map(([letter, items]) => (
          <section key={letter} id={letter}>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--c-accent)] border-b border-[var(--c-border)] pb-2">{letter}</h2>
            <dl className="mt-6 space-y-8">
              {items.map((t) => (
                <div key={t.slug} className="grid gap-2 lg:grid-cols-[0.4fr_1fr] lg:gap-10">
                  <dt>
                    <Link href={`/glossary/${t.slug}`} className="font-[family-name:var(--font-display)] text-xl hover:text-[var(--c-accent)] transition-colors">{t.term}</Link>
                  </dt>
                  <dd>
                    <p className="text-[var(--c-ink)]">{t.definition}</p>
                    {t.hypothetical && (
                      <p className="mt-2 text-sm text-[var(--c-ink-muted)] leading-relaxed">
                        <span className="font-semibold">Hypothetical: </span>{t.hypothetical}
                      </p>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {filtered.length === 0 && <p className="mt-12 text-center text-[var(--c-ink-muted)]">No terms match your filters.</p>}
    </div>
  );
}
