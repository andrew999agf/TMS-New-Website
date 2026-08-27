import { AMOUNT_RANGE } from "@/lib/intake/config";
import { TrendingUp } from "lucide-react";

export type AmountPoint = { createdAt: string; range: string };

/** Buckets we treat as "higher-value" leads ($100k+), excluding "Not sure". */
const HIGH_VALUE = new Set<string>(["$100,000–$500,000", "$500,000–$1M", "Over $1M"]);

const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

/**
 * Lead-value metrics for the intake dashboard: the distribution of the
 * amount-in-controversy ranges people select, and a month-by-month trend of how
 * often leads land in the higher-value bands — so you can see whether SEO and
 * other changes are bringing in bigger matters over time.
 */
export function AmountMetrics({ points }: { points: AmountPoint[] }) {
  const known = points.filter((p) => p.range && p.range !== "Not sure");
  const total = points.length;

  // Distribution across every bucket (including "Not sure").
  const dist = AMOUNT_RANGE.map((range) => ({ range, count: points.filter((p) => p.range === range).length }));
  const distMax = Math.max(1, ...dist.map((d) => d.count));

  const highCount = known.filter((p) => HIGH_VALUE.has(p.range)).length;
  const highPct = known.length ? Math.round((highCount / known.length) * 100) : 0;

  // Last 6 calendar months present: % of known-value leads that are $100k+.
  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const trend = months.map((m) => {
    const inMonth = known.filter((p) => monthKey(p.createdAt) === m);
    const high = inMonth.filter((p) => HIGH_VALUE.has(p.range)).length;
    return { month: m, n: inMonth.length, pct: inMonth.length ? Math.round((high / inMonth.length) * 100) : 0 };
  });

  return (
    <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><TrendingUp size={16} className="text-[var(--c-accent)]" /> Amount in controversy</h2>
        {known.length > 0 && (
          <span className="text-sm text-[var(--c-ink-muted)]"><strong className="text-[var(--c-ink)]">{highPct}%</strong> are $100k+</span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-[var(--c-ink-muted)]">No amount-in-controversy answers yet. New leads that select a range will appear here.</p>
      ) : (
        <>
          {/* Distribution */}
          <ul className="space-y-2">
            {dist.map((d) => (
              <li key={d.range} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-[var(--c-ink-muted)]">{d.range}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--c-surface-2)]">
                  <span className={`block h-full ${d.range === "Not sure" ? "bg-[var(--c-ink-muted)]/50" : "bg-[var(--c-accent)]"}`} style={{ width: `${(d.count / distMax) * 100}%` }} />
                </span>
                <span className="w-8 text-right tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>

          {/* Trend — share of higher-value leads by month */}
          <div className="mt-6 border-t border-[var(--c-border)] pt-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Share of $100k+ leads by month</div>
            <div className="flex items-end gap-2">
              {trend.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(t.month)}: ${t.pct}% of ${t.n} lead${t.n === 1 ? "" : "s"} were $100k+`}>
                  <div className="flex h-24 w-full items-end">
                    <span className="w-full rounded-t bg-[var(--c-accent)]" style={{ height: `${t.n ? Math.max(4, t.pct) : 0}%` }} />
                  </div>
                  <span className="text-[11px] tabular-nums text-[var(--c-ink)]">{t.n ? `${t.pct}%` : "—"}</span>
                  <span className="text-[10px] text-[var(--c-ink-muted)]">{monthLabel(t.month)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
              Each bar is the percentage of that month&apos;s leads (with a stated amount) that fell in the $100k+ bands. &ldquo;Not sure&rdquo; answers are excluded from the percentage. Watch this rise as SEO and marketing changes take hold.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
