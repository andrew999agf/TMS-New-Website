import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trophy, Ban } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { getSetting } from "@/lib/content";
import { PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotTeam } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Past Tournaments · Patriot Series",
  description: "Every Patriot Series Wiffle Ball champion since the 2007 inaugural.",
  robots: { index: false, follow: false },
};

const INAUGURAL = 2007;
const LATEST = 2025; // 2026 is the upcoming USA 250 tournament

type Champion = { team: string | null; captain?: string; roster?: string[]; note?: string };

const CHAMPIONS: Record<number, Champion> = {
  2025: { team: "Minutemen", captain: "Max S.", roster: ["Brian B.", "Oliver B."] },
  2024: { team: "Founding Fathers" },
  2023: { team: "Whalers", roster: ["Adam H.", "Trey H.", "Brennan B."] },
  2022: { team: "Founding Fathers" },
  2021: { team: "Founding Fathers" },
  2019: { team: "Minutemen", captain: "Max S.", roster: ["Brian B.", "Oliver B."] },
  2018: { team: "Ironsides", captain: "Paul H.", roster: ["Darren N.", "James Z."] },
  2017: { team: null, captain: "Matthew H.", roster: ["Brandon M.", "Garrett G."], note: "Team name lost — the trophy is dented right where it's written" },
  2016: { team: "Pirates", captain: "Brandon H.", roster: ["Michael S.", "Robbie G."] },
  2015: { team: "The Tribe", captain: "Mark H.", roster: ["Mac E.", "Rylan M."] },
  2014: { team: "Team Potter", captain: "Brandon P.", roster: ["Mandy P.", "Brandon H."] },
  2013: { team: "Texas Storm", captain: "Max S.", roster: ["Gabe G.", "Jack M.", "Nick C."] },
  2012: { team: "Texas Storm", captain: "Max S.", roster: ["Garrett C.", "Mark H."] },
  2011: { team: "Ft. Worth Ironbirds", captain: "Paul H.", roster: ["Braxton F.", "Gage G."] },
  2010: { team: "The Neighbors", captain: "Jayson F." },
  2009: { team: "Yellow Jackets", captain: "Ross P.", roster: ["Adam H.", "Austin W.", "Reid P."] },
  2008: { team: "Texas Storm", captain: "Max S.", roster: ["Garrett C.", "Adam H.", "Mark H."] },
  2007: { team: "Team Cooper", captain: "Andrew C.", roster: ["Andrew N.", "Nathan U."] },
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "The Tribe" / "Tribe" / "the Neighbors" all match the same team entry. */
const normalizeName = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();

/** Captain first (marked), then the rest of the roster. */
function playersLine(c: Champion): string {
  const parts = [...(c.captain ? [`${c.captain} (c)`] : []), ...(c.roster ?? [])];
  return parts.join(", ");
}

export default async function PastTournamentsPage() {
  const vis = await getPageVisibility();
  if (!vis["past-tournaments"]) redirect("/");

  // Winner logos come from the team list managed in the admin panel; champions
  // whose team no longer exists (or was never named) keep the trophy mark.
  const teams = await getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS);
  const logoByName = new Map<string, string>();
  for (const t of teams) {
    if (t.logo) logoByName.set(normalizeName(t.name), t.logo);
  }

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
          const logo = champ?.team ? logoByName.get(normalizeName(champ.team)) : undefined;
          const players = champ ? playersLine(champ) : "";
          return (
            <div
              key={h.year}
              className={`flex gap-5 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-5 ${h.cancelled ? "opacity-70" : ""}`}
            >
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${h.cancelled ? "border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] text-[color:var(--psx-faint)]" : "border-yellow-400/30 bg-yellow-400/10 text-yellow-500"}`}
              >
                {h.cancelled ? (
                  <Ban size={24} strokeWidth={1.5} />
                ) : logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={`${champ!.team} logo`} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Trophy size={26} strokeWidth={1.5} />
                )}
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
                      {champ.team ? (
                        <span className="font-semibold">{champ.team}</span>
                      ) : (
                        <span className="font-semibold italic text-[color:var(--psx-muted)]">Team name lost to history</span>
                      )}
                    </p>
                    {players && <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--psx-muted)]">{players}</p>}
                    {champ.note && <p className="mt-1 text-[11px] italic leading-relaxed text-[color:var(--psx-faint)]">{champ.note}</p>}
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
