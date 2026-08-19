"use client";

import { useMemo, useState } from "react";
import { Scale, Download, ChevronDown, Send } from "lucide-react";

export type OutboundPoint = { createdAt: string; referredTo: string };
type Preset = "month" | "year" | "lastYear" | "all" | "custom";

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Split a stored "referred to" value into individual attorney names — old
 *  entries joined several with commas / "and", and we want each counted once. */
function splitNames(s: string): string[] {
  return s
    .split(/,|;|·|\band\b|&/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Where WE send our referrals — a ranked chart of the attorneys the firm has
 * referred prospects out to, with how many went to each, over a chosen period.
 * The mirror image of "who refers us business."
 */
export function OutboundReferrals({ referrals }: { referrals: OutboundPoint[] }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("year");
  const now = new Date();
  const [from, setFrom] = useState(toIso(new Date(now.getFullYear(), 0, 1)));
  const [to, setTo] = useState(toIso(now));

  const range = useMemo(() => {
    const n = new Date();
    if (preset === "month") return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59), label: n.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
    if (preset === "year") return { start: new Date(n.getFullYear(), 0, 1), end: new Date(n.getFullYear(), 11, 31, 23, 59, 59), label: `${n.getFullYear()}` };
    if (preset === "lastYear") return { start: new Date(n.getFullYear() - 1, 0, 1), end: new Date(n.getFullYear() - 1, 11, 31, 23, 59, 59), label: `${n.getFullYear() - 1}` };
    if (preset === "custom") return { start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59`), label: `${from} to ${to}` };
    return { start: new Date(0), end: new Date(n.getFullYear() + 1, 0, 1), label: "All time" };
  }, [preset, from, to]);

  const rows = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    let total = 0;
    for (const r of referrals) {
      const d = new Date(r.createdAt);
      if (d < range.start || d > range.end) continue;
      for (const name of splitNames(r.referredTo)) {
        const key = name.toLowerCase();
        const cur = counts.get(key) ?? { name, count: 0 };
        cur.count += 1;
        counts.set(key, cur);
        total += 1;
      }
    }
    const list = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const max = list.reduce((m, r) => Math.max(m, r.count), 0);
    return { list, total, max };
  }, [referrals, range]);

  function downloadCsv() {
    const lines = ["Attorney,Referrals sent"];
    for (const r of rows.list) lines.push([`"${r.name.replace(/"/g, '""')}"`, r.count].join(","));
    lines.push(["TOTAL", rows.total].join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `referrals-sent-${range.label.replace(/\s+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const presetBtn = (p: Preset, label: string) => (
    <button onClick={() => setPreset(p)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${preset === p ? "bg-[var(--c-accent)] text-white" : "border border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`}>{label}</button>
  );

  return (
    <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Send size={16} className="text-[var(--c-accent)]" />
        <span className="flex-1 text-sm font-semibold text-[var(--c-ink)]">Where we send our referrals</span>
        <span className="text-xs text-[var(--c-ink-muted)]">{rows.total} sent in {range.label}</span>
        <ChevronDown size={16} className={`text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--c-border)] p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {presetBtn("month", "This month")}
            {presetBtn("year", "This year")}
            {presetBtn("lastYear", "Last year")}
            {presetBtn("all", "All time")}
            {presetBtn("custom", "Custom")}
            {preset === "custom" && (
              <span className="flex items-center gap-1.5 text-xs">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1" />
                <span className="text-[var(--c-ink-muted)]">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1" />
              </span>
            )}
            <button onClick={downloadCsv} disabled={rows.total === 0} className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50"><Download size={13} /> CSV</button>
          </div>

          {rows.total === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--c-ink-muted)]">No referrals sent out in this period.</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.list.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-center gap-2.5 text-sm">
                  <span className="w-4 shrink-0 text-right text-xs text-[var(--c-ink-muted)]">{i + 1}</span>
                  <Scale size={13} className="shrink-0 text-[#7a1f2b]" />
                  <span className="w-40 shrink-0 truncate text-[var(--c-ink)]" title={r.name}>{r.name}</span>
                  <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--c-surface2)]">
                    <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${rows.max ? (r.count / rows.max) * 100 : 0}%`, background: "#7a1f2b" }} />
                  </span>
                  <span className="w-6 shrink-0 text-right font-medium text-[var(--c-ink)]">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
