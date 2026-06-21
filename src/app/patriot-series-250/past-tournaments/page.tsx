import type { Metadata } from "next";
import { Trophy, Ban } from "lucide-react";
import { PatriotShell } from "../PatriotShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Past Tournaments · Patriot Series 250",
  description: "Every Patriot Series Wiffle Ball tournament since the 2007 inaugural.",
  robots: { index: false, follow: false },
};

const INAUGURAL = 2007;
const LATEST = 2025; // 2026 is the upcoming USA 250 tournament

function buildHistory() {
  const rows: { year: number; edition: number | null; cancelled: boolean }[] = [];
  let edition = 0;
  for (let y = INAUGURAL; y <= LATEST; y++) {
    const cancelled = y === 2020;
    if (!cancelled) edition += 1;
    rows.push({ year: y, edition: cancelled ? null : edition, cancelled });
  }
  return rows.reverse(); // newest first
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default function PastTournamentsPage() {
  const history = buildHistory();
  const played = history.filter((h) => !h.cancelled).length;

  return (
    <PatriotShell active="/past-tournaments">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[color:var(--psx-accent)]">Patriot Series</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">Past Tournaments</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--psx-muted)]">
          Played every year since the inaugural tournament in {INAUGURAL} — {played} editions and counting. The only
          exception was 2020, cancelled due to COVID-19.
        </p>
      </header>

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {history.map((h) => (
          <div
            key={h.year}
            className={`flex items-center gap-5 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-5 ${h.cancelled ? "opacity-70" : ""}`}
          >
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border ${h.cancelled ? "border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] text-[color:var(--psx-faint)]" : "border-yellow-400/30 bg-yellow-400/10 text-yellow-500"}`}
            >
              {h.cancelled ? <Ban size={24} strokeWidth={1.5} /> : <Trophy size={26} strokeWidth={1.5} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className={`font-[family-name:var(--font-display)] text-2xl font-bold leading-none ${h.cancelled ? "text-[color:var(--psx-faint)]" : "text-[color:var(--psx-fg)]"}`}>{h.year}</p>
                {h.edition && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">{ordinal(h.edition)} Annual</p>
                )}
              </div>
              <p className="mt-1.5 text-sm text-[color:var(--psx-muted)]">Patriot Series</p>
              <p className={`mt-0.5 text-[11px] uppercase tracking-wider ${h.cancelled ? "text-[color:var(--psx-live)]" : "text-[color:var(--psx-faint)]"}`}>
                {h.cancelled ? "Cancelled · COVID-19" : "Champion TBA"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] text-[color:var(--psx-faint)]">Champions and results can be added from the admin panel.</p>
    </PatriotShell>
  );
}
