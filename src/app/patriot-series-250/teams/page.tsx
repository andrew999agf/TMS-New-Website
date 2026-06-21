import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getSetting } from "@/lib/content";
import { PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotTeam } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams · Patriot Series 250",
  description: "The teams of the Patriot Series Wiffle Ball Tournament.",
  robots: { index: false, follow: false },
};

export default async function TeamsPage() {
  const saved = await getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS);
  const teams = saved.length > 0 ? saved : DEFAULT_PATRIOT_TEAMS;

  return (
    <PatriotShell active="/teams">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">Teams</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">The {teams.length} clubs of the Patriot Series.</p>
      </header>

      <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {teams.map((t, i) => (
          <div key={t.id} className="flex items-center gap-4 border-t border-white/10 px-4 py-3 first:border-t-0 sm:px-5">
            <span className="w-5 text-right text-xs tabular-nums text-white/35">{i + 1}</span>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/[0.04] text-white/35">
              {t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt={t.name} className="h-full w-full object-contain" />
              ) : (
                <ImageIcon size={18} strokeWidth={1.5} />
              )}
            </div>
            {t.abbreviation && (
              <span className="w-12 shrink-0 font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-white/80">{t.abbreviation}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{t.name}</span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] text-white/40">Team logos can be uploaded from the admin panel.</p>
    </PatriotShell>
  );
}
