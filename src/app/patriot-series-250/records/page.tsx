import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getSetting } from "@/lib/content";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { PATRIOT_PLAYERS_KEY, type PatriotPlayer } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Records · Patriot Series",
  description: "Patriot Series champions, MVPs, and the wiffle ball record book.",
  robots: { index: false, follow: false },
};

const TITLES = [
  { name: "Max Smith", n: 6, detail: "Texas Storm '08, '12, '13 · Minutemen '19, '25, '26" },
  { name: "Eric Horton", n: 3, detail: "Founding Fathers '21, '22, '24" },
  { name: "Paul Horton", n: 2, detail: "Ironbirds '11 · Ironsides '18" },
  { name: "Mark Horton", n: 1, detail: "Tribe '15" },
  { name: "Andrew Cooper", n: 1, detail: "Team Cooper '07" },
  { name: "Ross Pinkerton", n: 1, detail: "Yellow Jackets '09" },
  { name: "Jason Freeman", n: 1, detail: "The Neighbors '10" },
  { name: "Brandon Potter", n: 1, detail: "Team Potter '14" },
  { name: "Brandon Heitpas", n: 1, detail: "Pirates '16" },
  { name: "Matthew Hunter", n: 1, detail: "Landscapers '17" },
];

const AWARDS: { year: number; mvp: string; pitcher: string; hr: string; rookie: string; dpoy?: string; party?: string }[] = [
  { year: 2026, mvp: "Max Smith", pitcher: "Michael Salas", hr: "Brandon Potter · 16", rookie: "Raymond", dpoy: "Brandon Potter", party: "TBA" },
  { year: 2018, mvp: "Paul Horton", pitcher: "Darren Neumann", hr: "Max Smith · 10", rookie: "—" },
  { year: 2017, mvp: "Horton / Hunter", pitcher: "Stephen Elliot", hr: "Adam Horton · 16", rookie: "—" },
  { year: 2016, mvp: "Michael Salas", pitcher: "Brandon Heitpas", hr: "Braxton Feist · 9", rookie: "Rodney Marshall" },
  { year: 2015, mvp: "Mac Emrich", pitcher: "Mac Emrich", hr: "Cullen Pickett · 11", rookie: "Mac Emrich" },
  { year: 2014, mvp: "Brandon Potter", pitcher: "Brandon Potter", hr: "Pat Dalton · 15", rookie: "Dalton / Powell" },
  { year: 2013, mvp: "Max Smith", pitcher: "Steven Elliot", hr: "Max Smith · 19", rookie: "Drew Fleischman" },
  { year: 2012, mvp: "Garret Cooper", pitcher: "Will Pace", hr: "Smith / Pace · 17", rookie: "Will Pace" },
  { year: 2011, mvp: "Paul Horton", pitcher: "Paul Horton", hr: "Chris Sullivan · 17", rookie: "Braxton Feist" },
  { year: 2010, mvp: "Jason Freeman", pitcher: "Jason Freeman", hr: "Stephen Redfield · 13", rookie: "Skylar Wheeler" },
  { year: 2009, mvp: "Ross Pinkerton", pitcher: "Ross Pinkerton", hr: "—", rookie: "Potter / Redfield" },
  { year: 2008, mvp: "Adam Horton", pitcher: "Adam Horton", hr: "—", rookie: "Tyler Ervine" },
  { year: 2007, mvp: "Andrew Cooper", pitcher: "Andrew Cooper", hr: "—", rookie: "—" },
];

const RECORDS = [
  { label: "Most HR · single game", value: "6 — Andor Benyi (2015, Bears vs. Whalers)" },
  { label: "Most HR · single tournament", value: "19 — Max Smith (2013, 7 games)" },
  { label: "Highest-scoring game", value: "24–17 — Texas Storm vs. Rockets (2012)" },
  { label: "Longest unbeaten streak", value: "10 games — Ironsides & Minutemen" },
  { label: "Perfect games", value: "Brantley Freeman (2012) · Eric Horton (2015)" },
];

