"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Trophy } from "lucide-react";
import type { TournamentBracket, BracketGame } from "./brackets";

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();
const initials = (s: string) =>
  norm(s)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

function TeamRow({ name, score, won, logo }: { name: string; score?: number; won: boolean; logo?: string }) {
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
      </span>
      <span className={`text-[13px] tabular-nums ${won ? "font-bold text-[color:var(--psx-accent)]" : "text-[color:var(--psx-faint)]"}`}>
        {score ?? (won ? "W" : "")}
      </span>
    </div>
  );
}

function GameCard({ g, logos }: { g: BracketGame; logos: Record<string, string> }) {
  const aWon = g.winner ? g.winner === "a" : g.sa != null && g.sb != null ? g.sa > g.sb : true;
  return (
    <div className="w-56 shrink-0 rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-3">
      <div className="space-y-1.5">
        <TeamRow name={g.a} score={g.sa} won={aWon} logo={logos[norm(g.a)]} />
        <TeamRow name={g.b} score={g.sb} won={!aWon} logo={logos[norm(g.b)]} />
      </div>
      {g.note && <p className="mt-2 border-t border-[color:var(--psx-border)] pt-1.5 text-[10px] italic leading-snug text-[color:var(--psx-faint)]">{g.note}</p>}
    </div>
  );
}

/**
 * Wraps a year's crest tile on Past Tournaments in a button that opens the
 * bracket popup: rounds left-to-right with team logos, winners highlighted,
 * and the game summary underneath.
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
            className="max-h-[88vh] w-[min(94vw,900px)] overflow-y-auto rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-panel,#101422)] p-5 shadow-2xl sm:p-6"
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

            {/* Rounds, left to right */}
            <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
              {bracket.rounds.map((round) => (
                <div key={round.title} className="flex shrink-0 flex-col">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--psx-faint)]">{round.title}</p>
                  <div className="flex flex-1 flex-col justify-around gap-3">
                    {round.games.map((g, i) => (
                      <GameCard key={i} g={g} logos={logos} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

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
          </div>
        </div>
      )}
    </>
  );
}
