"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type MatterOption = { displayNumber: string; description: string };

/**
 * Matter type-ahead that behaves exactly like the Time Tracker's picker: you can
 * search by case number OR anything in the description, but the VALUE it stores
 * is only the bare display number (the billing merge key) — never the number
 * plus the description. Typing free text stores it verbatim, so a code that
 * isn't in the list yet still works.
 *
 * This mirrors the tracker's internal combobox deliberately; the tracker keeps
 * its own copy and is left untouched.
 */
export function MatterPicker({
  matters,
  value,
  onChange,
  placeholder,
  inputClass,
}: {
  matters: MatterOption[];
  value: string;
  onChange: (displayNumber: string) => void;
  placeholder?: string;
  inputClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (m: MatterOption) => {
    const hay = `${m.displayNumber} ${m.description}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const matches = open ? (words.length ? matters.filter(hit) : matters).slice(0, 50) : [];

  useEffect(() => {
    function d(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", d);
    return () => document.removeEventListener("mousedown", d);
  }, []);

  const select = (m: MatterOption) => {
    onChange(m.displayNumber);
    setOpen(false);
    setHi(-1);
  };

  const base =
    inputClass ??
    "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

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
          {matches.map((m, i) => (
            <div key={m.displayNumber} onClick={() => select(m)} onMouseEnter={() => setHi(i)} className={`cursor-pointer border-b border-[var(--c-border)] px-3 py-2 last:border-0 ${i === hi ? "bg-[var(--c-surface2)]" : ""}`}>
              <div className="text-sm font-medium">{m.displayNumber}</div>
              {m.description && <div className="truncate text-xs text-[var(--c-ink-muted)]">{m.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
