import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import styles from "../patriot.module.css";
import { getSetting } from "@/lib/content";
import { PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotTeam } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams · Patriot Series",
  description: "The teams of the Patriot Series Wiffle Ball Tournament.",
  robots: { index: false, follow: false },
};

export default async function TeamsPage() {
  const saved = await getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS);
  const teams = saved.length > 0 ? saved : DEFAULT_PATRIOT_TEAMS;

  return (
    <PatriotShell active="/teams" title="Teams" subtitle={`The ${teams.length} clubs of the Patriot Series.`}>
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)]">
        {teams.map((t, i) => (
          <div key={t.id} className="flex items-center gap-4 border-t border-[color:var(--psx-border)] px-4 py-3 first:border-t-0 sm:px-5">
            <span className="w-5 text-right text-xs tabular-nums text-[color:var(--psx-faint)]">{i + 1}</span>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] text-[color:var(--psx-faint)]">
              {t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo} alt={t.name} className={`h-full w-full object-contain ${styles.logo}`} />
              ) : (
                <ImageIcon size={18} strokeWidth={1.5} />
              )}
            </div>
            {t.abbreviation && (
              <span className="w-12 shrink-0 font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-[color:var(--psx-fg)]">{t.abbreviation}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--psx-fg)]">{t.name}</span>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-[11px] text-[color:var(--psx-faint)]">Team logos can be uploaded from the admin panel — square PNG/SVG, ~512×512.</p>
    </PatriotShell>
  );
}