const PROS_DEFAULT: PatriotPlayer[] = [
  { id: "austen-williams", name: "Austen Williams", team: "Washington Nationals", note: "Drafted 6th round, 2014 (Texas State). MLB debut Sept. 2, 2018." },
  { id: "brady-cox", name: "Brady Cox", team: "Kansas City Royals org.", note: "Drafted 36th round, 2017 (UT Arlington)." },
  { id: "jason-freeman", name: "Jason Freeman", team: "Kansas City Royals org.", note: "2010 Patriot Series champion. Signed by KC in 2015 (Texas A&M)." },
];

export default async function RecordsPage() {
  const vis = await getPageVisibility();
  if (!vis.records) redirect("/");
  const savedPros = await getSetting<PatriotPlayer[]>(PATRIOT_PLAYERS_KEY, []);
  const pros = savedPros.length > 0 ? savedPros : PROS_DEFAULT;

  return (
    <PatriotShell active="/records" title="Records" subtitle="Paul Revere's Lantern winners, annual awards, and the record book.">
      {/* Players in the pros */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--psx-muted)]">Patriot Series Players in the Pros</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pros.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)]">
              <div className="aspect-[4/3] bg-[var(--psx-surface-2)]">
                {p.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-[color:var(--psx-faint)]">
                    <span className="text-xs font-semibold text-[color:var(--psx-muted)]">Player photo</span>
                    <span className="text-[11px]">800 × 600</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="font-[family-name:var(--font-display)] text-lg font-bold text-[color:var(--psx-fg)]">{p.name}</p>
                {p.team && <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">{p.team}</p>}
                {p.note && <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--psx-muted)]">{p.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Annual awards */}
      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--psx-muted)]">Annual Awards</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[color:var(--psx-border)]">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--psx-surface-2)] text-[11px] uppercase tracking-wider text-[color:var(--psx-muted)]">
                <th className="px-4 py-2.5 text-left">Year</th>
                <th className="px-4 py-2.5 text-left">MVP</th>
                <th className="px-4 py-2.5 text-left">Pitcher of the Year</th>
                <th className="px-4 py-2.5 text-left">HR Champion</th>
                <th className="px-4 py-2.5 text-left">Rookie of the Year</th>
                <th className="px-4 py-2.5 text-left">Defensive Player of the Year</th>
                <th className="px-4 py-2.5 text-left">Party Animal</th>
              </tr>
            </thead>
            <tbody>
              {AWARDS.map((a) => (
                <tr key={a.year} className="border-t border-[color:var(--psx-border)] text-[color:var(--psx-fg)]">
                  <td className="px-4 py-2.5 font-[family-name:var(--font-display)] font-bold">{a.year}</td>
                  <td className="px-4 py-2.5">{a.mvp}</td>
                  <td className="px-4 py-2.5">{a.pitcher}</td>
                  <td className="px-4 py-2.5">{a.hr}</td>
                  <td className="px-4 py-2.5 text-[color:var(--psx-muted)]">{a.rookie}</td>
                  <td className="px-4 py-2.5">{a.dpoy ?? "\u2014"}</td>
                  <td className="px-4 py-2.5 text-[color:var(--psx-muted)]">{a.party ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Record book */}
      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--psx-muted)]">Record Book</h2>
        <div className="mt-4 space-y-2">
          {RECORDS.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-faint)]">{r.label}</span>
              <span className="text-sm font-medium text-[color:var(--psx-fg)]">{r.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Championships by captain */}
      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--psx-muted)]">Championships by Captain</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {TITLES.map((t) => (
            <div key={t.name} className="flex items-center gap-3 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] px-4 py-3">
              <div className="flex items-center gap-1 font-[family-name:var(--font-display)] text-xl font-bold text-yellow-500">
                <Trophy size={16} /> {t.n}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--psx-fg)]">{t.name}</p>
                <p className="truncate text-[11px] text-[color:var(--psx-faint)]">{t.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PatriotShell>
  );
}
