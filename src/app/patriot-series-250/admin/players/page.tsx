import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { hasDb } from "@/db";
import { PATRIOT_PLAYERS_KEY, type PatriotPlayer } from "@/lib/patriot/settings";
import { PatriotPlayersManager } from "./PatriotPlayersManager";

export const metadata: Metadata = { title: "Players · Patriot Series Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PlayersAdmin() {
  const players = await getSetting<PatriotPlayer[]>(PATRIOT_PLAYERS_KEY, []);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Players in the Pros</h1>
      <p className="mt-1 text-sm text-white/55">Featured alumni shown on the Records page — name, organization, blurb, and a photo (<b>800 × 600</b>).</p>
      {!hasDb && <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs text-amber-100/80">Database not connected yet — changes can&apos;t be saved.</div>}
      <div className="mt-6">
        <PatriotPlayersManager initial={players ?? []} />
      </div>
    </div>
  );
}
