import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotTeam } from "@/lib/patriot/settings";
import { requirePatriotSignIn } from "../require";
import { BracketLab } from "./BracketLab";

export const metadata: Metadata = {
  title: "Bracket Lab · Patriot Series Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function BracketLabAdmin() {
  await requirePatriotSignIn();
  const teams = await getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS);
  const list = teams.length > 0 ? teams : DEFAULT_PATRIOT_TEAMS;
  const logos: Record<string, string> = {};
  for (const t of list) {
    if (t.logo) logos[t.name.toLowerCase().replace(/^the\s+/, "").trim()] = t.logo;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Bracket Lab</h1>
      <p className="mt-1 text-sm text-white/55">
        Design next year&apos;s tournament: pick the field (2–32 teams), choose a warm-up, pool, or group stage, and a
        single- or double-elimination knockout — then preview the full bracket exactly as it will render on the site.
      </p>
      <div className="mt-6">
        <BracketLab teamNames={list.map((t) => t.name)} logos={logos} />
      </div>
    </div>
  );
}
