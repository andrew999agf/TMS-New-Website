import type { Metadata } from "next";
import { PatriotShell } from "../PatriotShell";
import { MediaPlaceholder } from "../MediaPlaceholder";
import { getSetting } from "@/lib/content";
import { PATRIOT_STADIUM_KEY } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stadium · Patriot Series",
  description: "STIHL Stadium and Bottle Rocket Alley — the homes of the Patriot Series.",
  robots: { index: false, follow: false },
};

const STIHL: [string, string][] = [
  ["Left Field", "64 ft"],
  ["Left-Center", "65 ft"],
  ["Center Field", "95 ft"],
  ["Right-Center", "85 ft"],
  ["Right Field", "68 ft"],
];
const ALLEY: [string, string][] = [
  ["Left Field", "62 ft"],
  ["Left-Center", "118 ft"],
  ["Center Field", "86 ft"],
  ["Right-Center", "60 ft"],
  ["Right Field", "56 ft"],
];

function Dimensions({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-2 border-b border-[color:var(--psx-border)] pb-1">
          <dt className="text-[color:var(--psx-muted)]">{k}</dt>
          <dd className="font-[family-name:var(--font-display)] text-base font-bold text-[color:var(--psx-fg)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function StadiumPage() {
  const photos = (await getSetting<string[]>(PATRIOT_STADIUM_KEY, [])).filter(Boolean);

  return (
    <PatriotShell active="/stadium" title="The Stadium" subtitle="STIHL Stadium — home of the Patriot Series since the mid-2000s.">
      {/* Gallery */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.length > 0
          ? photos.map((src, i) => (
              <div key={`${src}-${i}`} className="aspect-video overflow-hidden rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))
          : [0, 1, 2].map((i) => <MediaPlaceholder key={i} label="Stadium photo" size="1600 × 900" />)}
      </div>

      {/* STIHL Stadium */}
      <section className="mt-12 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[color:var(--psx-fg)]">STIHL Stadium</h2>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">Opened 2004 · Home venue</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[color:var(--psx-muted)]">
          Born around 2004 when an orange mesh fence went up in the yard for wiffle ball at a Fourth of July party. A
          plywood wall followed in 2006, lights in 2007 (so a true champion could be decided after nightfall), and a
          press box, scoreboard, and sound system in 2008. Permanent fences in 2009 and 2011 and a centerfield flagpole
          brought the field to its present form.
        </p>
        <Dimensions rows={STIHL} />
        <div className="mt-5 flex flex-wrap gap-2">
          {["13-star colonial flag", "Press box & scoreboard", "Stadium lighting", "Hit-it-here sign", "Pond (right field)", "BBQ cooker", "Volleyball court"].map((f) => (
            <span key={f} className="rounded-full border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] px-3 py-1 text-[11px] text-[color:var(--psx-muted)]">{f}</span>
          ))}
        </div>
      </section>

      {/* Bottle Rocket Alley */}
      <section className="mt-6 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[color:var(--psx-fg)]">Bottle Rocket Alley</h2>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">Opened 2011 · Second venue</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[color:var(--psx-muted)]">
          A slightly smaller park that heavily favors power hitters — a very deep left-center gap and a short right
          field where a steady breeze sends plenty of balls over the wall.
        </p>
        <Dimensions rows={ALLEY} />
      </section>
    </PatriotShell>
  );
}
