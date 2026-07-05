import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Ban, Newspaper } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { getSetting } from "@/lib/content";
import {
  PATRIOT_TEAMS_KEY,
  DEFAULT_PATRIOT_TEAMS,
  type PatriotTeam,
  PATRIOT_NEWS_KEY,
  DEFAULT_PATRIOT_NEWS,
  type PatriotArticle,
} from "@/lib/patriot/settings";
import { BRACKETS } from "./brackets";
import { BracketModal } from "./BracketModal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Past Tournaments · Patriot Series",
  description: "Every Patriot Series Wiffle Ball champion since the 2007 inaugural.",
  robots: { index: false, follow: false },
};

const INAUGURAL = 2007;
const LATEST = 2026; // this year's USA 250 tournament — champion TBD until it's played

/** `later` = what the franchise became; its logo represents the championship. */
type Champion = { team: string | null; later?: string; captain?: string; roster?: string[]; note?: string };

const CHAMPIONS: Record<number, Champion> = {
  2026: { team: "Minutemen", captain: "Max S.", roster: ["Michael S.", "Raymond"], note: "Defeated the Dragons in the final — dropped game one 10–9 on a walk-off, took the clincher 4–1" },
  2025: { team: "Minutemen", captain: "Max S.", roster: ["Brian B.", "Oliver B."] },
  2024: { team: "Founding Fathers" },
  2023: { team: "Whalers", roster: ["Adam H.", "Trey H.", "Brennan B."] },
  2022: { team: "Founding Fathers", note: "Defeated the Spartans in the final; the Spartans had edged Ironsides 5–4 in their semifinal" },
  2021: { team: "Founding Fathers", note: "Routed the 3 Musketeers 25–10 in the final" },
  2019: { team: "Minutemen", captain: "Max S.", roster: ["Brian B.", "Oliver B."] },
  2018: { team: "Ironsides", captain: "Paul H.", roster: ["Darren N.", "James Z."] },
  2017: { team: "Landscapers", captain: "Matthew H.", roster: ["Brandon M.", "Garrett G."] },
  2016: { team: "Pirates", captain: "Brandon H.", roster: ["Michael S.", "Robbie G."] },
  2015: { team: "The Tribe", captain: "Mark H.", roster: ["Mac E.", "Rylan M."] },
  2014: { team: "Team Potter", later: "Dragons", captain: "Brandon P.", roster: ["Mandy P.", "Brandon H."] },
  2013: { team: "Texas Storm", later: "Minutemen", captain: "Max S.", roster: ["Gabe G.", "Jack M.", "Nick C."] },
  2012: { team: "Texas Storm", later: "Minutemen", captain: "Max S.", roster: ["Garrett C.", "Mark H."] },
  2011: { team: "Ft. Worth Ironbirds", later: "Ironsides", captain: "Paul H.", roster: ["Braxton F.", "Gage G."] },
  2010: { team: "The Neighbors", captain: "Jayson F." },
  2009: { team: "Yellow Jackets", later: "Bears", captain: "Ross P.", roster: ["Adam H.", "Austin W.", "Reid P."] },
  2008: { team: "Texas Storm", later: "Minutemen", captain: "Max S.", roster: ["Garrett C.", "Adam H.", "Mark H."] },
  2007: { team: "Team Cooper", later: "Eagles", captain: "Andrew C.", roster: ["Andrew N.", "Nathan U."] },
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
  // Serializable copy for the client-side bracket popups.
  const logosObj = Object.fromEntries(logoByName);

  // Tournament coverage: news articles tagged with a year appear on that row.
  const news = await getSetting<PatriotArticle[]>(PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS);
  const newsByYear = new Map<number, PatriotArticle[]>();
  for (const a of news) {
    if (!a.tournamentYear) continue;
    newsByYear.set(a.tournamentYear, [...(newsByYear.get(a.tournamentYear) ?? []), a]);
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
          // A renamed franchise is represented by the logo it carries today.
          const logoName = champ?.later ?? champ?.team;
          const logo = logoName ? logoByName.get(normalizeName(logoName)) : undefined;
          const players = champ ? playersLine(champ) : "";
          const bracket = h.cancelled ? undefined : BRACKETS[h.year];
          const tileClass = `flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${h.cancelled ? "border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] text-[color:var(--psx-faint)]" : "border-yellow-400/30 bg-yellow-400/10 text-yellow-500"}`;
          const tileInner = h.cancelled ? (
            <Ban size={24} strokeWidth={1.5} />
          ) : logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${logoName} logo`} className="h-full w-full object-contain p-1.5" />
          ) : (
            <Trophy size={26} strokeWidth={1.5} />
          );
          return (
            <div
              key={h.year}
              className={`flex gap-5 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-5 ${h.cancelled ? "opacity-70" : ""}`}
            >
              {bracket ? (
                <BracketModal year={h.year} champion={champ?.team ?? undefined} bracket={bracket} logos={logosObj} className={tileClass}>
                  {tileInner}
                </BracketModal>
              ) : (
                <div className={tileClass}>{tileInner}</div>
              )}
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
                        <>
                          <span className="font-semibold">{champ.team}</span>
                          {champ.later && <span className="text-[color:var(--psx-faint)]"> (later the {champ.later})</span>}
                        </>
                      ) : (
                        <span className="font-semibold italic text-[color:var(--psx-muted)]">Team name lost to history</span>
                      )}
                    </p>
                    {players && <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--psx-muted)]">{players}</p>}
                    {champ.note && <p className="mt-1 text-[11px] italic leading-relaxed text-[color:var(--psx-faint)]">{champ.note}</p>}
                  </>
                ) : (
                  <p className="mt-1.5 text-sm text-[color:var(--psx-fg)]">
                    <span className="text-[color:var(--psx-faint)]">Champion · </span>
                    <span className="font-semibold italic text-[color:var(--psx-muted)]">To Be Determined</span>
                  </p>
                )}
                {bracket && (
                  <p className="mt-1.5 text-[11px] text-[color:var(--psx-faint)]">Click the crest to view the full bracket and game summary.</p>
                )}
                {(newsByYear.get(h.year) ?? []).length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {newsByYear.get(h.year)!.map((a) => (
                      <Link
                        key={a.id}
                        href={`/news/${a.id}`}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--psx-accent)] hover:underline"
                      >
                        <Newspaper size={12} className="shrink-0" /> {a.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PatriotShell>
  );
}
