import type { Metadata } from "next";
import { Trophy, Ban } from "lucide-react";
import { PatriotShell } from "../PatriotShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Past Tournaments · Patriot Series",
  description: "Every Patriot Series Wiffle Ball champion since the 2007 inaugural.",
  robots: { index: false, follow: false },
};

const INAUGURAL = 2007;
const LATEST = 2025; // 2026 is the upcoming USA 250 tournament

// Champions from the Patriot Series record books (current team name · then-name).
const CHAMPIONS: Record<number, { team: string; was?: string }> = {
  2007: { team: "Team Cooper" },
  2008: { team: "Minutemen", was: "Texas Storm" },
  2009: { team: "Bears", was: "Yellow Jackets" },
  2010: { team: "The Neighbors" },
  2011: { team: "Ironsides", was: "Ft. Worth Ironbirds" },
  2012: { team: "Minutemen", was: "Texas Storm" },
  2013: { team: "Minutemen", was: "Texas Storm" },
  2014: { team: "Dragons", was: "Team Potter" },
  2015: { team: "Tribe" },
  2016: { team: "Pirates" },
  2017: { team: "Irrigators" },
  2018: { team: "Ironsides" },
  2019: { team: "Minutemen" },
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default function PastTournamentsPage() {
  const rows: { year: number; edition: number | null; cancelled: boolean }[] = [];
  let edition = 0;
  for (let y = INAUGURAL; y <= LATEST; y++) {
    const cancelled = y === 2020;
    if (!cancelled) edition += 1;
    rows.push({ year: y, edition: cancelled ? null : edition, cancelled });
  }
  rows.reverse();

  return (
    <PatriotShell
      active="/past-tournaments"
      title="Past Tournaments"
      subtitle="A Fourth of July tradition in Granbury, Texas since 2007."
    >
      <section className="mx-auto max-w-3xl text-sm leading-relaxed text-[color:var(--psx-muted)]">
        <p>
          The Patriot Series began around 2004 as pickup wiffle ball games at an annual Independence Day bar-b-que.
          By 2007 it had its first true champion, and it&apos;s been played every Fourth of July since — fielding as
          many as 22 teams and showcasing some of the best wiffle ball talent west of the Mississippi. The only
          missing year was 2020, cancelled due to COVID-19.
        </p>
      </section>

      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {rows.map((h) => {
          const champ = CHAMPIONS[h.year];
          return (
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
                  {h.edition && <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">{ordinal(h.edition)} Annual</p>}
                </div>
                {h.cancelled ? (
                  <p className="mt-1.5 text-[11px] uppercase tracking-wider text-[color:var(--psx-live)]">Cancelled · COVID-19</p>
                ) : champ ? (
                  <p className="mt-1.5 text-sm text-[color:var(--psx-fg)]">
                    <span className="text-[color:var(--psx-faint)]">Champion · </span>
                    <span className="font-semibold">{champ.team}</span>
                    {champ.was && <span className="text-[color:var(--psx-faint)]"> ({champ.was})</span>}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] uppercase tracking-wider text-[color:var(--psx-faint)]">Champion TBA</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PatriotShell>
  );
}
