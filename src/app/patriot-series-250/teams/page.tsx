import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getSetting } from "@/lib/content";
import { PATRIOT_TEAMS_KEY, type PatriotTeam } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams · Patriot Series 250",
  description: "The teams competing in the Patriot Series 250 Wiffle Ball Tournament.",
  robots: { index: false, follow: false },
};

const PLACEHOLDERS: PatriotTeam[] = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Team ${i + 1}` }));

export default async function TeamsPage() {
  const teams = await getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, []);
  const hasTeams = teams.length > 0;
  const display = hasTeams ? teams : PLACEHOLDERS;

  return (
    <PatriotShell active="/teams">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series 250</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">Teams</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">The squads competing in this year&apos;s USA 250 tournament.</p>
      </header>

      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {display.map((t) => (
          <div key={t.id} className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.04] text-white/40">
              {t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt={t.name} className="h-full w-full object-contain" />
              ) : (
                <ImageIcon size={28} strokeWidth={1.5} />
              )}
            </div>
            <p className="mt-4 text-sm font-semibold text-white/85">{t.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">{t.abbreviation || (hasTeams ? "" : "Roster TBA")}</p>
          </div>
        ))}
      </div>

      {!hasTeams && <p className="mt-10 text-center text-[11px] text-white/45">Team names and logos can be added from the admin panel.</p>}
    </PatriotShell>
  );
}
