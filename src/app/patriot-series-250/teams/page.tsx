import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { PatriotShell } from "../PatriotShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams · Patriot Series 250",
  description: "The teams competing in the Patriot Series 250 Wiffle Ball Tournament.",
  robots: { index: false, follow: false },
};

// Placeholder roster — team names + logos become editable from the admin panel.
const TEAMS = Array.from({ length: 8 }, (_, i) => `Team ${i + 1}`);

export default function TeamsPage() {
  return (
    <PatriotShell active="/teams">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series 250</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">Teams</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">The squads competing in this year&apos;s USA 250 tournament.</p>
      </header>

      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {TEAMS.map((t) => (
          <div key={t} className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.04] text-white/40">
              <ImageIcon size={28} strokeWidth={1.5} />
            </div>
            <p className="mt-4 text-sm font-semibold text-white/85">{t}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">Roster TBA</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-[11px] text-white/45">Team names, logos, and rosters can be managed from the admin panel.</p>
    </PatriotShell>
  );
}
