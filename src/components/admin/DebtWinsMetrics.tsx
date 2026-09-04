"use client";

import { TrendingUp, PieChart } from "lucide-react";
import { netAmount, type DebtWinRow } from "./DebtWinsManager";

/**
 * Metrics for the debt-defense log: average/median/largest claim and win
 * rate, plus donuts by court, county (read out of the court name), and
 * outcome. Identity is always carried by the legend labels and counts — the
 * validated categorical palette is decoration, not the only signal.
 */

const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "color-mix(in srgb, var(--c-ink-muted) 45%, var(--c-surface))";

const OUTCOME_LABEL: Record<string, string> = {
  nonsuit: "Non-suited",
  judgment: "Judgment for defendant",
  "dismissed-wp": "Dismissed with prejudice",
  "dismissed-wop": "Dismissed without prejudice",
  "dismissed-smj": "Dismissed — no subject-matter jurisdiction",
  settled: "Settled",
  "judgment-plaintiff": "Judgment for plaintiff",
  other: "Other win",
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** "JP Precinct 4, Tarrant County" → "Tarrant". Last "X County" wins. */
function countyOf(court: string): string {
  const m = [...court.matchAll(/([A-Za-z][A-Za-z .'-]*?)\s+County\b/gi)];
  if (!m.length) return "Not specified";
  const raw = m[m.length - 1][1].trim().split(/\s+/).slice(-2).join(" ");
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Count values, keep the top 5, fold the rest into "Other". */
function bucketize(values: string[]): { label: string; count: number; color: string }[] {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, 5).map(([label, count], i) => ({ label, count, color: PALETTE[i] }));
  const rest = sorted.slice(5).reduce((s, [, c]) => s + c, 0);
  if (rest > 0) top.push({ label: "Other", count: rest, color: OTHER_COLOR });
  return top;
}

function Donut({ title, slices }: { title: string; slices: { label: string; count: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total === 0) return null;
  const R = 40, C = 2 * Math.PI * R;
  const arcs = slices.map((s, i) => {
    const frac = s.count / total;
    const start = slices.slice(0, i).reduce((acc, p) => acc + (p.count / total) * C, 0);
    return { ...s, frac, dash: Math.max(0, frac * C - 2), start };
  });
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{title}</p>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--c-surface-2)" strokeWidth="14" />
          {arcs.map((s) => (
            <circle key={s.label} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.start} transform="rotate(-90 50 50)">
              <title>{`${s.label}: ${s.count} (${Math.round(s.frac * 100)}%)`}</title>
            </circle>
          ))}
          <text x="50" y="54" textAnchor="middle" fill="var(--c-ink)" style={{ font: "700 15px var(--font-ui, sans-serif)" }}>{total}</text>
        </svg>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {arcs.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-[var(--c-ink)]" title={s.label}>{s.label}</span>
              <span className="tabular-nums font-medium">{s.count}</span>
              <span className="w-9 text-right tabular-nums text-[var(--c-ink-muted)]">{Math.round(s.frac * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DebtWinsMetrics({ rows }: { rows: DebtWinRow[] }) {
  if (rows.length === 0) return null;
  const wins = rows.filter((r) => r.outcome !== "judgment-plaintiff");
  // Settlements count only the unpaid part of the claim.
  const amounts = wins.map((r) => netAmount(r)).filter((a) => a > 0).sort((a, b) => a - b);
  const avg = amounts.length ? amounts.reduce((s, a) => s + a, 0) / amounts.length : 0;
  const median = amounts.length ? amounts[Math.floor((amounts.length - 1) / 2)] : 0;
  const largest = amounts.length ? amounts[amounts.length - 1] : 0;
  const winRate = Math.round((wins.length / rows.length) * 100);

  const tiles = [
    { v: money(avg), l: "Average claim defeated" },
    { v: money(median), l: "Median claim" },
    { v: money(largest), l: "Largest claim defeated" },
    { v: `${winRate}%`, l: `Win rate (${wins.length} of ${rows.length})` },
  ];

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-ui)] text-sm font-semibold"><TrendingUp size={15} className="text-[var(--c-accent)]" /> Metrics</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.l} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-center">
            <div className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">{t.v}</div>
            <div className="mt-1 text-[11px] text-[var(--c-ink-muted)]">{t.l}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Donut title="Cases by court" slices={bucketize(rows.map((r) => (r.redacted ? "Confidential" : r.court.trim() || "Not specified")))} />
        <Donut title="Cases by county" slices={bucketize(rows.map((r) => (r.redacted ? "Confidential" : countyOf(r.court))))} />
        <Donut title="Cases by outcome" slices={bucketize(rows.map((r) => OUTCOME_LABEL[r.outcome] ?? r.outcome))} />
        <Donut title="Cases by plaintiff" slices={bucketize(rows.map((r) => (r.redacted ? "Confidential" : r.plaintiff.trim() || "Not specified")))} />
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--c-ink-muted)]"><PieChart size={12} /> County is read from the court name (&ldquo;…, Tarrant County&rdquo;). Averages use wins with an amount; win rate counts plaintiff judgments against the record.</p>
    </section>
  );
}
