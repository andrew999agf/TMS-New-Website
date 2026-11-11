import { toCents } from "./money";

/**
 * Read a bank or card statement file (CSV) into dated, signed amounts.
 * Pure text in, rows out — no network, no bank login. Works out the columns
 * from the header row: a date, a description, and either one signed amount
 * column or separate money-out / money-in columns.
 */
export type BankCsvRow = { date: string; amount: number; description: string; ref: string };
export type BankCsvResult = { ok: true; rows: BankCsvRow[]; skipped: number; columns: { date: string; description: string; amount: string } } | { ok: false; error: string };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  const delim = (s.split(/\r?\n/, 1)[0].match(/\t/g)?.length ?? 0) > (s.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? "\t" : s.split(/\r?\n/, 1)[0].includes(";") && !s.split(/\r?\n/, 1)[0].includes(",") ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** 3/7/2026, 03-07-26, 2026-03-07, "Mar 7, 2026" → 2026-03-07 (US month-first). */
export function parseUsDate(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  let y = 0, mo = 0, d = 0;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; }
  else { const t = Date.parse(s); if (Number.isNaN(t) || !/[a-z]{3}/i.test(s)) return null; const dt = new Date(t); y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate(); }
  if (!(y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
const find = (heads: string[], tests: RegExp[], not?: RegExp) => { for (const t of tests) { const i = heads.findIndex((h) => t.test(h) && !(not && not.test(h))); if (i >= 0) return i; } return -1; };

/** `flip`: the file shows money OUT as positive (common for credit-card exports). */
export function readBankCsv(text: string, opts: { flip?: boolean } = {}): BankCsvResult {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "That file has no rows. Export the statement as CSV from the bank's website and choose that file." };
  let hi = -1, heads: string[] = [];
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const h = table[i].map(norm);
    if (h.some((x) => /\bdate\b/.test(x)) && h.some((x) => /amount|debit|credit|withdrawal|deposit/.test(x))) { hi = i; heads = h; break; }
  }
  if (hi < 0) return { ok: false, error: `Couldn't find the column headings. The file needs a Date column and an Amount column (or Debit and Credit columns). The first line was: ${table[0].slice(0, 8).join(" | ").slice(0, 200)}` };
  const iDate = find(heads, [/^(posting|posted|post) date$/, /^transaction date$/, /^trans date$/, /^date$/, /\bdate\b/]);
  const iDesc = find(heads, [/^description$/, /^original description$/, /^payee$/, /^name$/, /^memo$/, /description|payee|merchant|details|memo|name/], /date|type|category/);
  const iAmt = find(heads, [/^amount$/, /^transaction amount$/, /\bamount\b/], /balance|debit|credit/);
  const iOut = find(heads, [/^debit$/, /^withdrawals?$/, /^amount debit$/, /debit|withdrawal|money out|paid out/], /card|type/);
  const iIn = find(heads, [/^credit$/, /^deposits?$/, /^amount credit$/, /credit|deposit|money in|paid in/], /card|type/);
  const iRef = find(heads, [/check (or slip )?#|check number|check no|^check$|cheque/, /^reference( number)?$|^ref$/]);
  if (iDate < 0) return { ok: false, error: "Couldn't find a Date column." };
  if (iAmt < 0 && iOut < 0 && iIn < 0) return { ok: false, error: "Couldn't find an Amount column, or Debit and Credit columns." };
  const rows: BankCsvRow[] = [];
  let skipped = 0;
  for (const r of table.slice(hi + 1)) {
    const date = parseUsDate(r[iDate] ?? "");
    let amount: number | null = null;
    if (iAmt >= 0 && (r[iAmt] ?? "").trim() !== "") amount = toCents(r[iAmt]);
    else if (iOut >= 0 || iIn >= 0) {
      const out = iOut >= 0 && (r[iOut] ?? "").trim() ? toCents(r[iOut]) : 0, inn = iIn >= 0 && (r[iIn] ?? "").trim() ? toCents(r[iIn]) : 0;
      if (out !== null && inn !== null && (out !== 0 || inn !== 0)) amount = Math.abs(inn) - Math.abs(out);
    }
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    if (opts.flip) amount = -amount;
    const description = (iDesc >= 0 ? r[iDesc] ?? "" : "").replace(/\s+/g, " ").trim().slice(0, 500);
    rows.push({ date, amount, description, ref: (iRef >= 0 ? r[iRef] ?? "" : "").trim().replace(/^0+$/, "").slice(0, 64) });
  }
  if (rows.length === 0) return { ok: false, error: "No transactions could be read from that file. Check that it is the CSV export of the account activity." };
  return { ok: true, rows, skipped, columns: { date: table[hi][iDate], description: iDesc >= 0 ? table[hi][iDesc] : "(none)", amount: iAmt >= 0 ? table[hi][iAmt] : [iOut >= 0 ? table[hi][iOut] : "", iIn >= 0 ? table[hi][iIn] : ""].filter(Boolean).join(" / ") } };
}
