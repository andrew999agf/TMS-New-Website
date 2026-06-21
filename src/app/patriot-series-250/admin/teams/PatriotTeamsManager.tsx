"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { PatriotImageUpload } from "../PatriotImageUpload";
import { savePatriotSetting } from "../actions";
import { PATRIOT_TEAMS_KEY, type PatriotTeam } from "@/lib/patriot/settings";

function uid() {
  return `t-${Math.random().toString(36).slice(2, 9)}`;
}

export function PatriotTeamsManager({ initial }: { initial: PatriotTeam[] }) {
  const [teams, setTeams] = useState<PatriotTeam[]>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (id: string, patch: Partial<PatriotTeam>) =>
    setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add = () => setTeams((ts) => [...ts, { id: uid(), name: "" }]);
  const remove = (id: string) => setTeams((ts) => ts.filter((t) => t.id !== id));

  function save() {
    start(async () => {
      const clean = teams.filter((t) => t.name.trim());
      const res = await savePatriotSetting(PATRIOT_TEAMS_KEY, clean);
      if (res.ok) {
        setTeams(clean);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  return (
    <div className="space-y-4">
      {teams.length === 0 && <p className="text-sm text-white/45">No teams yet — add your first team below.</p>}

      <div className="space-y-3">
        {teams.map((t) => (
          <div key={t.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <PatriotImageUpload value={t.logo} onChange={(url) => update(t.id, { logo: url || undefined })} folder="patriot/teams" />
            <div className="flex min-w-[180px] flex-1 flex-col gap-2">
              <input
                value={t.name}
                onChange={(e) => update(t.id, { name: e.target.value })}
                placeholder="Team name"
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              />
              <input
                value={t.abbreviation ?? ""}
                onChange={(e) => update(t.id, { abbreviation: e.target.value.toUpperCase() })}
                placeholder="Abbreviation (e.g. MIN)"
                maxLength={5}
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm uppercase text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              />
            </div>
            <button onClick={() => remove(t.id)} className="rounded-lg border border-white/15 p-2 text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white">
          <Plus size={15} /> Add team
        </button>
        <button onClick={save} disabled={pending} className="rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-5 py-2 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50">
          {pending ? "Saving…" : "Save teams"}
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
