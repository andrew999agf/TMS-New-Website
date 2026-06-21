import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { hasDb } from "@/db";
import { isBlobConfigured } from "@/lib/blob";
import { PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotTeam } from "@/lib/patriot/settings";
import { PatriotTeamsManager } from "./PatriotTeamsManager";

export const metadata: Metadata = {
  title: "Teams · Patriot Series Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function TeamsAdmin() {
  const teams = await getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Teams</h1>
      <p className="mt-1 text-sm text-white/55">Add the competing teams and their logos — these appear on the public Teams page.</p>

      {(!hasDb || !isBlobConfigured()) && (
        <div className="mt-4 space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/80">
          {!hasDb && <p>Database isn&apos;t connected, so changes can&apos;t be saved yet.</p>}
          {!isBlobConfigured() && <p>Media storage isn&apos;t configured, so logo uploads won&apos;t work yet.</p>}
        </div>
      )}

      <div className="mt-6">
        <PatriotTeamsManager initial={teams.length > 0 ? teams : DEFAULT_PATRIOT_TEAMS} />
      </div>
    </div>
  );
}
