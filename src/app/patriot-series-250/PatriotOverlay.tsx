/**
 * PatriotOverlay — drop-in React component for the public Patriot Series
 * broadcast page.  Takes the operator app's {type:"state"} snapshot as a
 * prop and renders the EXACT same scoreboard / lower-third / sidebar /
 * standings / commercial graphics that the operator sees, positioned by
 * the operator's chosen overlay.transform.
 *
 *  - Self-contained: imports React only.  No Tailwind, no store, no fonts
 *    bundled — see PATRIOT_OVERLAY_FONTS_LINK below for the <head> tags
 *    you need.
 *  - Position + scale honor overlay.transform.{xPct, yPct, scale} so the
 *    public view matches whatever the operator dragged on their preview.
 *  - Replay footage cannot ship via JSON.  When snapshot.graphic.kind ===
 *    "replay", this component shows a generic "● INSTANT REPLAY" badge
 *    over the live video.  For full replay playback on the public stream,
 *    enable the WHIP track-swap hybrid (separate ask).
 *
 * Usage:
 *   <head>
 *     <link rel="stylesheet" href={PATRIOT_OVERLAY_FONTS_LINK} />
 *   </head>
 *   <div style={{position:"relative", width:"100%", aspectRatio:"16/9"}}>
 *     <video … />  // your WHEP player
 *     <PatriotOverlay snapshot={lastSnapshot} />
 *   </div>
 */

import * as React from "react";

/* ============================================================
 *  Snapshot type — copy of the operator's StateSnapshot.
 * ========================================================== */

export interface PatriotSnapshotTeam {
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  score: number;
  roster?: { id: string; name: string; number?: string; position?: string; subtitle?: string }[];
}

export interface PatriotSnapshot {
  program: number | null;
  preview: number | null;
  transition: "cut" | "fade";
  pip: boolean;
  audio: boolean;
  feeds: { slot: number; label: string; connected: boolean }[];
  game: {
    status: string;
    inning: number;
    inningHalf: "top" | "bottom";
    outs: number;
    count: { balls: number; strikes: number };
    bases: { first: boolean; second: boolean; third: boolean };
    rules: { inningsPerGame: number; outsPerHalfInning: number; ballsForWalk: number; strikesForOut: number };
    home: PatriotSnapshotTeam;
    away: PatriotSnapshotTeam;
  };
  graphic: {
    kind: "none" | "standings" | "other-games" | "lower-third" | "replay" | "commercial";
    lowerThird: { title: string; subtitle?: string } | null;
    /** Optional — operator will send these on the snapshot once added. */
    standings?: { team: { name: string; abbreviation: string; primaryColor: string }; wins: number; losses: number; runsScored: number; runsAllowed: number }[];
    otherGames?: {
      id: string;
      home: { name: string; abbreviation: string; primaryColor: string; score?: number };
      away: { name: string; abbreviation: string; primaryColor: string; score?: number };
      status: "scheduled" | "in_progress" | "final";
      startsAt?: string;
    }[];
  };
  overlay: {
    layout: "topbar" | "lowerthird" | "sidebar";
    visible: boolean;
    transform: { xPct: number; yPct: number; scale: number };
  };
  tournament: { name: string; year: number; label?: string; logoUrl?: string } | null;
  break: { on: boolean; durationSec: number };
}

/** Add this in your <head> (Google Fonts CDN). */
export const PATRIOT_OVERLAY_FONTS_LINK =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Roboto+Condensed:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap";

/* ============================================================
 *  Style tokens (kept in sync with the operator app)
 * ========================================================== */

const NAVY = "#0A2463";
const GOLD = "#FFB703";
const RED = "#E63946";
const SCORE_FONT = `"Bebas Neue", Impact, sans-serif`;
const UI_FONT = `"Roboto Condensed", system-ui, sans-serif`;
const MONO = `"Roboto Mono", ui-monospace, monospace`;

