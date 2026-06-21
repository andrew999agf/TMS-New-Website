import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PatriotShell } from "../PatriotShell";
import { VenueGallery } from "../VenueGallery";
import { getSetting } from "@/lib/content";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { PATRIOT_PHOTOS_LAKESIDE_KEY, PATRIOT_PHOTOS_STIHL_KEY, PATRIOT_PHOTOS_ALLEY_KEY } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stadium · Patriot Series",
  description: "Lakeside Stadium and the historic homes of the Patriot Series.",
  robots: { index: false, follow: false },
};

const LAKESIDE: [string, string][] = [
  ["Left Field", "58 ft"],
  ["Left-Center", "No Fence"],
  ["Center Field", "110 ft"],
  ["Right-Center", "85 ft"],
  ["Right Field", "68 ft"],
];
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

function Venue({
  title,
  status,
  rows,
  photos,
  features,
  children,
}: {
  title: string;
  status: string;
  rows: [string, string][];
  photos: string[];
  features?: string[];
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[color:var(--psx-fg)]">{title}</h2>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">{status}</span>
      </div>
      <div className="mt-3 max-w-3xl text-sm leading-relaxed text-[color:var(--psx-muted)]">{children}</div>
      <Dimensions rows={rows} />
      {features && features.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {features.map((f) => (
            <span key={f} className="rounded-full border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] px-3 py-1 text-[11px] text-[color:var(--psx-muted)]">{f}</span>
          ))}
        </div>
      )}
      <VenueGallery photos={photos} label={title} />
    </section>
  );
}

export default async function StadiumPage() {
  const vis = await getPageVisibility();
  if (!vis.stadium) redirect("/");

  const [lakeside, stihl, alley] = await Promise.all([
    getSetting<string[]>(PATRIOT_PHOTOS_LAKESIDE_KEY, []),
    getSetting<string[]>(PATRIOT_PHOTOS_STIHL_KEY, []),
    getSetting<string[]>(PATRIOT_PHOTOS_ALLEY_KEY, []),
  ]);

  return (
    <PatriotShell active="/stadium" title="The Stadium" subtitle="Lakeside Stadium — current home of the Patriot Series.">
      <div className="space-y-6">
        <Venue title="Lakeside Stadium" status="Opened 2025 · Current home" rows={LAKESIDE} photos={lakeside ?? []}>
          <p>
            The Patriot Series&apos; new home as of 2025. A short porch in left field and an open, fenceless left-center
            gap reward aggressive base running, while a deep 110-foot center field keeps the big flies honest.
          </p>
        </Venue>

        <Venue
          title="STIHL Stadium"
          status="2004–2024 · Retired"
          rows={STIHL}
          photos={stihl ?? []}
          features={["13-star colonial flag", "Stadium lighting", "Pond (right field)"]}
        >
          <p>
            The original home of the Patriot Series. Born around 2004 as an orange mesh fence at a Fourth of July party;
            lights arrived in 2007, and a press box, scoreboard, and sound system in 2008. Hosted the tournament every
            Independence Day through 2024.
          </p>
        </Venue>

        <Venue title="Bottle Rocket Alley" status="2011–2024 · Retired" rows={ALLEY} photos={alley ?? []}>
          <p>
            A smaller second park that heavily favored power hitters — a very deep left-center gap and a short right field
            where a steady breeze sent plenty of balls over the wall.
          </p>
        </Venue>
      </div>
    </PatriotShell>
  );
}
