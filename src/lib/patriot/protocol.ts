/**
 * Patriot Series 250 — Channel B wire protocol.
 *
 * Shared by the operator control panel (commands out) and the public scoreboard
 * overlay (state in). Mirrors the switcher's INTEGRATION_SPEC exactly:
 *   - camera param is always `slot` (1–9), never `input`
 *   - team is "home" | "away"; bases are "first" | "second" | "third"
 *   - team colors are camelCase hex strings; inningHalf is "top" | "bottom"
 *   - logoUrl fields are optional (omitted when unset) and may be large data URLs
 *
 * Commands may carry an optional top-level `id` (any string); the switcher
 * echoes it in its ack. We always send one so retries/reconcile are unambiguous.
 */

export type Team = "home" | "away";
export type BaseKey = "first" | "second" | "third";
export type TransitionType = "cut" | "fade";
export type OverlayLayout = "topbar" | "lowerthird" | "sidebar";
export type GraphicKind =
  | "none"
  | "standings"
  | "other-games"
  | "lower-third"
  | "replay"
  | "commercial";

/** Kinds the operator may trigger via graphic.show — "replay" is local-only
 * (it drains the switcher's capture buffer), so it's excluded here even though
 * it's a valid snapshot graphic.kind. */
export type GraphicShowKind = "standings" | "other-games" | "lower-third" | "commercial";

/* ---- State snapshot (pushed by the switcher) ----------------------------- */

export interface Feed {
  slot: number;
  label: string;
  connected: boolean;
}
export interface Count {
  balls: number;
  strikes: number;
}
export interface Bases {
  first: boolean;
  second: boolean;
  third: boolean;
}
export interface Rules {
  inningsPerGame: number;
  outsPerHalfInning: number;
  ballsForWalk: number;
  strikesForOut: number;
}
export interface RosterPlayer {
  id: string;
  name: string;
  number?: string;
  position?: string;
  subtitle?: string;
}
export interface TeamState {
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  score: number;
  roster: RosterPlayer[];
}
export interface GameState {
  status: string;
  inning: number;
  inningHalf: "top" | "bottom";
  outs: number;
  count: Count;
  bases: Bases;
  rules: Rules;
  home: TeamState;
  away: TeamState;
}
export interface LowerThird {
  title: string;
  subtitle?: string;
}
export interface GraphicState {
  kind: GraphicKind;
  lowerThird: LowerThird | null;
}
export interface OverlayTransform {
  xPct: number;
  yPct: number;
  scale: number;
}
export interface OverlayState {
  layout: OverlayLayout;
  visible: boolean;
  transform: OverlayTransform;
}
export interface Tournament {
  name: string;
  year: number;
  label: string;
  logoUrl?: string;
}
export interface BreakState {
  on: boolean;
  durationSec: number;
}
export interface Snapshot {
  program: number | null;
  preview: number | null;
  transition: string;
  pip: boolean;
  audio: boolean;
  feeds: Feed[];
  game: GameState;
  graphic: GraphicState;
  overlay: OverlayState;
  tournament: Tournament;
  break: BreakState;
}

/* ---- Messages ------------------------------------------------------------ */

export interface StateMessage {
  type: "state";
  t: number;
  snapshot: Snapshot;
}
export interface AckMessage {
  type: "ack";
  id?: string;
  ok: boolean;
  error?: string;
}
export interface PresenceMessage {
  type: "presence";
  switcher: boolean;
}

/* ---- Commands (operator → switcher) -------------------------------------- *
 * Param keys and value enums confirmed by the switcher: transition is
 * "cut" | "fade"; count adds "reset"; game adds "pause" | "resume";
 * graphic.show excludes "replay" (local-only). Each command may carry an `id`.
 */
export type Command =
  | { action: "take" }
  | { action: "preview"; slot: number }
  | { action: "program"; slot: number } // alias: cut
  | { action: "cut"; slot: number }
  | { action: "drop-camera"; slot: number }
  | { action: "drop-all" }
  | { action: "transition"; type: TransitionType }
  | { action: "pip"; enabled: boolean }
  | { action: "audio"; enabled: boolean }
  | { action: "score.add"; team: Team; n: number }
  | { action: "score.set"; team: Team; n: number }
  | { action: "count"; which: "ball" | "strike" | "out" | "reset" }
  | { action: "inning"; dir: "next" | "prev" }
  | { action: "bases.toggle"; base: BaseKey }
  | { action: "bases.clear" }
  | { action: "game"; lifecycle: "start" | "pause" | "resume" | "end" | "reset" }
  | { action: "graphic.show"; kind: GraphicShowKind; data?: unknown; durationSec?: number }
  | { action: "graphic.clear" }
  | { action: "overlay.layout"; layout: OverlayLayout }
  | { action: "overlay.visible"; visible: boolean }
  | { action: "break"; on: boolean }
  | { action: "ping" };
