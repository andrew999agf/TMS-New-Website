/**
 * Exhibit helpers: read a likely exhibit number and party out of a filename, and
 * format hard exhibit numbers once the order is settled. Client-safe.
 *
 * The parsing is deliberately conservative — it only claims a number when the
 * filename really looks like it carries one. Anything it can't read keeps its
 * position in natural filename order and gets numbered by where the user puts it.
 */

export type Side = "plaintiff" | "defendant" | "joint";

/** How hard exhibit numbers get written once the order is locked in. */
export type NumberScheme = {
  id: string;
  label: string;
  /** Example rendering for the picker. */
  sample: string;
  format: (side: Side, n: number) => string;
};

const sidePrefix = (side: Side) => (side === "defendant" ? "D" : side === "joint" ? "J" : "P");
const sideWord = (side: Side) => (side === "defendant" ? "Defendant's" : side === "joint" ? "Joint" : "Plaintiff's");

export const NUMBER_SCHEMES: NumberScheme[] = [
  { id: "dash", label: "P-1 / D-1", sample: "P-1", format: (s, n) => `${sidePrefix(s)}-${n}` },
  { id: "plain", label: "P1 / D1", sample: "P1", format: (s, n) => `${sidePrefix(s)}${n}` },
  { id: "ex", label: "PX-1 / DX-1", sample: "PX-1", format: (s, n) => `${sidePrefix(s)}X-${n}` },
  { id: "words", label: "Plaintiff's Exhibit 1", sample: "Plaintiff's Ex. 1", format: (s, n) => `${sideWord(s)} Ex. ${n}` },
  { id: "number", label: "Just the number (1, 2, 3)", sample: "1", format: (_s, n) => String(n) },
];

export function getScheme(id: string): NumberScheme {
  return NUMBER_SCHEMES.find((s) => s.id === id) ?? NUMBER_SCHEMES[0];
}

export const SIDE_LABEL: Record<Side, string> = {
  plaintiff: "Plaintiff's exhibits",
  defendant: "Defendant's exhibits",
  joint: "Joint exhibits",
};

/** Foundation shortcuts that can stand in for a sponsoring witness. */
export const FOUNDATION_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "business-records-affidavit", label: "Business records affidavit", hint: "TRE 902(10) — file and serve at least 14 days before trial" },
  { id: "certified-record", label: "Certified record", hint: "Self-authenticating public record under TRE 902" },
  { id: "self-authenticating", label: "Otherwise self-authenticating", hint: "TRE 902 — no sponsoring witness needed" },
  { id: "stipulated", label: "Stipulated / agreed", hint: "Opposing counsel has agreed to admission" },
];

/* --------------------------- filename parsing ----------------------------- */

export type ParsedExhibit = {
  /** Original file name, untouched. */
  fileName: string;
  /** A readable title with the numbering prefix and extension stripped out. */
  title: string;
  /** Party read from the filename, if it declared one. */
  side: Side | null;
  /** Exhibit number read from the filename, if it had one. */
  number: number | null;
  /** Bates-looking token, e.g. RES_000260. */
  bates: string;
};

const stripExt = (n: string) => n.replace(/\.[A-Za-z0-9]{1,5}$/, "");
const tidy = (s: string) =>
  s.replace(/[_]+/g, " ")
    .replace(/\s*[-–—]\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-.]+|[\s\-.]+$/g, "")
    .trim();

/**
 * Pull an exhibit designation out of a filename. Handles the shapes people
 * actually use: "P-1 Deed.pdf", "P1.pdf", "EX 12 - survey.pdf",
 * "Plaintiff's Exhibit 3.pdf", "Defendants Ex 7.pdf", "01 deed.pdf".
 */
