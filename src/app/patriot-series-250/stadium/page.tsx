import type { Metadata } from "next";
import { ImageIcon, MapPin } from "lucide-react";
import { PatriotShell } from "../PatriotShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stadium · Patriot Series 250",
  description: "The home of the Patriot Series 250 Wiffle Ball Tournament.",
  robots: { index: false, follow: false },
};

export default function StadiumPage() {
  return (
    <PatriotShell active="/stadium">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series 250</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">The Stadium</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">Where the Patriot Series comes to life.</p>
      </header>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] text-white/35">
            <ImageIcon size={32} strokeWidth={1.5} />
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/70">
          <MapPin size={16} className="text-blue-300" /> Location
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Venue details and directions coming soon. The address, map, and stadium photos can be added from the admin panel.
        </p>
      </div>
    </PatriotShell>
  );
}
