"use client";

import { useEffect, useRef, useState } from "react";
import type { Bases, GameState, GraphicState, OverlayState, Snapshot, TeamState } from "@/lib/patriot/protocol";

/**
 * Public scoreboard overlay. Connects to the control hub as a read-only
 * `viewer` (no token), receives the switcher's state snapshots, and renders the
 * scoreboard + lower-third on top of the WHEP video — positioned exactly where
 * the operator placed it (overlay.transform). Nothing is baked into the video,
 * so it stays crisp and the operator's placement is respected.
 */
function useViewerSnapshot(wsUrl: string): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    let closed = false;
    let backoff = 1000;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      const ws = new WebSocket(`${wsUrl}?role=viewer`);
      wsRef.current = ws;
      ws.onopen = () => { backoff = 1000; };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(typeof e.data === "string" ? e.data : "") as { type?: string; snapshot?: Snapshot };
          if (m?.type === "state" && m.snapshot) setSnap(m.snapshot);
        } catch { /* ignore non-JSON */ }
      };
      ws.onclose = () => {
        if (!closed) { retry = setTimeout(open, backoff); backoff = Math.min(backoff * 2, 8000); }
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };
    open();
    return () => { closed = true; if (retry) clearTimeout(retry); try { wsRef.current?.close(); } catch { /* ignore */ } };
  }, [wsUrl]);

  return snap;
}

function Diamond({ bases }: { bases: Bases }) {
  const on = "#FFD400";
  const off = "rgba(255,255,255,0.22)";
  const cls = "absolute h-2.5 w-2.5 rotate-45 rounded-[1px]";
  return (
    <div className="relative h-7 w-7">
      <span className={`${cls} left-1/2 top-0 -translate-x-1/2`} style={{ backgroundColor: bases?.second ? on : off }} />
      <span className={`${cls} left-0 top-1/2 -translate-y-1/2`} style={{ backgroundColor: bases?.third ? on : off }} />
      <span className={`${cls} right-0 top-1/2 -translate-y-1/2`} style={{ backgroundColor: bases?.first ? on : off }} />
    </div>
  );
}

function Outs({ outs, max }: { outs: number; max: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: Math.max(1, max) }).map((_, i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: i < outs ? "#FFD400" : "rgba(255,255,255,0.22)" }} />
      ))}
    </div>
  );
}

function TeamSeg({ team }: { team: TeamState }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: team?.primaryColor || "#1f2937" }}>
      {team?.logoUrl ? (
        <div className="h-7 w-7 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${team.logoUrl})` }} />
      ) : null}
      <span className="text-base font-bold tracking-wide text-white drop-shadow">{team?.abbreviation || "—"}</span>
      <span className="ml-1 min-w-[1.25rem] text-center text-xl font-extrabold tabular-nums text-white drop-shadow">{team?.score ?? 0}</span>
    </div>
  );
}

function Scoreboard({ game }: { game: GameState }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md shadow-2xl ring-1 ring-black/50 font-[family-name:var(--font-display)]">
      <TeamSeg team={game.away} />
      <div className="flex items-center gap-3 bg-[#0a0e1a]/95 px-3 py-2 text-white">
        <div className="flex flex-col items-center leading-none">
          <span className="text-[11px] leading-none">{game.inningHalf === "top" ? "▲" : "▼"}</span>
          <span className="text-lg font-extrabold tabular-nums leading-tight">{game.inning ?? 1}</span>
        </div>
        <Diamond bases={game.bases} />
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-bold tabular-nums leading-none">{game.count?.balls ?? 0}-{game.count?.strikes ?? 0}</span>
          <Outs outs={game.outs ?? 0} max={game.rules?.outsPerHalfInning ?? 3} />
        </div>
      </div>
      <TeamSeg team={game.home} />
    </div>
  );
}

function LowerThird({ graphic }: { graphic: GraphicState }) {
  if (graphic?.kind !== "lower-third" || !graphic.lowerThird) return null;
  const { title, subtitle } = graphic.lowerThird;
  return (
    <div className="absolute bottom-[10%] left-[5%] max-w-[70%] font-[family-name:var(--font-display)]">
      <div className="overflow-hidden rounded-md shadow-2xl ring-1 ring-black/50">
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-red-600 px-4 py-2.5">
          <p className="text-lg font-extrabold uppercase leading-tight tracking-wide text-white drop-shadow">{title}</p>
          {subtitle ? <p className="text-xs font-semibold uppercase tracking-wide text-white/85">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function ScoreboardOverlay({ wsUrl }: { wsUrl: string }) {
  const snap = useViewerSnapshot(wsUrl);
  if (!wsUrl || !snap) return null;
  const o: OverlayState | undefined = snap.overlay;
  const t = o?.transform ?? { xPct: 3, yPct: 80, scale: 1 };
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {o?.visible && snap.game ? (
        <div
          className="absolute"
          style={{ left: `${t.xPct}%`, top: `${t.yPct}%`, transform: `scale(${t.scale ?? 1})`, transformOrigin: "top left" }}
        >
          <Scoreboard game={snap.game} />
        </div>
      ) : null}
      <LowerThird graphic={snap.graphic} />
    </div>
  );
}
