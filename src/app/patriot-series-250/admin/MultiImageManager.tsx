"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { PatriotLogoField } from "./PatriotLogoField";
import { savePatriotSetting } from "./actions";

/** Add/remove/upload a list of images, saved to a settings key as string[]. */
export function MultiImageManager({
  settingKey,
  initial,
  folder,
}: {
  settingKey: string;
  initial: string[];
  folder: string;
}) {
  const [images, setImages] = useState<string[]>(initial.length ? initial : [""]);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const set = (i: number, url: string) => setImages((a) => a.map((x, j) => (j === i ? url : x)));
  const add = () => setImages((a) => [...a, ""]);
  const remove = (i: number) => setImages((a) => a.filter((_, j) => j !== i));

  function save() {
    start(async () => {
      const clean = images.filter(Boolean);
      const res = await savePatriotSetting(settingKey, clean);
      if (res.ok) {
        setImages(clean.length ? clean : [""]);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <PatriotLogoField value={img} onChange={(url) => set(i, url)} folder={folder} />
            <button onClick={() => remove(i)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-red-300">
              <Trash2 size={12} /> Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white">
          <Plus size={15} /> Add image
        </button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-5 py-2 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50">
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
