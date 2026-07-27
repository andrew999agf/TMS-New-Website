"use client";

import { useMemo, useState } from "react";
import { Users, Scale, Download, ChevronDown, BarChart3 } from "lucide-react";

export type ReferrerPoint = { createdAt: string; name: string; kind: "attorney" | "other" };
type Preset = "month" | "year" | "lastYear" | "all" | "custom";

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Who refers us business — a ranked chart of named referrers (attorneys and
 * friends/family/past clients). The two checkboxes let you show only attorney
 * referrers, only the others, or both combined, so the firm can see its top
 * referral sources.
 */
export function ReferralSources({ referrers }: { referrers: ReferrerPoint[] }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("year");
  const now = new Date();
  const [from, setFrom] = useState(toIso(new Date(now.getFullYear(), 0, 1)));
  const [to, setTo] = useState(toIso(now));
  const [showAttorneys, setShowAttorneys] = useState(true);
  const [showOthers, setShowOthers] = useState(true);

  const range = useMemo(() => {
    const n = new Date();
    if (preset === "month") return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59), label: n.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
    if (preset === "year") return { start: new Date(n.getFullYear(), 0, 1), end: new Date(n.getFullYear(), 11, 31, 23, 59, 59), label: `${n.getFullYear()}` };
    if (preset === "lastYear") return { start: new Date(n.getFullYear() - 1, 0, 1), end: new Date(n.getFullYear() - 1, 11, 31, 23, 59, 59), label: `${n.getFullYear() - 1}` };
    if (preset === "custom") return { start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59`), label: `${from} to ${to}` };
    return { start: new Date(0), end: new Date(n.getFullYear() + 1, 0, 1), label: "All time" };
  }, [preset, from, to]);

  const rows = useMemo(() => {
    const counts = new Map<string, { name: string; kind: "attorney" | "other"; count: number }>();
    let total = 0;
    for (const r of referrers) {
      if (r.kind === "attorney" && !showAttorneys) continue;
      if (r.kind === "other" && !showOthers) continue;
      const d = new Date(r.createdAt);
      if (d < range.start || d > range.end) continue;
      const key = `${r.kind}::${r.name.trim().toLowerCase()}`;
      const cur = counts.get(key) ?? { name: r.name.trim(), kind: r.kind, count: 0 };
      cur.count += 1;
      counts.set(key, cur);
      total += 1;
    }
    const list = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const max = list.reduce((m, r) => Math.max(m, r.count), 0);
    return { list, total, max };
  }, [referrers, range, showAttorneys, showOthers]);

  function downloadCsv() {
    const lines = ["Referrer,Type,Referrals"];
    for (const r of rows.list) lines.push([`"${r.name.replace(/"/g, '""')}"`, r.kind === "attorney" ? "Attorney" : "Friend/Family/Client", r.count].join(","));
    lines.push(["TOTAL", "", rows.total].join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `referral-sources-${range.label.replace(/\s+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const presetBtn = (p: Preset, label: string) => (
    <button onClick={() => setPreset(p)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${preset === p ? "bg-[var(--c-accent)] text-white" : "border border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`}>{label}</button>
  );

  return (
    <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <BarChart3 size={16} className="text-[var(--c-accent)]" />
        <span className="flex-1 text-sm font-semibold text-[var(--c-ink)]">Who refers us business</span>
        <span className="text-xs text-[var(--c-ink-muted)]">{rows.total} referral{rows.total === 1 ? "" : "s"} in {range.label}</span>
        <ChevronDown size={16} className={`text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--c-border)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
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

          <div className="mb-4 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showAttorneys} onChange={(e) => setShowAttorneys(e.target.checked)} /><Scale size={13} className="text-[var(--c-accent)]" /> Attorney referrals</label>
            <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} /><Users size={13} className="text-[var(--c-accent)]" /> Friends, family &amp; past clients</label>
          </div>

          {rows.total === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--c-ink-muted)]">{!showAttorneys && !showOthers ? "Select at least one referral type above." : "No named referrals in this period."}</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.list.map((r, i) => (
                <li key={`${r.kind}-${r.name}-${i}`} className="flex items-center gap-2.5 text-sm">
                  <span className="w-4 shrink-0 text-right text-xs text-[var(--c-ink-muted)]">{i + 1}</span>
                  {r.kind === "attorney" ? <Scale size={13} className="shrink-0 text-[#7a1f2b]" /> : <Users size={13} className="shrink-0 text-[#1b3a6b]" />}
                  <span className="w-40 shrink-0 truncate text-[var(--c-ink)]" title={r.name}>{r.name}</span>
                  <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--c-surface2)]">
                    <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${rows.max ? (r.count / rows.max) * 100 : 0}%`, background: r.kind === "attorney" ? "#7a1f2b" : "#1b3a6b" }} />
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
