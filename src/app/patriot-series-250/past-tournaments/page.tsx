import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trophy, Ban } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getPageVisibility } from "@/lib/patriot/visibility";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Past Tournaments · Patriot Series",
  description: "Every Patriot Series Wiffle Ball champion since the 2007 inaugural.",
  robots: { index: false, follow: false },
};

const INAUGURAL = 2007;
const LATEST = 2025; // 2026 is the upcoming USA 250 tournament

const CHAMPIONS: Record<number, { team: string; was?: string; players?: string }> = {
  2007: { team: "Team Cooper", players: "Andrew Cooper (c), Andrew Neathery, Nathan U., Kevin Conrad" },
  2008: { team: "Minutemen", was: "Texas Storm", players: "Max Smith (c), Garret Cooper, Adam Horton, Mark Horton" },
  2009: { team: "Bears", was: "Yellow Jackets", players: "Ross Pinkerton (c), Austen Williams, Adam Horton, Reid Pinkerton" },
  2010: { team: "The Neighbors", players: "Jason Freeman (c), Brantley Freeman" },
  2011: { team: "Ironsides", was: "Ft. Worth Ironbirds", players: "Paul Horton (c), Gabe Gumm, Braxton Feist" },
  2012: { team: "Minutemen", was: "Texas Storm", players: "Max Smith (c), Garret Cooper, Mark Horton" },
  2013: { team: "Minutemen", was: "Texas Storm", players: "Max Smith (c), Gabe Gumm, Jack Millan, Nick Gould" },
  2014: { team: "Dragons", was: "Team Potter", players: "Brandon Potter (c), Bandi Powell, Brandon Heitpas" },
  2015: { team: "Tribe", players: "Mark Horton (c), Mac Emrich, Rylan McBride" },
  2016: { team: "Pirates", players: "Brandon Heitpas (c), Michael Salas, Robbie Gould" },
  2017: { team: "Pirates", players: "Matthew Hunter (c)" },
  2018: { team: "Ironsides", players: "Paul Horton (c), Darren Neumann, James Ziemba" },
  2019: { team: "Minutemen" },
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default async function PastTournamentsPage() {
  const vis = await getPageVisibility();
  if (!vis["past-tournaments"]) redirect("/");

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
          The Patriot Series began around 2004 as pickup wiffle ball games at an annual Independence Day bar-b-que. By
          2007 it crowned its first true champion, and it&apos;s been played every Fourth of July since — fielding as
          many as 22 teams. The only missing year was 2020, cancelled due to COVID-19.
        </p>
      </section>

      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {rows.map((h) => {
          const champ = CHAMPIONS[h.year];
          return (
            <div
              key={h.year}
              className={`flex gap-5 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-5 ${h.cancelled ? "opacity-70" : ""}`}
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
                  <>
                    <p className="mt-1.5 text-sm text-[color:var(--psx-fg)]">
                      <span className="text-[color:var(--psx-faint)]">Champion · </span>
                      <span className="font-semibold">{champ.team}</span>
                      {champ.was && <span className="text-[color:var(--psx-faint)]"> ({champ.was})</span>}
                    </p>
                    {champ.players && <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--psx-muted)]">{champ.players}</p>}
                  </>
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
