/** Money helpers, safe to use in the browser. Amounts are whole cents. */

/** "1,234.50", "$1234.5", "(45.00)", "-45" → cents. Returns null when it isn't a number. */
export function toCents(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = String(input ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); } else if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); } else if (/^\+/.test(s)) s = s.slice(1);
  if (!/^\d*(\.\d{0,4})?$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole || "0") * 100 + Math.round(Number(`0.${frac || "0"}`) * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

/** 123456 → "1,234.56"; negatives as (1,234.56) when `paren`, else -1,234.56. */
export function fmtCents(cents: number, opts: { paren?: boolean; blankZero?: boolean; dollar?: boolean } = {}): string {
  const n = Math.round(Number(cents) || 0);
  if (n === 0 && opts.blankZero) return "";
  const abs = Math.abs(n);
  const body = `${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  const withSign = n < 0 ? (opts.paren ? `(${body})` : `-${body}`) : body;
  return opts.dollar ? (n < 0 && !opts.paren ? `-$${body}` : `$${withSign}`.replace("$(", "($")) : withSign;
}

/** A real calendar date in YYYY-MM-DD, within a sane range. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 1990 && d.getUTCFullYear() <= 2100;
}

/** Today's date on a Central-time calendar (the firm's), as YYYY-MM-DD. */
export function todayIso(tz = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const TYPE_LABEL: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };
/** Which side an account's balance normally sits on. */
export const isDebitNormal = (type: string) => type === "asset" || type === "expense";
