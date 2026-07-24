"use client";

import { useMemo, useState } from "react";
import { PieChart, Table as TableIcon, Download, ChevronDown } from "lucide-react";

export type LeadPoint = { createdAt: string; source: string | null };
type Preset = "month" | "year" | "lastYear" | "all" | "custom";

const COLORS = ["#7a1f2b", "#1b3a6b", "#2f7d5b", "#b8860b", "#6b4c9a", "#c05621", "#2c7a7b", "#9b2c2c", "#4a5568", "#718096", "#805ad5", "#dd6b20"];
const UNKNOWN = "Not asked / unknown";
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function LeadSources({ leads }: { leads: LeadPoint[] }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("year");
  const now = new Date();
  const [from, setFrom] = useState(toIso(new Date(now.getFullYear(), 0, 1)));
  const [to, setTo] = useState(toIso(now));
  const [view, setView] = useState<"table" | "chart">("chart");

  const range = useMemo(() => {
    const n = new Date();
    if (preset === "month") return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59), label: n.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
    if (preset === "year") return { start: new Date(n.getFullYear(), 0, 1), end: new Date(n.getFullYear(), 11, 31, 23, 59, 59), label: `${n.getFullYear()}` };
    if (preset === "lastYear") return { start: new Date(n.getFullYear() - 1, 0, 1), end: new Date(n.getFullYear() - 1, 11, 31, 23, 59, 59), label: `${n.getFullYear() - 1}` };
    if (preset === "custom") return { start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59`), label: `${from} to ${to}` };
    return { start: new Date(0), end: new Date(n.getFullYear() + 1, 0, 1), label: "All time" };
  }, [preset, from, to]);

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const l of leads) {
      const d = new Date(l.createdAt);
      if (d < range.start || d > range.end) continue;
      const key = (l.source ?? "").trim() || UNKNOWN;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
    const list = [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
    return { list: list.map((r, i) => ({ ...r, pct: total ? (r.count / total) * 100 : 0, color: COLORS[i % COLORS.length] })), total };
  }, [leads, range]);

  const gradient = useMemo(() => {
    if (rows.total === 0) return "var(--c-surface2)";
    let acc = 0;
    const stops = rows.list.map((r) => { const start = acc; acc += r.pct; return `${r.color} ${start}% ${acc}%`; });
    return `conic-gradient(${stops.join(", ")})`;
  }, [rows]);

  function downloadCsv() {
    const lines = ["Source,Leads,Percent"];
    for (const r of rows.list) lines.push([`"${r.source.replace(/"/g, '""')}"`, r.count, `${r.pct.toFixed(1)}%`].join(","));
    lines.push(["TOTAL", rows.total, "100%"].join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lead-sources-${range.label.replace(/\s+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const presetBtn = (p: Preset, label: string) => (
    <button onClick={() => setPreset(p)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${preset === p ? "bg-[var(--c-accent)] text-white" : "border border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`}>{label}</button>
  );

  return (
    <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <PieChart size={16} className="text-[var(--c-accent)]" />
        <span className="flex-1 text-sm font-semibold text-[var(--c-ink)]">Where leads come from</span>
        <span className="text-xs text-[var(--c-ink-muted)]">{rows.total} in {range.label}</span>
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
            <span className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setView(view === "chart" ? "table" : "chart")} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:bg-[var(--c-surface2)]">
                {view === "chart" ? <><TableIcon size={13} /> Table</> : <><PieChart size={13} /> Chart</>}
              </button>
              <button onClick={downloadCsv} disabled={rows.total === 0} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50"><Download size={13} /> CSV</button>
            </span>
          </div>

          {rows.total === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--c-ink-muted)]">No leads in this period.</p>
          ) : view === "chart" ? (
            <div className="flex flex-wrap items-center gap-6">
              <div className="h-44 w-44 shrink-0 rounded-full" style={{ background: gradient }} aria-hidden />
              <ul className="min-w-[14rem] flex-1 space-y-1.5">
                {rows.list.map((r) => (
                  <li key={r.source} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.color }} />
                    <span className="min-w-0 flex-1 truncate text-[var(--c-ink)]">{r.source}</span>
                    <span className="shrink-0 text-[var(--c-ink-muted)]">{r.count} · {r.pct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--c-border)] text-left text-xs text-[var(--c-ink-muted)]">
                  <th className="py-1.5">Source</th><th className="py-1.5 text-right">Leads</th><th className="py-1.5 text-right">Percent</th>
                </tr>
              </thead>
              <tbody>
                {rows.list.map((r) => (
                  <tr key={r.source} className="border-b border-[var(--c-border)]/60">
                    <td className="py-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: r.color }} />{r.source}</td>
                    <td className="py-1.5 text-right">{r.count}</td>
                    <td className="py-1.5 text-right text-[var(--c-ink-muted)]">{r.pct.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{rows.total}</td><td className="py-1.5 text-right">100%</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