const BG_OVERLAY = "rgba(8,16,31,0.95)";
const BG_PANEL = "rgba(10,15,28,0.92)";

/* ============================================================
 *  Top-level component
 * ========================================================== */

export function PatriotOverlay({ snapshot: s }: { snapshot: PatriotSnapshot | null }) {
  if (!s) return null;
  const g = s.graphic;
  return (
    <div style={containerStyle}>
      <Keyframes />
      {s.overlay.visible && (
        <ScoreboardOverlay snapshot={s} />
      )}

      {/* Lower-third series logo bug (independent, only when layout=lowerthird) */}
      {s.overlay.layout === "lowerthird" && s.tournament?.logoUrl && (
        <img
          src={s.tournament.logoUrl}
          alt=""
          style={seriesLogoStyle}
          draggable={false}
        />
      )}

      {/* Broadcast graphics on top of everything else */}
      {g.kind === "standings" && <StandingsGraphic snapshot={s} />}
      {g.kind === "other-games" && <OtherGamesGraphic snapshot={s} />}
      {g.kind === "lower-third" && s.graphic.lowerThird && (
        <LowerThirdNamePlate data={s.graphic.lowerThird} />
      )}
      {g.kind === "commercial" && <CommercialSlate snapshot={s} />}
      {g.kind === "replay" && <ReplayBadge />}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  fontFamily: UI_FONT,
  pointerEvents: "none",
  color: "white",
};

/* ============================================================
 *  Scoreboard layouts (positioned + scaled by overlay.transform)
 * ========================================================== */

function ScoreboardOverlay({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  const t = s.overlay.transform;
  return (
    <div
      style={{
        position: "absolute",
        left: `${t.xPct}%`,
        top: `${t.yPct}%`,
        transform: `scale(${t.scale})`,
        transformOrigin: "top left",
      }}
    >
      {s.overlay.layout === "topbar" && <TopBar snapshot={s} />}
      {s.overlay.layout === "lowerthird" && <LowerThird snapshot={s} />}
      {s.overlay.layout === "sidebar" && <Sidebar snapshot={s} />}
    </div>
  );
}

function arrowFor(half: "top" | "bottom") {
  return half === "top" ? "▲" : "▼";
}

function TopBar({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  const { home, away, count, outs, inning, inningHalf, bases } = s.game;
  return (
    <div style={{ display: "flex", alignItems: "stretch", height: 72, fontFamily: SCORE_FONT, color: "white", boxShadow: "0 2px 0 rgba(0,0,0,0.4)" }}>
      <Block bg={BG_PANEL}>
        <TeamBadge team={away} size={56} />
        <div style={{ fontSize: 48, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{away.score}</div>
      </Block>
      <Divider />
      <Block bg={BG_PANEL}>
        <TeamBadge team={home} size={56} />
        <div style={{ fontSize: 48, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{home.score}</div>
      </Block>
      <Divider />
      <Block bg={BG_PANEL} gap={16}>
        <Column>
          <div style={{ fontSize: 28, lineHeight: 1 }}>{arrowFor(inningHalf)}{inning}</div>
          <Tiny>Inning</Tiny>
        </Column>
        <Column>
          <div style={{ fontFamily: MONO, fontSize: 22, lineHeight: 1 }}>{count.balls}-{count.strikes}</div>
          <Tiny>B-S · {outs} {outs === 1 ? "OUT" : "OUTS"}</Tiny>
        </Column>
        <Bases bases={bases} size={14} />
      </Block>
    </div>
  );
}

function LowerThird({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  const { home, away, count, outs, inning, inningHalf, bases } = s.game;
  const battingHome = inningHalf === "bottom";
  return (
    <div style={{ display: "flex", width: 820, fontFamily: SCORE_FONT, color: "white" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <LowerThirdRow team={away} score={away.score} batting={!battingHome} />
        <LowerThirdRow team={home} score={home.score} batting={battingHome} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 20px", gap: 8, background: BG_OVERLAY, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 36, lineHeight: 1 }}>{arrowFor(inningHalf)}{inning}</div>
          <Bases bases={bases} size={14} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontFamily: MONO }}>
          <span>{count.balls}-{count.strikes}</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 16 }}>·</span>
          <span>{outs} {outs === 1 ? "OUT" : "OUTS"}</span>
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase" }}>
          {s.tournament?.name ?? "Patriot Series"}
        </div>
      </div>
    </div>
  );
}

function LowerThirdRow({ team, score, batting }: { team: PatriotSnapshotTeam; score: number; batting: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 56, background: `linear-gradient(90deg, ${team.primaryColor} 0%, rgba(10,15,28,0.96) 60%)` }}>
      <div style={{ width: 12, height: "100%", background: team.secondaryColor }} />
      <div style={{ padding: "0 12px" }}>
        <TeamBadge team={team} size={50} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 26, letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</span>
        {batting && (
          <span style={{ width: 8, height: 8, borderRadius: 999, background: GOLD, boxShadow: `0 0 6px ${GOLD}`, flexShrink: 0 }} aria-label="At bat" />
        )}
      </div>
      <div style={{ padding: "0 20px", fontSize: 48, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{score}</div>
    </div>
  );
}

function Sidebar({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  const { home, away, count, outs, inning, inningHalf, bases } = s.game;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 260, background: BG_PANEL, borderRadius: 8, overflow: "hidden", fontFamily: SCORE_FONT, color: "white" }}>
      <div style={{ padding: "8px 12px", fontSize: 10, letterSpacing: "0.25em", color: GOLD, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {s.tournament?.name ?? "Patriot Series"}
      </div>
      <SidebarRow team={away} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />
      <SidebarRow team={home} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: "12px", background: "rgba(0,0,0,0.4)" }}>
        <Column>
          <div style={{ fontSize: 28, lineHeight: 1 }}>{arrowFor(inningHalf)}{inning}</div>
          <Tiny>Inning</Tiny>
        </Column>
        <Column>
          <div style={{ fontFamily: MONO, fontSize: 22, lineHeight: 1 }}>{count.balls}-{count.strikes}</div>
          <Tiny>{outs} {outs === 1 ? "OUT" : "OUTS"}</Tiny>
        </Column>
        <Bases bases={bases} size={14} />
      </div>
    </div>
  );
}

function SidebarRow({ team }: { team: PatriotSnapshotTeam }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
      <TeamBadge team={team} size={56} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 22, letterSpacing: "0.04em", lineHeight: 1 }}>{team.abbreviation}</div>
        <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(198,206,224,1)", textTransform: "uppercase", marginTop: 4, fontFamily: UI_FONT }}>{team.name}</div>
      </div>
      <div style={{ fontSize: 44, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{team.score}</div>
    </div>
  );
}

/* ============================================================
 *  Helpers — TeamBadge, Bases, etc.
 * ========================================================== */

function TeamBadge({ team, size = 56 }: { team: PatriotSnapshotTeam; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: team.primaryColor,
        border: `2px solid ${team.secondaryColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SCORE_FONT,
        fontSize: Math.round(size * 0.45),
        color: "white",
        overflow: "hidden",
        flexShrink: 0,
        letterSpacing: "0.04em",
      }}
      aria-label={team.name}
    >
      {team.logoUrl ? (
        <img src={team.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
      ) : (
        team.abbreviation
      )}
    </div>
  );
}

function Bases({ bases, size = 14 }: { bases: { first: boolean; second: boolean; third: boolean }; size?: number }) {
  const cell: React.CSSProperties = { width: size, height: size, borderRadius: 2, border: "1px solid rgba(255,255,255,0.7)", display: "inline-block", transform: "rotate(45deg)", position: "absolute" };
  const on = { background: GOLD };
  return (
    <div style={{ position: "relative", width: size * 3, height: size * 3 }}>
      <span style={{ ...cell, ...(bases.second ? on : {}), top: 0, left: size }} />
      <span style={{ ...cell, ...(bases.third ? on : {}), top: size, left: 0 }} />
      <span style={{ ...cell, ...(bases.first ? on : {}), top: size, left: size * 2 }} />
    </div>
  );
}

function Block({ children, bg, gap = 12 }: { children: React.ReactNode; bg: string; gap?: number }) {
  return <div style={{ display: "flex", alignItems: "center", gap, padding: "0 16px", background: bg }}>{children}</div>;
}
function Divider() { return <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />; }
function Column({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>{children}</div>;
}
function Tiny({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(198,206,224,1)", textTransform: "uppercase", marginTop: 2, fontFamily: UI_FONT, fontWeight: 700 }}>{children}</div>;
}

/* ============================================================
 *  Broadcast graphics
 * ========================================================== */

const seriesLogoStyle: React.CSSProperties = {
  position: "absolute",
  right: 40,
  bottom: 40,
  width: 180,
  height: 180,
  objectFit: "contain",
  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.55))",
};

function StandingsGraphic({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  const rows = (s.graphic.standings ?? []).slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <div style={{ position: "absolute", right: 40, top: 40, bottom: 40, maxWidth: 460, width: "100%", background: BG_OVERLAY, border: `1px solid rgba(255,183,3,0.45)`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.55)", color: "white", fontFamily: SCORE_FONT, animation: "psxFade .22s ease-out both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: NAVY, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {s.tournament?.logoUrl && <img src={s.tournament.logoUrl} alt="" style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0 }} />}
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.25em", color: GOLD, textTransform: "uppercase" }}>
            {s.tournament ? `${s.tournament.name} ${s.tournament.year}` : "Tournament"}
          </div>
          <div style={{ fontSize: 22, letterSpacing: "0.04em", marginTop: 2 }}>STANDINGS</div>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>
            <th style={{ textAlign: "left", padding: "8px 8px 8px 16px" }}>#</th>
            <th style={{ textAlign: "left", padding: 8 }}>Team</th>
            <th style={{ width: 36, textAlign: "center", padding: 8 }}>W</th>
            <th style={{ width: 36, textAlign: "center", padding: 8 }}>L</th>
            <th style={{ width: 48, textAlign: "center", padding: 8 }}>DIFF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = r.runsScored - r.runsAllowed;
            return (
              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <td style={{ padding: "8px 8px 8px 16px", fontSize: 18 }}>{i + 1}</td>
                <td style={{ padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 28, borderRadius: 2, background: r.team.primaryColor }} />
                    <span style={{ fontSize: 20, letterSpacing: "0.04em" }}>{r.team.abbreviation}</span>
                    <span style={{ fontFamily: UI_FONT, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{r.team.name}</span>
                  </div>
                </td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 18 }}>{r.wins}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 18 }}>{r.losses}</td>
                <td style={{ textAlign: "center", fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{diff > 0 ? "+" : ""}{diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OtherGamesGraphic({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  const games = (s.graphic.otherGames ?? []).slice(0, 4);
  if (games.length === 0) return null;
  return (
    <div style={{ position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)", maxWidth: 760, width: "100%", background: BG_OVERLAY, border: `1px solid rgba(255,183,3,0.45)`, borderRadius: 8, overflow: "hidden", color: "white", fontFamily: SCORE_FONT, animation: "psxFade .22s ease-out both" }}>
      <div style={{ padding: "8px 20px", background: NAVY, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.25em", color: GOLD, textTransform: "uppercase" }}>
          {s.tournament ? `${s.tournament.name} ${s.tournament.year}` : "Tournament"}
        </div>
        <div style={{ fontSize: 20, letterSpacing: "0.04em", marginTop: 2 }}>AROUND THE TOURNAMENT</div>
      </div>
      <div>
        {games.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
              <OtherGameLine line={g.away} winner={g.status === "final" && (g.away.score ?? 0) > (g.home.score ?? 0)} />
              <OtherGameLine line={g.home} winner={g.status === "final" && (g.home.score ?? 0) > (g.away.score ?? 0)} />
            </div>
            <StatusPill status={g.status} startsAt={g.startsAt} />
          </div>
        ))}
      </div>
    </div>
  );
}

function OtherGameLine({ line, winner }: { line: { name: string; abbreviation: string; primaryColor: string; score?: number }; winner: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 6, height: 28, borderRadius: 2, background: line.primaryColor }} />
      <span style={{ fontSize: 20, letterSpacing: "0.04em", color: winner ? GOLD : "white" }}>{line.abbreviation}</span>
      <span style={{ flex: 1, fontFamily: UI_FONT, fontSize: 13, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</span>
      <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{line.score ?? "—"}</span>
    </div>
  );
}

function StatusPill({ status, startsAt }: { status: "scheduled" | "in_progress" | "final"; startsAt?: string }) {
  const style: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid",
  };
  if (status === "final") return <span style={{ ...style, background: "rgba(255,183,3,0.15)", borderColor: "rgba(255,183,3,0.3)", color: GOLD }}>Final</span>;
  if (status === "in_progress") return <span style={{ ...style, background: "rgba(230,57,70,0.15)", borderColor: "rgba(230,57,70,0.3)", color: RED, animation: "psxBlink .9s steps(1) infinite" }}>Live</span>;
  const time = startsAt ? new Date(startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "TBD";
  return <span style={{ ...style, background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>{time}</span>;
}

function LowerThirdNamePlate({ data }: { data: { title: string; subtitle?: string } }) {
  return (
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 128, maxWidth: 760, margin: "0 auto", background: "rgba(8,16,31,0.95)", borderLeft: `6px solid ${GOLD}`, borderRadius: 6, color: "white", fontFamily: SCORE_FONT, padding: "16px 24px", animation: "psxFade .22s ease-out both" }}>
      <div style={{ fontSize: 28, letterSpacing: "0.04em" }}>{data.title}</div>
      {data.subtitle && (
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", fontFamily: UI_FONT, marginTop: 4 }}>{data.subtitle}</div>
      )}
    </div>
  );
}

function CommercialSlate({ snapshot: s }: { snapshot: PatriotSnapshot }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#08101f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", fontFamily: SCORE_FONT }}>
      <div style={{ position: "absolute", top: 32, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
        <div style={{ fontSize: 22, letterSpacing: "0.3em", color: GOLD, textTransform: "uppercase" }}>Commercial Break</div>
        <div style={{ fontSize: 13, letterSpacing: "0.18em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginTop: 4 }}>
          {s.tournament ? `${s.tournament.name} ${s.tournament.year}` : ""}
        </div>
      </div>
      {s.tournament?.logoUrl && <img src={s.tournament.logoUrl} alt="" style={{ width: 200, height: 200, objectFit: "contain", marginBottom: 24 }} />}
      <div style={{ fontSize: 64, letterSpacing: "0.04em" }}>WE’LL BE RIGHT BACK</div>
    </div>
  );
}

function ReplayBadge() {
  return (
    <div style={{ position: "absolute", top: 32, left: 32, padding: "8px 16px", borderRadius: 6, background: "rgba(0,0,0,0.65)", color: RED, fontFamily: SCORE_FONT, fontSize: 28, letterSpacing: "0.18em", animation: "psxBlink .9s steps(1) infinite" }}>
      ● INSTANT REPLAY
    </div>
  );
}

/* ============================================================
 *  Inline keyframes (injected once)
 * ========================================================== */

function Keyframes() {
  return (
    <style>{`
      @keyframes psxFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes psxBlink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0.4; } }
    `}</style>
  );
}
