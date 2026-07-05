import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { hasDb } from "@/db";
import { isBlobConfigured } from "@/lib/blob";
import { PATRIOT_BANNERS_KEY } from "@/lib/patriot/settings";
import { MultiImageManager } from "../MultiImageManager";
import { requirePatriotSignIn } from "../require";

export const metadata: Metadata = { title: "Banners · Patriot Series Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BannersAdmin() {
  await requirePatriotSignIn();
  const banners = await getSetting<string[]>(PATRIOT_BANNERS_KEY, []);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Banners</h1>
      <p className="mt-1 text-sm text-white/55">Hero photos that scroll across the top of the site (Ken Burns effect). Wide landscape shots work best — <b>1920 × 800</b>.</p>
      {(!hasDb || !isBlobConfigured()) && (
        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs text-amber-100/80">Database / media storage not fully configured yet — uploads may not save.</div>
      )}
      <div className="mt-6">
        <MultiImageManager settingKey={PATRIOT_BANNERS_KEY} initial={banners ?? []} folder="patriot/banners" />
      </div>
    </div>
  );
}
