/**
 * Pure parsing + matching logic for Voice Time Entry 4.0. Kept free of React so
 * it can be unit-tested directly. The component (VoiceTimeEntry4) is the only
 * caller; nothing here touches the DOM, speech APIs, or CSV.
 *
 * The two hardest jobs live here: turning one spoken sentence into structured
 * fields in any order (extractCore), and matching a spoken client name to the
 * right Clio matter while ignoring the matter number and tolerating misspellings
 * (rankMatters).
 */

export type Matter = { displayNumber: string; description: string };
export type CoreSlots = {
  rawClient?: string;
  hours?: number;
  category?: string;
  date?: string; // YYYY-MM-DD
  nonBillable?: boolean;
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------------------------------------------------- transcript normalizing */
const FILLERS = /\b(?:um+|uh+|er+|like|you know|i mean|kind of|sort of|basically)\b/gi;
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};
const WORD_FIXES: [RegExp, string][] = [
  [/\b(?:vore?|war|where|voir)\s+(?:deer|dear|dire)\b/gi, "voir dire"],
  [/\bsub\s?peen[ao]\b/gi, "subpoena"],
  [/\bday\s?position\b/gi, "deposition"],
];
function applyWordFixes(s: string): string {
  let out = s;
  for (const [re, to] of WORD_FIXES) out = out.replace(re, to);
  return out;
}
/** Normalize a transcript for PARSING (never used on the verbatim note). */
export function normalize(s: string): string {
  return applyWordFixes(s)
    .toLowerCase()
    .replace(FILLERS, " ")
    .replace(/[^\w\s.,/$'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------- time parsing */
export function parseHours(input: string): number | undefined {
  const t = normalize(input);
  const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const digit = (w: string): number | null => {
    if (w in NUMBER_WORDS) return parseInt(NUMBER_WORDS[w]);
    if (/^\d$/.test(w)) return parseInt(w);
    return null;
  };
  const round1 = (n: number) => Math.round(n * 10) / 10;
  let m: RegExpMatchArray | null;

  if (/\bthree\s+quarters?\s+(?:of\s+)?(?:an?\s+)?hour\b/.test(t)) return 0.75;
  if (/\b(?:an?|one)\s+hour\s+and\s+(?:a\s+)?half\b/.test(t)) return 1.5;
  if ((m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine)\b\s*and\s+(?:a\s+)?half/))) return (W[m[1]] ?? parseInt(m[1])) + 0.5;
  if (/\bhour\s+and\s+(?:a\s+)?half\b/.test(t)) return 1.5;

  if ((m = t.match(/\b(\d+)\s*\/\s*10\b/))) return round1(parseInt(m[1]) / 10);
  if ((m = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+tenths?\b/))) return round1((W[m[1]] ?? parseInt(m[1])) / 10);
  if (/\btenth\b/.test(t)) return 0.1;

  if ((m = t.match(/\bpoint\s+(\w+)(?:\s+(\w+))?/))) {
    const d1 = digit(m[1]);
    if (d1 != null) {
      const d2 = m[2] ? digit(m[2]) : null;
      return d2 != null ? Math.round(d1 * 10 + d2) / 100 : round1(d1 / 10);
    }
  }

  if ((m = t.match(/(\d*\.\d+)/))) return parseFloat(m[1]);
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/))) return parseFloat(m[1]);
  if ((m = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s*hours?\b/))) return W[m[1]];

  // minutes → decimal hours, kept exact to 2 places ("45 minutes" = 0.75); the
  // save step is what snaps the final quantity to the firm's 0.1 grid.
  if ((m = t.match(/(\d+)\s*(?:minutes?|mins?)\b/))) return Math.round((parseInt(m[1]) / 60) * 100) / 100;
  if (/\b(?:forty[\s-]?five)\s+minutes?\b/.test(t)) return 0.75;
  if (/\b(?:thirty)\s+minutes?\b/.test(t)) return 0.5;
  if (/\b(?:fifteen)\s+minutes?\b/.test(t)) return 0.25;
  if (/\b(?:ninety)\s+minutes?\b/.test(t)) return 1.5;

  if (/\b(?:a\s+)?quarter\s+(?:of\s+an\s+)?hour\b/.test(t) || /\bquarter\b/.test(t)) return 0.25;
  if (/\b(?:a\s+)?half\s+(?:an?\s+)?hour\b/.test(t) || /\bhalf\b/.test(t)) return 0.5;
  if (/\b(?:an|one)\s+hour\b/.test(t)) return 1;

  if ((m = t.match(/^\s*(\d*\.?\d+)\s*$/))) return parseFloat(m[1]);
  return undefined;
}

