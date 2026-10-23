/**
 * Exhibit stickers — the colored labels a court reporter or clerk sticks on
 * an exhibit, drawn onto page 1 of the PDF instead.
 *
 * Colors follow the convention legal-supply houses and clerks use (no Texas
 * rule fixes them; a judge's standing order can override): plaintiff /
 * petitioner side YELLOW, defendant / respondent side BLUE, deposition RED,
 * the State in a criminal case RED, joint GREEN, the court's own WHITE,
 * intervenors PURPLE, third parties ORANGE. Every sticker can also be given
 * any of those colors by hand.
 *
 * Geometry is in fractions of the page so a position chosen on one page size
 * lands in the same place on another. Standard sticker: 1.6" × 0.95".
 */

export type StickerColor = "yellow" | "blue" | "red" | "green" | "white" | "purple" | "orange";
export const STICKER_COLORS: Record<StickerColor, { label: string; hex: string }> = {
  yellow: { label: "Yellow", hex: "#FFEF4A" },
  blue: { label: "Blue", hex: "#8FC4F5" },
  red: { label: "Red", hex: "#FF6F6F" },
  green: { label: "Green", hex: "#9BE39F" },
  white: { label: "White", hex: "#FFFFFF" },
  purple: { label: "Purple", hex: "#CDB2F7" },
  orange: { label: "Orange", hex: "#FFB65C" },
};

export type PartyKey =
  | "plaintiff" | "defendant" | "petitioner" | "respondent" | "state" | "joint" | "court"
  | "intervenor" | "intervenor-plaintiff" | "intervenor-defendant"
  | "third-party-plaintiff" | "third-party-defendant"
  | "cross-plaintiff" | "cross-defendant" | "counter-plaintiff" | "counter-defendant"
  | "relator" | "movant" | "applicant" | "claimant" | "deposition" | "custom";

/** Party → wording and conventional color. `owner` is the possessive used
 *  in "…'S EXHIBIT"; the deposition toggle inserts DEPOSITION and turns the
 *  sticker red. */
export const PARTIES: { key: PartyKey; label: string; owner: string | null; color: StickerColor }[] = [
  { key: "plaintiff", label: "Plaintiff", owner: "PLAINTIFF'S", color: "yellow" },
  { key: "defendant", label: "Defendant", owner: "DEFENDANT'S", color: "blue" },
  { key: "petitioner", label: "Petitioner", owner: "PETITIONER'S", color: "yellow" },
  { key: "respondent", label: "Respondent", owner: "RESPONDENT'S", color: "blue" },
  { key: "state", label: "State (criminal)", owner: "STATE'S", color: "red" },
  { key: "joint", label: "Joint", owner: "JOINT", color: "green" },
  { key: "court", label: "Court", owner: "COURT'S", color: "white" },
  { key: "intervenor", label: "Intervenor", owner: "INTERVENOR'S", color: "purple" },
  { key: "intervenor-plaintiff", label: "Intervenor-Plaintiff", owner: "INTERVENOR-PLAINTIFF'S", color: "purple" },
  { key: "intervenor-defendant", label: "Intervenor-Defendant", owner: "INTERVENOR-DEFENDANT'S", color: "purple" },
  { key: "third-party-plaintiff", label: "Third-Party Plaintiff", owner: "THIRD-PARTY PLAINTIFF'S", color: "orange" },
  { key: "third-party-defendant", label: "Third-Party Defendant", owner: "THIRD-PARTY DEFENDANT'S", color: "orange" },
  { key: "cross-plaintiff", label: "Cross-Plaintiff", owner: "CROSS-PLAINTIFF'S", color: "yellow" },
  { key: "cross-defendant", label: "Cross-Defendant", owner: "CROSS-DEFENDANT'S", color: "blue" },
  { key: "counter-plaintiff", label: "Counter-Plaintiff", owner: "COUNTER-PLAINTIFF'S", color: "yellow" },
  { key: "counter-defendant", label: "Counter-Defendant", owner: "COUNTER-DEFENDANT'S", color: "blue" },
  { key: "relator", label: "Relator", owner: "RELATOR'S", color: "yellow" },
  { key: "movant", label: "Movant", owner: "MOVANT'S", color: "yellow" },
  { key: "applicant", label: "Applicant", owner: "APPLICANT'S", color: "yellow" },
  { key: "claimant", label: "Claimant", owner: "CLAIMANT'S", color: "yellow" },
  { key: "deposition", label: "Deposition (no party)", owner: null, color: "red" },
  { key: "custom", label: "Custom wording", owner: null, color: "white" },
];
export const partyOf = (k: string | undefined): (typeof PARTIES)[number] => PARTIES.find((p) => p.key === k) ?? PARTIES[0];

/** Standard sticker size in PDF points (1.6" × 0.95"), before `scale`. */
export const STICKER_W = 115;
export const STICKER_H = 68;
/** Default inset from the page edge (points). */
const INSET = 20;

