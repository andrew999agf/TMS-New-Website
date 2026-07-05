import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { hasDb } from "@/db";
import { isBlobConfigured } from "@/lib/blob";
import { PATRIOT_BRANDING_KEY, type PatriotBranding } from "@/lib/patriot/settings";
import { PatriotBrandingForm } from "./PatriotBrandingForm";
import { requirePatriotSignIn } from "../require";

export const metadata: Metadata = {
  title: "Branding & Media · Patriot Series Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function BrandingAdmin() {
  await requirePatriotSignIn();
  const branding = await getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {});

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Branding &amp; Media</h1>
      <p className="mt-1 text-sm text-white/55">Logos and images for patriotseriestexas.com.</p>

      {(!hasDb || !isBlobConfigured()) && (
        <div className="mt-4 space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/80">
          {!hasDb && <p>Database isn&apos;t connected, so changes can&apos;t be saved yet.</p>}
          {!isBlobConfigured() && <p>Media storage (Vercel Blob) isn&apos;t configured, so uploads won&apos;t work yet.</p>}
        </div>
      )}

      <div className="mt-6">
        <PatriotBrandingForm initial={branding ?? {}} />
      </div>
    </div>
  );
}
