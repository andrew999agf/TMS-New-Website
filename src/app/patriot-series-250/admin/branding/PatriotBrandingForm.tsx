"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { PatriotImageUpload } from "../PatriotImageUpload";
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
      <div className="flex flex-wrap gap-8">
        <PatriotImageUpload
          label="Tournament logo"
          hint="Shown on the watch page. Transparent PNG or SVG — square works best."
          value={b.tournamentLogo}
          onChange={set("tournamentLogo")}
          folder="patriot/branding"
        />
        <PatriotImageUpload
          label="Favicon"
          hint="The little browser-tab icon. Square PNG / ICO / SVG, ~512×512."
          value={b.favicon}
          onChange={set("favicon")}
          folder="patriot/branding"
        />
        <PatriotImageUpload
          label="Social share image"
          aspect="wide"
          hint="Used when the site is shared on social media. 1200×630 recommended."
          value={b.socialShare}
          onChange={set("socialShare")}
          folder="patriot/branding"
        />
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
