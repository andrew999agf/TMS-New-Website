import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { PatriotShell } from "../PatriotShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Past Tournaments · Patriot Series 250",
  description: "A look back at previous Patriot Series Wiffle Ball tournaments.",
  robots: { index: false, follow: false },
};

const PAST = [
  { year: "2025", name: "Patriot Series · USA 250", champ: "Champion TBA" },
  { year: "2024", name: "Patriot Series · Inaugural", champ: "Champion TBA" },
];

export default function PastTournamentsPage() {
  return (
    <PatriotShell active="/past-tournaments">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series 250</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">Past Tournaments</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">A look back at previous Patriot Series events.</p>
      </header>

      <div className="mx-auto mt-12 max-w-3xl space-y-4">
        {PAST.map((p) => (
          <div key={p.year} className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-yellow-400/30 bg-yellow-400/5 text-yellow-300/80">
              <Trophy size={26} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold leading-none">{p.year}</p>
              <p className="mt-1 text-sm text-white/70">{p.name}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-white/45">{p.champ}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-[11px] text-white/45">Results, brackets, and champions can be added from the admin panel.</p>
    </PatriotShell>
  );
}
