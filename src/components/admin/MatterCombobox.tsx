"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type MatterOption = { displayNumber: string; description: string };

/**
 * Type-ahead for the shared Clio / Time-Tracker matter list. Every typed word
 * must appear somewhere in the matter (number OR description), so a matter is
 * findable by case number, client name, opposing party, etc. Free text is
 * allowed too, for a matter that isn't in the list yet.
 */
export function MatterCombobox({ matters, value, onChange, placeholder, className }: { matters: MatterOption[]; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const options = useMemo(() => matters.map((m) => (m.description ? `${m.displayNumber} — ${m.description}` : m.displayNumber)), [matters]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = open ? (words.length ? options.filter((o) => { const hay = o.toLowerCase(); return words.every((w) => hay.includes(w)); }) : options).slice(0, 50) : [];

  useEffect(() => {
    function d(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", d);
    return () => document.removeEventListener("mousedown", d);
  }, []);

  const select = (v: string) => { onChange(v); setOpen(false); setHi(-1); };
  const base = className ?? "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

  return (
    <div ref={ref} className="relative">
      <input
        className={`${base} pr-9`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") { setOpen(true); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (hi >= 0 && hi < matches.length) { e.preventDefault(); select(matches[hi]); } }
          else if (e.key === "Escape" || e.key === "Tab") setOpen(false);
        }}
      />
      <ChevronDown size={15} className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 max-h-52 overflow-y-auto rounded-b-md border border-t-0 border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
          {matches.map((o, i) => (
            <div key={o} onClick={() => select(o)} onMouseEnter={() => setHi(i)} className={`cursor-pointer border-b border-[var(--c-border)] px-3 py-2 text-sm last:border-0 ${i === hi ? "bg-[var(--c-surface2)]" : ""}`}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
