"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { PatriotLogoField } from "../PatriotLogoField";
import { savePatriotSetting } from "../actions";
import { PATRIOT_BRANDING_KEY, type PatriotBranding } from "@/lib/patriot/settings";

export function PatriotBrandingForm({ initial }: { initial: PatriotBranding }) {
  const [b, setB] = useState<PatriotBranding>(initial ?? {});
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const set = (k: keyof PatriotBranding) => (url: string) => setB((prev) => ({ ...prev, [k]: url || undefined }));

  function save() {
    start(async () => {
      const res = await savePatriotSetting(PATRIOT_BRANDING_KEY, b);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2 max-w-md">
          <PatriotLogoField label="Tournament logo" value={b.tournamentLogo ?? ""} onChange={set("tournamentLogo")} folder="patriot/branding" />
          <p className="mt-1.5 text-[11px] text-white/50">Shown on the watch page. Use <b>Remove background</b> for a clean cut-out — it auto-shows as a white silhouette in dark mode.</p>
        </div>
        <div className="max-w-md">
          <PatriotLogoField label="Favicon" value={b.favicon ?? ""} onChange={set("favicon")} folder="patriot/branding" />
          <p className="mt-1.5 text-[11px] text-white/50">Browser-tab icon. Square, ~512×512.</p>
        </div>
        <div className="max-w-md">
          <PatriotLogoField label="Social share image" value={b.socialShare ?? ""} onChange={set("socialShare")} folder="patriot/branding" />
          <p className="mt-1.5 text-[11px] text-white/50">Used when shared on social media. 1200×630.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-300">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
