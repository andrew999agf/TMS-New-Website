"use client";

import { useMemo, useState } from "react";
import { Copy, Check, Shuffle } from "lucide-react";
import { generateTournament, type TournamentFormat, type PoolFormat, type KnockoutFormat } from "@/lib/patriot/tournament";
import { BracketSections } from "../../past-tournaments/BracketView";

const BTN = "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";

/**
 * Bracket Lab: pick teams (selection order = seeding), choose a format, and
 * preview the generated tournament with the live bracket renderer. Copy the
 * JSON to save a year into the site's bracket data.
 */
export function BracketLab({ teamNames, logos }: { teamNames: string[]; logos: Record<string, string> }) {
  const [selected, setSelected] = useState<string[]>(teamNames.slice(0, 8));
  const [warmup, setWarmup] = useState(false);
  const [pool, setPool] = useState<PoolFormat>("none");
  const [knockout, setKnockout] = useState<KnockoutFormat>("double");
  const [copied, setCopied] = useState(false);

  const toggle = (t: string) =>
    setSelected((sel) => (sel.includes(t) ? sel.filter((x) => x !== t) : sel.length >= 32 ? sel : [...sel, t]));

  const fmt: TournamentFormat = { warmup, pool, knockout };
  const result = useMemo(() => {
    if (selected.length < 2) return { error: "Pick at least 2 teams." as string, bracket: null };
    try {
      return { error: null, bracket: generateTournament(selected, fmt) };
    } catch (err) {
      return { error: (err as Error).message, bracket: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, warmup, pool, knockout]);

  async function copyJson() {
    if (!result.bracket) return;
    await navigator.clipboard.writeText(JSON.stringify(result.bracket, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Team picker — click order sets the seeds */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            Teams <span className="normal-case text-white/35">— click to add; order = seeding</span>
          </p>
          <span className="text-xs font-semibold text-white/60">{selected.length} / 32</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {teamNames.map((t) => {
            const idx = selected.indexOf(t);
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className={`${BTN} ${idx >= 0 ? "border-blue-400/50 bg-blue-500/15 text-white" : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"}`}
              >
                {idx >= 0 && <span className="mr-1.5 rounded bg-blue-500/40 px-1 text-[9px] font-bold tabular-nums">{idx + 1}</span>}
                {t}
              </button>
            );
          })}
          <button onClick={() => setSelected([...teamNames].sort(() => Math.random() - 0.5).slice(0, Math.max(selected.length, 4)))} className={`${BTN} border-white/15 text-white/50 hover:border-white/40 hover:text-white`} title="Random field">
            <Shuffle size={12} className="mr-1 inline" /> Shuffle
          </button>
        </div>
      </div>

      {/* Format */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Warm-up</p>
          <div className="flex gap-1.5">
            {([false, true] as const).map((v) => (
              <button key={String(v)} onClick={() => setWarmup(v)} className={`${BTN} ${warmup === v ? "border-blue-400/50 bg-blue-500/15 text-white" : "border-white/15 text-white/60 hover:border-white/40"}`}>
                {v ? "One exhibition game" : "None"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Pool / group stage</p>
          <div className="flex flex-wrap gap-1.5">
            {(["none", "two-game", "groups-of-4"] as const).map((v) => (
              <button key={v} onClick={() => setPool(v)} className={`${BTN} ${pool === v ? "border-blue-400/50 bg-blue-500/15 text-white" : "border-white/15 text-white/60 hover:border-white/40"}`}>
                {v === "none" ? "Straight to bracket" : v === "two-game" ? "Two-game pool" : "Groups of 4"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Knockout</p>
          <div className="flex gap-1.5">
            {(["single", "double"] as const).map((v) => (
              <button key={v} onClick={() => setKnockout(v)} className={`${BTN} ${knockout === v ? "border-blue-400/50 bg-blue-500/15 text-white" : "border-white/15 text-white/60 hover:border-white/40"}`}>
                {v === "single" ? "Single elimination" : "Double elimination"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      {result.error ? (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100/80">{result.error}</p>
      ) : result.bracket ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
              Preview — {result.bracket.sections.reduce((n, s) => n + s.rounds.reduce((m, r) => m + r.games.length, 0), 0)} games
            </p>
            <button onClick={copyJson} className={`${BTN} flex items-center gap-1.5 border-white/15 text-white/70 hover:border-white/40 hover:text-white`}>
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy bracket JSON"}
            </button>
          </div>
          <BracketSections sections={result.bracket.sections} logos={logos} />
        </div>
      ) : null}
    </div>
  );
}