export function parseExhibitName(fileName: string): ParsedExhibit {
  const base = stripExt(fileName);
  let side: Side | null = null;
  let number: number | null = null;
  let rest = base;

  // Bates token anywhere in the name (kept, not stripped from the title).
  const batesMatch = base.match(/\b([A-Z]{2,6}[_-]?\d{4,8})\b/);
  const bates = batesMatch ? batesMatch[1] : "";

  // "Plaintiff's Exhibit 3" / "Defendant Ex. 7" / "Joint Exhibit 2"
  const worded = base.match(/^\s*(plaintiff|defendant|defense|joint|state)(?:'?s)?\s*(?:exhibit|ex\.?|x)?\s*[-–—#:]?\s*(\d{1,4})\b/i);
  if (worded) {
    const w = worded[1].toLowerCase();
    side = w === "joint" ? "joint" : w === "plaintiff" || w === "state" ? "plaintiff" : "defendant";
    number = Number(worded[2]);
    rest = base.slice(worded[0].length);
  }

  // "P-1", "P1", "D_12", "PX-3", "J 4" at the start.
  if (number === null) {
    const coded = base.match(/^\s*(p|d|j)\s*x?\s*[-–—_ .#]?\s*(\d{1,4})(?![\d])/i);
    if (coded) {
      const c = coded[1].toLowerCase();
      side = c === "d" ? "defendant" : c === "j" ? "joint" : "plaintiff";
      number = Number(coded[2]);
      rest = base.slice(coded[0].length);
    }
  }

  // "EX 12", "Exhibit 12", "Ex-12" at the start (no party declared).
  if (number === null) {
    const ex = base.match(/^\s*(?:exhibit|exh|ex)\.?\s*[-–—_ #:]?\s*(\d{1,4})\b/i);
    if (ex) {
      number = Number(ex[1]);
      rest = base.slice(ex[0].length);
    }
  }

  // A bare leading number: "01 - deed.pdf", "7. survey.pdf".
  if (number === null) {
    const lead = base.match(/^\s*(\d{1,4})\s*[-–—._)]\s*/);
    if (lead) {
      number = Number(lead[1]);
      rest = base.slice(lead[0].length);
    }
  }

  const title = tidy(rest) || tidy(base) || fileName;
  return { fileName, title, side, number, bates };
}

/** Natural (numeric-aware) filename order — the fallback when nothing parses. */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Best-guess running order for a dropped batch: anything that declared a number
 * sorts by it, and the rest follow in natural filename order. Stable, so a batch
 * that parses cleanly comes out exactly as numbered.
 */
export function suggestOrder(items: ParsedExhibit[]): ParsedExhibit[] {
  const numbered = items.filter((i) => i.number !== null).sort((a, b) => (a.number! - b.number!) || collator.compare(a.fileName, b.fileName));
  const rest = items.filter((i) => i.number === null).sort((a, b) => collator.compare(a.fileName, b.fileName));
  return [...numbered, ...rest];
}

/**
 * Assign hard exhibit numbers down the list, counting SEPARATELY per party — so
 * plaintiff's run 1..n and defendant's run 1..m rather than sharing one sequence.
 * `startAt` continues an existing list (e.g. the case already has P-1..P-8).
 */
export function assignNumbers<T extends { side: Side }>(
  rows: T[],
  schemeId: string,
  startAt: Partial<Record<Side, number>> = {},
): (T & { number: string })[] {
  const scheme = getScheme(schemeId);
  const next: Record<Side, number> = {
    plaintiff: startAt.plaintiff ?? 1,
    defendant: startAt.defendant ?? 1,
    joint: startAt.joint ?? 1,
  };
  return rows.map((r) => ({ ...r, number: scheme.format(r.side, next[r.side]++) }));
}

/** Highest number already used per side, so a new batch continues the sequence. */
export function nextNumbers(existing: { side: string; number: string }[]): Record<Side, number> {
  const out: Record<Side, number> = { plaintiff: 1, defendant: 1, joint: 1 };
  for (const e of existing) {
    const side = (["plaintiff", "defendant", "joint"] as Side[]).includes(e.side as Side) ? (e.side as Side) : "plaintiff";
    const n = Number(String(e.number).match(/(\d+)\s*$/)?.[1]);
    if (Number.isFinite(n) && n >= out[side]) out[side] = n + 1;
  }
  return out;
}
