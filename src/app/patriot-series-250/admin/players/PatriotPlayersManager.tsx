"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { PatriotLogoField } from "../PatriotLogoField";
import { savePatriotSetting } from "../actions";
import { PATRIOT_PLAYERS_KEY, type PatriotPlayer } from "@/lib/patriot/settings";

function uid() {
  return `p-${Math.random().toString(36).slice(2, 9)}`;
}

export function PatriotPlayersManager({ initial }: { initial: PatriotPlayer[] }) {
  const [list, setList] = useState<PatriotPlayer[]>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (id: string, patch: Partial<PatriotPlayer>) =>
    setList((ls) => ls.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => setList((ls) => [...ls, { id: uid(), name: "" }]);
  const remove = (id: string) => setList((ls) => ls.filter((p) => p.id !== id));

  function save() {
    start(async () => {
      const clean = list.filter((p) => p.name.trim());
      const res = await savePatriotSetting(PATRIOT_PLAYERS_KEY, clean);
      if (res.ok) {
        setList(clean);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  const input = "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none";

  return (
    <div className="space-y-4">
      {list.length === 0 && <p className="text-sm text-white/50">No players yet — add your first below.</p>}

      <div className="space-y-3">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="w-40">
              <PatriotLogoField value={p.photo ?? ""} onChange={(url) => update(p.id, { photo: url || undefined })} folder="patriot/players" />
            </div>
            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
              <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} placeholder="Player name" className={input} />
              <input value={p.team ?? ""} onChange={(e) => update(p.id, { team: e.target.value })} placeholder="Team / organization (e.g. Washington Nationals)" className={input} />
              <textarea value={p.note ?? ""} onChange={(e) => update(p.id, { note: e.target.value })} placeholder="Short blurb…" rows={3} className={input} />
            </div>
            <button onClick={() => remove(p.id)} className="rounded-lg border border-white/15 p-2 text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white">
          <Plus size={15} /> Add player
        </button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-5 py-2 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50">
          {pending ? "Saving…" : "Save players"}
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
