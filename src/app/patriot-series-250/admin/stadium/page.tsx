import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { hasDb } from "@/db";
import { isBlobConfigured } from "@/lib/blob";
import { PATRIOT_PHOTOS_LAKESIDE_KEY, PATRIOT_PHOTOS_STIHL_KEY, PATRIOT_PHOTOS_ALLEY_KEY } from "@/lib/patriot/settings";
import { MultiImageManager } from "../MultiImageManager";
import { requirePatriotSignIn } from "../require";

export const metadata: Metadata = { title: "Stadium · Patriot Series Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StadiumAdmin() {
  await requirePatriotSignIn();
  const [lakeside, stihl, alley] = await Promise.all([
    getSetting<string[]>(PATRIOT_PHOTOS_LAKESIDE_KEY, []),
    getSetting<string[]>(PATRIOT_PHOTOS_STIHL_KEY, []),
    getSetting<string[]>(PATRIOT_PHOTOS_ALLEY_KEY, []),
  ]);

  const venues = [
    { label: "Lakeside Stadium", sub: "Current home · opened 2025", key: PATRIOT_PHOTOS_LAKESIDE_KEY, initial: lakeside ?? [], folder: "patriot/stadium/lakeside" },
    { label: "STIHL Stadium", sub: "Retired · 2004–2024", key: PATRIOT_PHOTOS_STIHL_KEY, initial: stihl ?? [], folder: "patriot/stadium/stihl" },
    { label: "Bottle Rocket Alley", sub: "Retired · 2011–2024", key: PATRIOT_PHOTOS_ALLEY_KEY, initial: alley ?? [], folder: "patriot/stadium/alley" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Stadium Photos</h1>
      <p className="mt-1 text-sm text-white/55">Each venue has its own photo book on the Stadium page. Landscape shots — <b>1600 × 900</b>.</p>
      {(!hasDb || !isBlobConfigured()) && (
        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs text-amber-100/80">Database / media storage not fully configured yet — uploads may not save.</div>
      )}

      <div className="mt-8 space-y-10">
        {venues.map((v) => (
          <section key={v.key}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">{v.label}</h2>
              <span className="text-[11px] uppercase tracking-wider text-white/45">{v.sub}</span>
            </div>
            <MultiImageManager settingKey={v.key} initial={v.initial} folder={v.folder} />
          </section>
        ))}
      </div>
    </div>
  );
}