export type StickerDefaults = {
  /** Which party label each exhibit side gets (plaintiff/defendant/joint → PartyKey). */
  party: Record<string, PartyKey>;
  deposition: boolean;
  showCause: boolean;
  /** Second small line (case / cause number by default). */
  caseLine: string;
  /** Top-left corner of the sticker as fractions of the page (0..1). */
  x: number; y: number;
  scale: number;
  /** Sticker switched on for the set (per-exhibit "hidden" still wins). */
  enabled: boolean;
};

export type DocSticker = {
  party?: PartyKey; deposition?: boolean; color?: StickerColor; customText?: string;
  numberText?: string; x?: number; y?: number; scale?: number; hidden?: boolean;
};

export const defaultPosition = (pageW = 612, pageH = 792, scale = 1) => ({
  x: (pageW - STICKER_W * scale - INSET) / pageW,
  y: (pageH - STICKER_H * scale - INSET) / pageH,
});

export function normalizeDefaults(raw: unknown): StickerDefaults {
  const o = (raw ?? {}) as Partial<StickerDefaults>;
  const pos = defaultPosition();
  const party: Record<string, PartyKey> = { plaintiff: "plaintiff", defendant: "defendant", joint: "joint" };
  if (o.party && typeof o.party === "object") for (const [k, v] of Object.entries(o.party)) if (PARTIES.some((p) => p.key === v)) party[k] = v as PartyKey;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    party,
    deposition: !!o.deposition,
    showCause: o.showCause !== false,
    caseLine: typeof o.caseLine === "string" ? o.caseLine.slice(0, 60) : "",
    x: num(o.x, pos.x, 0, 1), y: num(o.y, pos.y, 0, 1),
    scale: num(o.scale, 1, 0.6, 2),
    enabled: o.enabled !== false,
  };
}

export function normalizeDocSticker(raw: unknown): DocSticker {
  const o = (raw ?? {}) as DocSticker;
  const out: DocSticker = {};
  if (o.party && PARTIES.some((p) => p.key === o.party)) out.party = o.party;
  if (typeof o.deposition === "boolean") out.deposition = o.deposition;
  if (o.color && o.color in STICKER_COLORS) out.color = o.color;
  if (typeof o.customText === "string" && o.customText.trim()) out.customText = o.customText.trim().slice(0, 40);
  if (typeof o.numberText === "string" && o.numberText.trim()) out.numberText = o.numberText.trim().slice(0, 16);
  for (const k of ["x", "y"] as const) if (typeof o[k] === "number" && Number.isFinite(o[k])) out[k] = Math.min(1, Math.max(0, o[k]!));
  if (typeof o.scale === "number" && Number.isFinite(o.scale)) out.scale = Math.min(2, Math.max(0.6, o.scale));
  if (o.hidden) out.hidden = true;
  return out;
}

/** The sticker exactly as it will be drawn for one exhibit. */
export type StickerSpec = {
  title: string; number: string; caseLine: string; color: StickerColor; hex: string;
  x: number; y: number; scale: number; hidden: boolean;
};

export function stickerSpec(defaults: StickerDefaults, doc: { side: string; label: string; number: number | null; sticker: DocSticker }, causeNumber: string): StickerSpec {
  const ov = doc.sticker;
  const partyKey = ov.party ?? defaults.party[doc.side] ?? (doc.side === "joint" ? "joint" : doc.side === "defendant" ? "defendant" : "plaintiff");
  const party = partyOf(partyKey);
  const deposition = ov.deposition ?? defaults.deposition;
  let title: string;
  if (party.key === "custom") title = (ov.customText || "EXHIBIT").toUpperCase();
  else if (party.key === "deposition") title = "DEPOSITION EXHIBIT";
  else title = `${party.owner} ${deposition ? "DEPOSITION " : ""}EXHIBIT`;
  const color: StickerColor = ov.color ?? (deposition && party.key !== "custom" ? "red" : party.color);
  const number = ov.numberText ?? numberFromLabel(doc.label, doc.number);
  return {
    title, number,
    caseLine: defaults.showCause ? (defaults.caseLine || causeNumber || "") : "",
    color, hex: STICKER_COLORS[color].hex,
    x: ov.x ?? defaults.x, y: ov.y ?? defaults.y, scale: ov.scale ?? defaults.scale,
    hidden: !!ov.hidden || !defaults.enabled,
  };
}

/** "P-12" / "D-3" / "12" → the number shown big on the sticker. */
export function numberFromLabel(label: string, number: number | null): string {
  const m = /([A-Za-z]*-?\s*)?(\d+[A-Za-z]?)$/.exec((label || "").trim());
  if (m) return m[2];
  if (number != null) return String(number);
  return label || "";
}

/** Fingerprint of everything that changes the drawing — compared with the
 *  key stored on the exhibit to know whether the baked-in sticker is current. */
export function stickerKey(spec: StickerSpec, sourcePathname: string): string {
  const s = JSON.stringify([spec.title, spec.number, spec.caseLine, spec.color, +spec.x.toFixed(4), +spec.y.toFixed(4), +spec.scale.toFixed(3), sourcePathname]);
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/** Word-wrap the title into at most `maxLines` lines that fit `maxChars`. */
export function wrapTitle(title: string, maxChars: number, maxLines = 3): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  while (lines.length > maxLines) { const last = lines.pop()!; lines[lines.length - 1] += ` ${last}`; }
  return lines;
}
