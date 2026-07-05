"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BracketSection, BracketGame } from "@/lib/patriot/tournament";
import { gameResult } from "@/lib/patriot/tournament";

export const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").trim();
export const initials = (s: string) =>
  norm(s)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

/** A placeholder entrant ("Winner G4", "Pool Seed 2", "Group A · 1st"). */
const isPlaceholder = (name: string) => /^(winner|loser|pool seed|group |seed |tbd)/i.test(name);

function TeamRow({
  name,
  seed,
  score,
  state,
  logo,
  tag,
}: {
  name: string;
  seed?: number;
  score?: number;
  state: "won" | "lost" | "neutral";
  logo?: string;
  tag?: string;
}) {
  const ghost = isPlaceholder(name);
  return (
    <div
      className={`-mx-1 flex items-center gap-2 rounded-md px-1 py-0.5 ${state === "won" ? "bg-[var(--psx-surface-2)]" : ""} ${state === "lost" ? "opacity-50" : ""}`}
    >
      {seed != null && <span className="w-3.5 shrink-0 text-right text-[9px] font-bold tabular-nums text-[color:var(--psx-faint)]">{seed}</span>}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)]">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <span className="text-[8px] font-bold tracking-wide text-[color:var(--psx-faint)]">{ghost ? "·" : initials(name)}</span>
        )}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${
          state === "won"
            ? "font-semibold text-[color:var(--psx-fg)]"
            : ghost
              ? "italic text-[color:var(--psx-faint)]"
              : "text-[color:var(--psx-muted)]"
        }`}
      >
        {name}
        {tag && <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase text-[color:var(--psx-faint)]">{tag}</span>}
      </span>
      <span className={`text-[13px] tabular-nums ${state === "won" ? "font-bold text-[color:var(--psx-accent)]" : "text-[color:var(--psx-faint)]"}`}>
        {score ?? (state === "won" ? "W" : "")}
      </span>
    </div>
  );
}

function GameCard({
  g,
  logos,
  gold,
  cardRef,
}: {
  g: BracketGame;
  logos: Record<string, string>;
  gold: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const res = gameResult(g);
  const stateOf = (side: "a" | "b"): "won" | "lost" | "neutral" =>
    res === "none" || res === "draw" ? "neutral" : res === side ? "won" : "lost";
  return (
    <div
      ref={cardRef}
      className={`relative w-60 shrink-0 rounded-lg border p-3 shadow-[0_2px_10px_rgba(0,0,0,0.18)] ${
        gold ? "border-yellow-500/50 bg-yellow-400/[0.06]" : "border-[color:var(--psx-border)] bg-[var(--psx-surface)]"
      }`}
    >
      <span
        className={`absolute -top-2 left-2 rounded px-1 text-[9px] font-bold tracking-wider ${
          gold ? "bg-yellow-500 text-black" : "bg-[var(--psx-panel,#101422)] text-[color:var(--psx-faint)]"
        }`}
      >
        {g.id}
      </span>
      {g.exhibition && (
        <span className="absolute -top-2 right-2 rounded bg-[var(--psx-panel,#101422)] px-1 text-[9px] font-bold uppercase tracking-wider text-[color:var(--psx-live)]">
          Exhibition
        </span>
      )}
      <div className="space-y-1">
        <TeamRow name={g.a} seed={g.seedA} score={g.sa} state={stateOf("a")} logo={logos[norm(g.a)]} tag={g.ta} />
        <TeamRow name={g.b} seed={g.seedB} score={g.sb} state={stateOf("b")} logo={logos[norm(g.b)]} tag={g.tb} />
      </div>
      {g.note && <p className="mt-2 border-t border-[color:var(--psx-border)] pt-1.5 text-[10px] italic leading-snug text-[color:var(--psx-faint)]">{g.note}</p>}
    </div>
  );
}

/**
 * One bracket section: round columns left-to-right with right-angle connector
 * lines drawn in an SVG overlay from each game to the game its winner advances
 * into — measured off the real cards so the lines stay glued at any size.
 */
function SectionView({ section, logos }: { section: BracketSection; logos: Record<string, string> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<{ d: string; gold: boolean }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const games = section.rounds.flatMap((r) => r.games);
  const goldIds = new Set(section.rounds.filter((r) => r.title.toLowerCase() === "championship").flatMap((r) => r.games.map((g) => g.id)));

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next: { d: string; gold: boolean }[] = [];
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
      next.push({ d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`, gold: goldIds.has(g.to) });
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
        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--psx-accent)]">
          <span className="h-3 w-1 rounded-full bg-[color:var(--psx-accent)]" /> {section.title}
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <div ref={containerRef} className="relative flex w-max min-w-full items-stretch gap-14 pt-2">
          <svg width={size.w} height={size.h} className="pointer-events-none absolute left-0 top-0" aria-hidden="true">
            {paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill="none"
                stroke={p.gold ? "rgba(234,179,8,0.75)" : "var(--psx-faint)"}
                strokeWidth={p.gold ? 2.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {section.rounds.map((round) => (
            <div key={round.title} className="flex shrink-0 flex-col">
              <p className="mb-3 border-b border-[color:var(--psx-border)] pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--psx-faint)]">
                {round.title}
              </p>
              <div className="flex flex-1 flex-col justify-around gap-5">
                {round.games.map((g) => (
                  <GameCard
                    key={g.id}
                    g={g}
                    logos={logos}
                    gold={goldIds.has(g.id)}
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

/** The full bracket: all sections stacked (winners on top, elimination below). */
export function BracketSections({ sections, logos }: { sections: BracketSection[]; logos: Record<string, string> }) {
  return (
    <>
      {sections.map((section, i) => (
        <SectionView key={section.title ?? i} section={section} logos={logos} />
      ))}
    </>
  );
}