/* ---------------------------------------------------------- billable parsing */
/** Returns the value of `nonBillable` (true = non-billable), or undefined. */
export function parseBillable(input: string): boolean | undefined {
  const t = normalize(input);
  if (/\bnon[\s-]?billable\b|\bno charge\b|\bdon'?t bill\b|\bnot billable\b|\bno cost\b/.test(t)) return true;
  if (/\bbillable\b|\bbill it\b|\bdo bill\b/.test(t)) return false;
  return undefined;
}

/* ------------------------------------------------------------- date parsing */
export function parseDate(input: string): string | undefined {
  const t = normalize(input);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const notFuture = (d: Date) => { if (d.getTime() > Date.now() + 86400000) d.setFullYear(d.getFullYear() - 1); return d; };

  if (/\b(today|this morning|this afternoon|this evening|tonight|now)\b/.test(t)) return fmt(new Date());
  if (/\byesterday\b/.test(t)) { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d); }
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(\d+)\s+days?\s+ago\b/))) { const d = new Date(); d.setDate(d.getDate() - parseInt(m[1])); return fmt(d); }

  const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  for (const name in days) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const d = new Date();
      let diff = (d.getDay() - days[name] + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() - diff);
      return fmt(d);
    }
  }

  const mo: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const monRe = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  if ((m = t.match(new RegExp(`\\b(${monRe})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`)))) {
    const month = mo[m[1].slice(0, 3)]; const day = parseInt(m[2]); const yr = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    if (month != null) return fmt(notFuture(new Date(yr, month, day)));
  }
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${monRe})`)))) {
    const day = parseInt(m[1]); const month = mo[m[2].slice(0, 3)];
    if (month != null) return fmt(notFuture(new Date(new Date().getFullYear(), month, day)));
  }
  if ((m = t.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const day = parseInt(m[1]); const now = new Date();
    return fmt(notFuture(new Date(now.getFullYear(), now.getMonth(), day)));
  }
  if ((m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/))) {
    const month = parseInt(m[1]) - 1; const day = parseInt(m[2]); let yr = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    if (yr < 100) yr += 2000;
    return fmt(notFuture(new Date(yr, month, day)));
  }
  return undefined;
}
/** "Thursday, June 5, 2025" from an ISO date, parsed in local time. */
export function fullDate(iso?: string): string {
  if (!iso) return "no date";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/* ----------------------------------------------------------- yes / no words */
export const isYes = (s: string) => /\b(yes|yeah|yep|yup|good|ok|okay|correct|right|sure|perfect|confirm|that'?s right|looks good|save|done)\b/i.test(s);
export const isNo = (s: string) => /\b(no|nope|nah|negative|wrong|not it|incorrect)\b/i.test(s);
export const isDiscard = (s: string) => /\b(cancel|discard|never mind|nevermind|start over|throw (?:it|this) (?:out|away)|delete (?:it|this))\b/i.test(s);

/* ------------------------------------------------- category matching */
const NAT: [RegExp, string][] = [
  [/\b(telephone|phone)\s+call\b|\bcall(?:ed)?\s+(?:with|to)\b/, "TELEPHONE CALL"],
  [/\be-?mail(?:ed)?\b/, "EMAIL"],
  [/\bresearch(?:ed|ing)?\b/, "RESEARCH"],
  [/\bdeposition\b/, "DEPOSITION"],
  [/\bdraft(?:ed|ing)?\b/, "DOCUMENT PREPARATION"],
  [/\breview(?:ed|ing)?\b/, "DOCUMENT REVIEW"],
  [/\bcourt\b|\bhearing\b/, "IN COURT"],
  [/\btravel(?:ed|ing|led|ling)?\b/, "TRAVEL TIME"],
  [/\bmediation\b/, "MEDIATION"],
  [/\bzoom\b|\bvideo\s+conf/, "ZOOM CONFERENCE"],
];
export function matchCategory(input: string, categories: string[]): string | undefined {
  const t = normalize(input);
  let best: string | null = null, len = 0;
  for (const c of categories) { const cl = c.toLowerCase(); if (t.includes(cl) && cl.length > len) { best = c; len = cl.length; } }
  if (best) return best;
  for (const [re, name] of NAT) if (re.test(t) && categories.includes(name)) return name;
  for (const c of categories) { const w = c.toLowerCase().split(/[\s(]/)[0]; if (w.length > 3 && t.includes(w)) return c; }
  return undefined;
}

/* ----------------------------------------------- matter (case) name matching */
const STOP = new Set(["the", "and", "for", "with", "matter", "client", "case", "file", "our", "a", "an", "of", "on", "re", "regarding", "about", "mr", "mrs", "ms", "dr"]);

/** "0042 - Nelson, John" → "Nelson, John" (the number is ignored for matching). */
export function matterName(displayNumber: string): string {
  const idx = displayNumber.indexOf(" - ");
  return idx >= 0 ? displayNumber.slice(idx + 3) : displayNumber.replace(/^\s*\d+\s*[-–]?\s*/, "");
}
export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9\s,]/g, " ").split(/[\s,]+/).filter((w) => w && !STOP.has(w));
}
export function lastNameOf(displayNumber: string): string {
  const name = matterName(displayNumber);
  if (name.includes(",")) return name.split(",")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Normalized similarity 0..1 between two tokens, tolerant of misspellings. */
export function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 0.9;
  const d = lev(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

export type Ranked = Matter & { score: number; matched: number; total: number };

/** Rank every matter against a spoken client name. The number is ignored; we
 *  blend token-set coverage, per-token fuzzy similarity, and a last-name bonus
 *  into one score, then sort. Top of the list is the best guess. */
export function rankMatters(spoken: string, matters: Matter[]): Ranked[] {
  const qTokens = nameTokens(spoken);
  if (!qTokens.length) return [];
  const ranked: Ranked[] = matters.map((m) => {
    const nTokens = nameTokens(matterName(m.displayNumber));
    const last = lastNameOf(m.displayNumber);
    let matched = 0, simSum = 0, lastBonus = 0;
    for (const q of qTokens) {
      let bestSim = 0, bestTok = "";
      for (const n of nTokens) { const sc = tokenSim(q, n); if (sc > bestSim) { bestSim = sc; bestTok = n; } }
      simSum += bestSim;
      if (bestSim >= 0.8) { matched++; if (bestTok === last) lastBonus += 0.6; }
    }
    const coverage = matched / qTokens.length;
    const score = coverage * 2 + simSum / qTokens.length + lastBonus;
    return { ...m, score, matched, total: qTokens.length };
  });
  return ranked
    .filter((r) => r.score >= 0.6 && r.matched > 0)
    .sort((a, b) => b.score - a.score || a.displayNumber.localeCompare(b.displayNumber));
}

export type Resolution =
  | { kind: "auto"; displayNumber: string }
  | { kind: "pick"; candidates: Matter[] }
  | { kind: "none" };

/** Decide how to resolve a spoken name: a single high-confidence hit auto-selects
 *  silently; otherwise the top 5 are offered; an empty result asks again (§6). */
export function resolveMatter(spoken: string, matters: Matter[]): Resolution {
  const ranked = rankMatters(spoken, matters);
  if (ranked.length === 0) return { kind: "none" };
  const full = ranked.filter((r) => r.matched === r.total);
  if (full.length === 1) return { kind: "auto", displayNumber: full[0].displayNumber };
  if (ranked.length === 1 && ranked[0].score >= 1.6) return { kind: "auto", displayNumber: ranked[0].displayNumber };
  if (ranked[0].score >= 2.6 && (ranked.length === 1 || ranked[0].score - ranked[1].score >= 0.8)) {
    return { kind: "auto", displayNumber: ranked[0].displayNumber };
  }
  return { kind: "pick", candidates: ranked.slice(0, 5).map((r) => ({ displayNumber: r.displayNumber, description: r.description })) };
}

/** Pull category, time, billable, and date out of one utterance (any order),
 *  removing each as it's found so the residual is a clean client name (§4). */
export function extractCore(text: string, categories: string[]): CoreSlots {
  const s: CoreSlots = {};
  let work = " " + text + " ";

  const cat = matchCategory(text, categories);
  if (cat) s.category = cat;

  const h = parseHours(text);
  if (h != null) {
    s.hours = h;
    work = work
      .replace(/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\b/gi, " ")
      .replace(/\bpoint\s+\w+(?:\s+\w+)?\b/gi, " ")
      .replace(/\b(?:half|quarter)\s+(?:an?\s+)?hour\b/gi, " ")
      .replace(/\b(?:an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+hours?\b/gi, " ")
      .replace(/\b(?:half|quarter)\b/gi, " ")
      .replace(/\bthree\s+quarters?\b/gi, " ")
      .replace(/\b(?:forty[\s-]?five|thirty|fifteen|ninety)\s+minutes?\b/gi, " ");
  }

  const nb = parseBillable(text);
  if (nb != null) {
    s.nonBillable = nb;
    work = work.replace(/\bnon[\s-]?billable\b|\bno charge\b|\bnot billable\b|\bbillable\b|\bbill it\b/gi, " ");
  }

  const d = parseDate(text);
  if (d) {
    s.date = d;
    work = work
      .replace(/\b(today|yesterday|tonight|this (?:morning|afternoon|evening))\b/gi, " ")
      .replace(/\b\d+\s+days?\s+ago\b/gi, " ")
      .replace(/\b(last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
      .replace(/\bthe\s+\d{1,2}(?:st|nd|rd|th)\b/gi, " ")
      .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, " ")
      .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi, " ");
  }

  if (cat) {
    for (const w of cat.toLowerCase().split(/[\s(),]+/).filter((x) => x.length > 2)) {
      work = work.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
    }
    work = work.replace(/\b(phone\s+call|telephone\s+call|call|emailed?|e-?mailed?|researched?|drafted?|reviewed?|met with|meeting)\b/gi, " ");
  }
  work = work
    .replace(/\b(about|regarding|re|with|the|for|on|a|an|of)\b/gi, " ")
    .replace(/[^a-z0-9'\s-]/gi, " ") // drop stray punctuation (leftover commas etc.)
    .replace(/\s+/g, " ")
    .trim();

  if (work) s.rawClient = work;
  return s;
}

export { todayISO };
