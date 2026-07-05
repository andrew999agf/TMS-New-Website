"use client";

import { useState, useTransition } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { savePatriotSetting } from "../actions";
import { PATRIOT_PAGES_KEY, type PatriotPageKey } from "@/lib/patriot/settings";

const PAGES: { key: PatriotPageKey; label: string; note: string }[] = [
  { key: "news", label: "News", note: "Tournament articles and coverage." },
  { key: "teams", label: "Teams", note: "The team roster page." },
  { key: "past-tournaments", label: "Past Tournaments", note: "Champions and winning rosters by year." },
  { key: "records", label: "Records", note: "Personal stats, awards, and the record book." },
  { key: "stadium", label: "Stadium", note: "Venues, dimensions, and photo galleries." },
];

export function PatriotVisibilityForm({ initial }: { initial: Record<PatriotPageKey, boolean> }) {
  const [vis, setVis] = useState<Record<PatriotPageKey, boolean>>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (k: PatriotPageKey) => setVis((v) => ({ ...v, [k]: !v[k] }));

  function save() {
    start(async () => {
      const res = await savePatriotSetting(PATRIOT_PAGES_KEY, vis);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/50">Hidden pages disappear from the site nav and redirect to the watch page if visited directly. (The Watch page is always on.)</p>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {PAGES.map((p) => (
          <button
            key={p.key}
            onClick={() => toggle(p.key)}
            className="flex w-full items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-white/[0.03]"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white/90">{p.label}</span>
              <span className="block text-[11px] text-white/45">{p.note}</span>
            </span>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${vis[p.key] ? "bg-green-500/15 text-green-300" : "bg-white/10 text-white/50"}`}>
              {vis[p.key] ? <><Eye size={13} /> Visible</> : <><EyeOff size={13} /> Hidden</>}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
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
