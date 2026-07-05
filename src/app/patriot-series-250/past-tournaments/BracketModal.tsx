"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X, Trophy } from "lucide-react";
import type { TournamentBracket, BracketSection, BracketGame } from "./brackets";

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();
const initials = (s: string) =>
  norm(s)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

/** Which side won a game (draw only when scores are recorded and equal). */
function gameWinner(g: BracketGame): "a" | "b" | "draw" {
  if (g.winner) return g.winner;
  if (g.sa != null && g.sb != null) return g.sa === g.sb ? "draw" : g.sa > g.sb ? "a" : "b";
  return "a";
}

const allGames = (sections: BracketSection[]) => sections.flatMap((s) => s.rounds.flatMap((r) => r.games.map((game) => ({ round: r.title, game }))));

type StandingRow = { team: string; w: number; l: number; d: number; pct: number };

/** Tournament standings computed from every game in the bracket. */
function computeStandings(sections: BracketSection[]): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const row = (team: string) => {
    if (!table.has(team)) table.set(team, { team, w: 0, l: 0, d: 0, pct: 0 });
    return table.get(team)!;
  };
  for (const { game: g } of allGames(sections)) {
    const res = gameWinner(g);
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

function TeamRow({ name, score, won, logo, tag }: { name: string; score?: number; won: boolean; logo?: string; tag?: string }) {
  return (
    <div className={`flex items-center gap-2 ${won ? "" : "opacity-55"}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)]">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <span className="text-[8px] font-bold tracking-wide text-[color:var(--psx-faint)]">{initials(name)}</span>
        )}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] ${won ? "font-semibold text-[color:var(--psx-fg)]" : "text-[color:var(--psx-muted)]"}`}>
        {name}
        {tag && <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase text-[color:var(--psx-faint)]">{tag}</span>}
      </span>
      <span className={`text-[13px] tabular-nums ${won ? "font-bold text-[color:var(--psx-accent)]" : "text-[color:var(--psx-faint)]"}`}>
        {score ?? (won ? "W" : "")}
      </span>
    </div>
  );
}

function GameCard({ g, logos, cardRef }: { g: BracketGame; logos: Record<string, string>; cardRef: (el: HTMLDivElement | null) => void }) {
  const aWon = gameWinner(g) === "a";
  return (
    <div ref={cardRef} className="relative w-56 shrink-0 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-3">
      <span className="absolute -top-2 left-2 rounded bg-[var(--psx-panel,#101422)] px-1 text-[9px] font-bold tracking-wider text-[color:var(--psx-faint)]">
        {g.id}
      </span>
      <div className="space-y-1.5">
        <TeamRow name={g.a} score={g.sa} won={aWon} logo={logos[norm(g.a)]} tag={g.ta} />
        <TeamRow name={g.b} score={g.sb} won={!aWon} logo={logos[norm(g.b)]} tag={g.tb} />
      </div>
      {g.note && <p className="mt-2 border-t border-[color:var(--psx-border)] pt-1.5 text-[10px] italic leading-snug text-[color:var(--psx-faint)]">{g.note}</p>}
    </div>
  );
}

/**
 * One bracket section (winners / elimination / a whole single-elim year):
 * round columns left-to-right, with right-angle connector lines drawn in an
 * SVG overlay from each game to the game its winner advances into — the way
 * the hand-drawn posters connect them.
 */
function SectionView({ section, logos }: { section: BracketSection; logos: Record<string, string> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const games = section.rounds.flatMap((r) => r.games);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next: string[] = [];
    for (const g of games) {
      if (!g.to) continue;
      const from = cardRefs.current.get(g.id);
      const to = cardRefs.current.get(g.to);
      if (!from || !to) continue;
      const f = from.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      const x1 = f.right - cRect.left;
      const y1 = f.top + f.height / 2 - cRect.top;
      const x2 = t.left - cRect.left;
      const y2 = t.top + t.height / 2 - cRect.top;
      const midX = x1 + (x2 - x1) / 2;
      next.push(`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    }
    setPaths(next);
    setSize({ w: container.scrollWidth, h: container.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className="mt-5">
      {section.title && (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--psx-accent)]">{section.title}</p>
      )}
      <div className="overflow-x-auto pb-2">
        <div ref={containerRef} className="relative flex w-max min-w-full items-stretch gap-12">
          <svg width={size.w} height={size.h} className="pointer-events-none absolute left-0 top-0" aria-hidden="true">
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="var(--psx-faint)" strokeWidth="1.5" />
            ))}
          </svg>
          {section.rounds.map((round) => (
            <div key={round.title} className="flex shrink-0 flex-col">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--psx-faint)]">{round.title}</p>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {round.games.map((g) => (
                  <GameCard
                    key={g.id}
                    g={g}
                    logos={logos}
                    cardRef={(el) => {
                      if (el) cardRefs.current.set(g.id, el);
                      else cardRefs.current.delete(g.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a year's crest tile on Past Tournaments in a button that opens the
 * bracket popup: poster-style connected bracket, then the game summary,
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
            className="max-h-[88vh] w-[min(94vw,960px)] overflow-y-auto rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-panel,#101422)] p-5 shadow-2xl sm:p-6"
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

            {/* The bracket, poster-style */}
            {bracket.sections.map((section, i) => (
              <SectionView key={section.title ?? i} section={section} logos={logos} />
            ))}

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
                  const res = gameWinner(g);
                  const winner = res === "a" ? g.a : g.b;
                  const score = g.sa != null && g.sb != null ? `${Math.max(g.sa, g.sb)}–${Math.min(g.sa, g.sb)}` : null;
                  const label = /^\D*\d+$/.test(g.id) ? `Game ${g.id.replace(/\D/g, "")}` : g.id;
                  return (
                    <li key={g.id + i} className="flex flex-wrap items-baseline gap-x-2 border-t border-[color:var(--psx-border)] pt-1.5 text-[13px] first:border-t-0 first:pt-0">
                      <span className="w-16 shrink-0 font-semibold text-[color:var(--psx-fg)]">{label}</span>
                      <span className="min-w-0 text-[color:var(--psx-muted)]">
                        {g.a} vs. {g.b} —{" "}
                        {res === "draw" ? (
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
