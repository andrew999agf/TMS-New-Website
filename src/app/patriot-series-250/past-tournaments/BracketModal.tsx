"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Trophy } from "lucide-react";
import type { TournamentBracket, BracketSection } from "@/lib/patriot/tournament";
import { gameResult } from "@/lib/patriot/tournament";
import { BracketSections, norm, initials } from "./BracketView";

const allGames = (sections: BracketSection[]) =>
  sections.flatMap((s) => s.rounds.flatMap((r) => r.games.map((game) => ({ round: r.title, game }))));

type StandingRow = { team: string; w: number; l: number; d: number; pct: number };

/** Standings from every decided, non-exhibition game in the bracket. */
function computeStandings(sections: BracketSection[]): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const row = (team: string) => {
    if (!table.has(team)) table.set(team, { team, w: 0, l: 0, d: 0, pct: 0 });
    return table.get(team)!;
  };
  for (const { game: g } of allGames(sections)) {
    if (g.exhibition) continue;
    const res = gameResult(g);
    if (res === "none") continue;
    if (res === "draw") {
      row(g.a).d += 1;
      row(g.b).d += 1;
    } else {
      row(res === "a" ? g.a : g.b).w += 1;
      row(res === "a" ? g.b : g.a).l += 1;
    }
  }
  for (const r of table.values()) {
    const games = r.w + r.l + r.d;
    r.pct = games ? (r.w + 0.5 * r.d) / games : 0;
  }
  return [...table.values()].sort((x, y) => y.pct - x.pct || y.w - x.w || x.team.localeCompare(y.team));
}

/** ".833"-style baseball formatting for win percentage. */
const fmtPct = (p: number) => (p >= 1 ? "1.000" : p.toFixed(3).replace(/^0/, ""));

/**
 * Wraps a year's crest tile on Past Tournaments in a button that opens the
 * bracket popup: broadcast-style connected bracket, then the game summary,
 * standings, and game-by-game log.
 */
export function BracketModal({
  year,
  champion,
  bracket,
  logos,
  className,
  children,
}: {
  year: number;
  champion?: string;
  bracket: TournamentBracket;
  logos: Record<string, string>;
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const standings = computeStandings(bracket.sections);
  const gameLog = [...allGames(bracket.sections)].sort((x, y) => {
    const nx = parseInt(x.game.id.replace(/\D/g, ""), 10) || 0;
    const ny = parseInt(y.game.id.replace(/\D/g, ""), 10) || 0;
    return nx - ny;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`View the ${year} bracket`}
        aria-label={`View the ${year} bracket`}
        className={`${className} cursor-pointer transition hover:ring-2 hover:ring-[color:var(--psx-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--psx-accent)]`}
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${year} Patriot Series bracket`}
        >
          <div
            className="max-h-[88vh] w-[min(94vw,1000px)] overflow-y-auto rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-panel,#101422)] p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--psx-accent)]">Patriot Series {year}</p>
                <h2 className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-bold text-[color:var(--psx-fg)]">The Bracket</h2>
                {champion && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--psx-muted)]">
                    <Trophy size={12} className="text-yellow-500" /> Champions: <span className="font-semibold text-[color:var(--psx-fg)]">{champion}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg border border-[color:var(--psx-border)] p-1.5 text-[color:var(--psx-muted)] transition-colors hover:text-[color:var(--psx-fg)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* The bracket */}
            <BracketSections sections={bracket.sections} logos={logos} />

            {/* Game summary */}
            <div className="mt-4 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--psx-faint)]">How it went</p>
              <ul className="mt-2 space-y-1.5">
                {bracket.summary.map((line, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-[color:var(--psx-muted)]">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {/* Standings */}
            <div className="mt-4 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--psx-faint)]">Tournament standings</p>
              <table className="mt-2 w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[color:var(--psx-faint)]">
                    <th className="pb-1.5 text-left font-semibold">Team</th>
                    <th className="w-9 pb-1.5 text-center font-semibold">W</th>
                    <th className="w-9 pb-1.5 text-center font-semibold">L</th>
                    <th className="w-9 pb-1.5 text-center font-semibold">D</th>
                    <th className="w-14 pb-1.5 text-right font-semibold">PCT</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((r) => {
                    const isChamp = champion ? norm(r.team) === norm(champion) : false;
                    return (
                      <tr key={r.team} className="border-t border-[color:var(--psx-border)]">
                        <td className="py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)]">
                              {logos[norm(r.team)] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logos[norm(r.team)]} alt="" className="h-full w-full object-contain p-0.5" />
                              ) : (
                                <span className="text-[7px] font-bold text-[color:var(--psx-faint)]">{initials(r.team)}</span>
                              )}
                            </span>
                            <span className={`truncate ${isChamp ? "font-semibold text-[color:var(--psx-fg)]" : "text-[color:var(--psx-muted)]"}`}>
                              {r.team}
                            </span>
                            {isChamp && <Trophy size={11} className="shrink-0 text-yellow-500" />}
                          </span>
                        </td>
                        <td className="py-1.5 text-center tabular-nums text-[color:var(--psx-fg)]">{r.w}</td>
                        <td className="py-1.5 text-center tabular-nums text-[color:var(--psx-muted)]">{r.l}</td>
                        <td className="py-1.5 text-center tabular-nums text-[color:var(--psx-muted)]">{r.d}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-[color:var(--psx-accent)]">{fmtPct(r.pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] italic text-[color:var(--psx-faint)]">From recorded bracket games only.</p>
            </div>

            {/* Game-by-game log */}
            <div className="mt-4 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--psx-faint)]">Game by game</p>
              <ol className="mt-2 space-y-1.5">
                {gameLog.map(({ round, game: g }, i) => {
                  const res = gameResult(g);
                  const winner = res === "a" ? g.a : g.b;
                  const score = g.sa != null && g.sb != null ? `${Math.max(g.sa, g.sb)}–${Math.min(g.sa, g.sb)}` : null;
                  const label = /^\D*\d+$/.test(g.id) ? `Game ${g.id.replace(/\D/g, "")}` : g.id;
                  return (
                    <li key={g.id + i} className="flex flex-wrap items-baseline gap-x-2 border-t border-[color:var(--psx-border)] pt-1.5 text-[13px] first:border-t-0 first:pt-0">
                      <span className="w-16 shrink-0 font-semibold text-[color:var(--psx-fg)]">{label}</span>
                      <span className="min-w-0 text-[color:var(--psx-muted)]">
                        {g.a} vs. {g.b} —{" "}
                        {res === "none" ? (
                          <span className="italic text-[color:var(--psx-faint)]">TBD</span>
                        ) : res === "draw" ? (
                          <span className="font-medium text-[color:var(--psx-fg)]">draw{g.sa != null ? `, ${g.sa}–${g.sb}` : ""}</span>
                        ) : (
                          <>
                            <span className="font-medium text-[color:var(--psx-fg)]">{winner}</span> win{score ? `, ${score}` : ""}
                          </>
                        )}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[color:var(--psx-faint)]">{round}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
