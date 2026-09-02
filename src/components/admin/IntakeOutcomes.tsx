import { PieChart } from "lucide-react";

export type OutcomePoint = { status: string };

/**
 * Where intake leads end up — a four-way donut: converted, engagement letter
 * out (sent, awaiting signature), open / undetermined, and turned back
 * (declined, referred out, or client declined). Identity is carried by the
 * legend labels + counts, never color alone; slice colors are theme tokens so
 * the panel follows the admin palette.
 */
const BUCKETS = [
  { key: "converted", label: "Converted", match: new Set(["converted"]), color: "var(--c-success)" },
  { key: "letter", label: "Letter sent — still out", match: new Set(["letter-sent"]), color: "var(--c-accent)" },
  { key: "open", label: "Open / undetermined", match: new Set(["new", "contacted", "scheduled"]), color: "color-mix(in srgb, var(--c-ink-muted) 45%, var(--c-surface))" },
  { key: "turnback", label: "Turned back", match: new Set(["declined", "referred-out", "client-declined"]), color: "var(--c-error)" },
] as const;

export function IntakeOutcomes({ points }: { points: OutcomePoint[] }) {
  const total = points.length;
  const counts = BUCKETS.map((b) => ({ ...b, count: points.filter((p) => b.match.has(p.status)).length }));
  const decided = counts.find((c) => c.key === "converted")!.count + counts.find((c) => c.key === "turnback")!.count;
  const converted = counts.find((c) => c.key === "converted")!.count;
  const convPct = decided ? Math.round((converted / decided) * 100) : 0;

  // Donut geometry: r=40 ring, slices as stroked arcs with a 2px surface gap.
  const R = 40, C = 2 * Math.PI * R;
  const present = counts.filter((c) => c.count > 0);
  const slices = present.map((c, i) => {
    const frac = c.count / total;
    const start = present.slice(0, i).reduce((s, p) => s + (p.count / total) * C, 0);
    return { ...c, frac, dash: Math.max(0, frac * C - 2), start };
  });

  return (
    <section className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><PieChart size={16} className="text-[var(--c-accent)]" /> Lead outcomes</h2>
        {decided > 0 && (
          <span className="text-sm text-[var(--c-ink-muted)]"><strong className="text-[var(--c-ink)]">{convPct}%</strong> of decided leads converted</span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-[var(--c-ink-muted)]">No intake submissions yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-8">
          <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0" role="img" aria-label={`Lead outcomes: ${counts.map((c) => `${c.label} ${c.count}`).join(", ")}`}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--c-surface-2)" strokeWidth="14" />
            {slices.map((s) => (
              <circle
                key={s.key}
                cx="50" cy="50" r={R} fill="none"
                stroke={s.color} strokeWidth="14"
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.start}
                transform="rotate(-90 50 50)"
              >
                <title>{`${s.label}: ${s.count} (${Math.round(s.frac * 100)}%)`}</title>
              </circle>
            ))}
            <text x="50" y="47" textAnchor="middle" fill="var(--c-ink)" style={{ font: "700 16px var(--font-ui, sans-serif)" }}>{total}</text>
            <text x="50" y="61" textAnchor="middle" fill="var(--c-ink-muted)" style={{ font: "9px var(--font-ui, sans-serif)" }}>leads</text>
          </svg>

          <ul className="min-w-[220px] flex-1 space-y-2.5">
            {counts.map((c) => (
              <li key={c.key} className="flex items-center gap-3 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} />
                <span className="flex-1 text-[var(--c-ink)]">{c.label}</span>
                <span className="tabular-nums font-medium">{c.count}</span>
                <span className="w-10 text-right tabular-nums text-xs text-[var(--c-ink-muted)]">{total ? Math.round((c.count / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
        Counts every submission, including archived ones. &ldquo;Letter sent&rdquo; means an engagement letter went out and hasn&apos;t been signed or declined yet; the conversion rate compares signed-up clients against leads that reached a final answer either way.
      </p>
    </section>
  );
}
