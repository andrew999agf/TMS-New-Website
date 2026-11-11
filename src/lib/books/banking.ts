import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts, sbBankRules, sbBankTxns, sbEntries, sbImports, sbLines } from "@/db/schema";
import { LedgerError, postEntry, voidEntry, type Account } from "./ledger";
import type { BankCsvRow } from "./bank-csv";

/**
 * Banking: statement rows come in from a file, and each one is either
 * categorized (which writes the ledger entry), matched to an entry that is
 * already in the ledger (a payroll, a fee transfer from trust, a card
 * payment), or set aside. Nothing here talks to a bank or moves money.
 */
export const BANK_SUBTYPES = ["bank", "credit_card"];

export async function bankAccounts(companyId: number): Promise<Account[]> {
  if (!db) return [];
  return db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, companyId), inArray(sbAccounts.subtype, BANK_SUBTYPES), eq(sbAccounts.isTrust, false), eq(sbAccounts.active, true))).orderBy(sbAccounts.number);
}

const normDesc = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Add statement rows. A row already on file (same date, amount, description and position among its twins) is skipped, so overlapping files are safe. */
export async function importRows(companyId: number, account: Account, filename: string, rows: BankCsvRow[], by: string): Promise<{ added: number; duplicates: number }> {
  if (!db) throw new LedgerError("Database not configured.");
  const seen = new Map<string, number>();
  const values = rows.map((r) => {
    const key = `${r.date}|${r.amount}|${normDesc(r.description)}|${r.ref}`;
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    return { companyId, accountId: account.id, txnDate: r.date, amount: r.amount, description: r.description, ref: r.ref, fingerprint: createHash("sha256").update(`${key}|${n}`).digest("hex") };
  });
  return db.transaction(async (tx) => {
    const [imp] = await tx.insert(sbImports).values({ companyId, accountId: account.id, filename: filename.slice(0, 255), rowCount: rows.length, createdBy: by }).returning({ id: sbImports.id });
    let added = 0;
    for (let i = 0; i < values.length; i += 500) {
      const got = await tx.insert(sbBankTxns).values(values.slice(i, i + 500).map((v) => ({ ...v, importId: imp.id }))).onConflictDoNothing().returning({ id: sbBankTxns.id });
      added += got.length;
    }
    await tx.update(sbImports).set({ added, duplicates: rows.length - added }).where(eq(sbImports.id, imp.id));
    return { added, duplicates: rows.length - added };
  });
}

export type TxnRow = { id: number; date: string; amount: number; description: string; ref: string; status: string; entryId: number | null; suggestId: number | null; suggestFrom?: "rule" | "history"; matches: { lineId: number; entryId: number; date: string; memo: string }[]; category: string };

/** Statement rows for one account. "new" rows carry a suggested category (the one last used for the same description) and any ledger lines they could be matched to. */
export async function listTxns(companyId: number, accountId: number, status: "new" | "posted" | "excluded", limit = 400): Promise<TxnRow[]> {
  if (!db) return [];
  const rows = await db.execute(sql`
    select t.id, t.txn_date::text as date, t.amount::text as amount, t.description, t.ref, t.status, t.entry_id as "entryId",
      (select l2.account_id from sb_bank_txns p join sb_lines l2 on l2.entry_id = p.entry_id and l2.id <> p.line_id
        where p.company_id = t.company_id and p.account_id = t.account_id and p.status = 'posted' and p.id <> t.id and lower(p.description) = lower(t.description) and sign(p.amount) = sign(t.amount)
        order by p.txn_date desc, p.id desc limit 1) as "suggestId",
      coalesce((select string_agg(a.number || ' ' || a.name, ', ') from sb_lines l3 join sb_accounts a on a.id = l3.account_id where l3.entry_id = t.entry_id and l3.id <> t.line_id), '') as category
    from sb_bank_txns t where t.company_id = ${companyId} and t.account_id = ${accountId} and t.status = ${status}
    order by t.txn_date ${status === "new" ? sql`asc` : sql`desc`}, t.id limit ${limit}`) as unknown as (Omit<TxnRow, "amount" | "matches"> & { amount: string })[];
  const out: TxnRow[] = rows.map((r) => ({ ...r, id: Number(r.id), amount: Number(r.amount), entryId: r.entryId == null ? null : Number(r.entryId), suggestId: r.suggestId == null ? null : Number(r.suggestId), matches: [] }));
  if (status === "new" && out.length) {
    // A remembered rule beats history: the longest matching text wins.
    const rules = (await listRules(companyId)).slice().sort((a, b) => b.pattern.length - a.pattern.length);
    for (const t of out) {
      const d = t.description.toLowerCase(), dir = t.amount > 0 ? 1 : -1;
      const r = rules.find((x) => x.direction === dir && d.includes(x.pattern.toLowerCase()));
      if (r) { t.suggestId = r.accountId; t.suggestFrom = "rule"; } else if (t.suggestId) t.suggestFrom = "history";
    }
    // Ledger lines on this account that no statement row is tied to yet.
    const open = await db.execute(sql`
      select l.id as "lineId", e.id as "entryId", e.entry_date::text as date, e.memo, (l.debit - l.credit)::text as net
      from sb_lines l join sb_entries e on e.id = l.entry_id
      where l.company_id = ${companyId} and l.account_id = ${accountId} and e.status = 'posted'
        and not exists (select 1 from sb_bank_txns b where b.line_id = l.id)`) as unknown as { lineId: number; entryId: number; date: string; memo: string; net: string }[];
    for (const t of out) {
      const day = Date.parse(t.date);
      t.matches = open.filter((o) => Number(o.net) === t.amount && Math.abs(Date.parse(o.date) - day) <= 21 * 86_400_000).map((o) => ({ lineId: Number(o.lineId), entryId: Number(o.entryId), date: o.date, memo: o.memo })).slice(0, 5);
    }
  }
  return out;
}

export async function txnCounts(companyId: number): Promise<Map<number, { new: number; posted: number; excluded: number }>> {
  const m = new Map<number, { new: number; posted: number; excluded: number }>();
  if (!db) return m;
  const rows = await db.execute(sql`select account_id as a, status as s, count(*)::int as n from sb_bank_txns where company_id = ${companyId} group by 1, 2`) as unknown as { a: number; s: "new" | "posted" | "excluded"; n: number }[];
  for (const r of rows) { const c = m.get(Number(r.a)) ?? { new: 0, posted: 0, excluded: 0 }; c[r.s] = Number(r.n); m.set(Number(r.a), c); }
  return m;
}

export type BankRule = { id: number; pattern: string; direction: number; accountId: number };

export async function listRules(companyId: number): Promise<BankRule[]> {
  if (!db) return [];
  const rows = await db.select().from(sbBankRules).where(eq(sbBankRules.companyId, companyId)).orderBy(sbBankRules.pattern);
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, direction: r.direction, accountId: r.accountId }));
}

/** Remember: rows going this direction whose description contains `pattern` belong in `accountId`. */
export async function saveRule(companyId: number, patternIn: string, direction: number, accountId: number, by: string): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const pattern = patternIn.replace(/\s+/g, " ").trim().slice(0, 191);
  if (pattern.length < 3) throw new LedgerError("The text to remember needs at least three characters.");
  const [a] = await db.select().from(sbAccounts).where(and(eq(sbAccounts.companyId, companyId), eq(sbAccounts.id, accountId))).limit(1);
  if (!a || a.isTrust || !a.active) throw new LedgerError("Choose an active account that isn't a trust account.");
  const dir = direction > 0 ? 1 : -1;
  await db.insert(sbBankRules).values({ companyId, pattern, direction: dir, accountId, createdBy: by }).onConflictDoUpdate({ target: [sbBankRules.companyId, sbBankRules.pattern, sbBankRules.direction], set: { accountId, createdBy: by } });
}

export async function deleteRule(companyId: number, id: number): Promise<void> {
  if (!db) return;
  await db.delete(sbBankRules).where(and(eq(sbBankRules.companyId, companyId), eq(sbBankRules.id, id)));
}

/** Post several rows to one account. Rows that fail (already handled, closed period) are counted, not fatal. */
export async function categorizeMany(companyId: number, txnIds: number[], categoryId: number, by: string): Promise<{ posted: number; skipped: number; firstError: string }> {
  let posted = 0, skipped = 0, firstError = "";
  for (const id of [...new Set(txnIds.map(Number))].slice(0, 500)) {
    try { posted += (await categorize(companyId, id, { categoryId }, by)).posted; }
    catch (e) { if (!(e instanceof LedgerError)) throw e; skipped++; firstError ||= e.message; }
  }
  return { posted, skipped, firstError };
}

/** Post every waiting row in an account that has a suggested account (a remembered rule, or the last account used for the same description). */
export async function postSuggested(companyId: number, accountId: number, by: string): Promise<{ posted: number; skipped: number; firstError: string }> {
  const rows = (await listTxns(companyId, accountId, "new", 2000)).filter((r) => r.suggestId);
  const advances = db ? await db.select({ id: sbAccounts.id }).from(sbAccounts).where(and(eq(sbAccounts.companyId, companyId), eq(sbAccounts.systemKey, "client_advances"))) : [];
  const needsClient = new Set(advances.map((a) => a.id));
  let posted = 0, skipped = 0, firstError = "";
  for (const r of rows.slice(0, 500)) {
    if (needsClient.has(r.suggestId!)) { skipped++; firstError ||= "Rows for client cost advances need a client, so they are posted one at a time."; continue; }
    try { posted += (await categorize(companyId, r.id, { categoryId: r.suggestId! }, by)).posted; }
    catch (e) { if (!(e instanceof LedgerError)) throw e; skipped++; firstError ||= e.message; }
  }
  return { posted, skipped, firstError };
}

/** Statement rows that are imported but not in the books yet — the reason a report can look empty after an upload. */
export async function waitingSummary(companyId: number, range?: { from: string; to: string }): Promise<{ rows: number; moneyIn: number; moneyOut: number; inRange: number; first: string; last: string }> {
  if (!db) return { rows: 0, moneyIn: 0, moneyOut: 0, inRange: 0, first: "", last: "" };
  const [r] = await db.execute(sql`
    select count(*)::int as rows, coalesce(sum(case when amount > 0 then amount else 0 end), 0)::text as "moneyIn", coalesce(sum(case when amount < 0 then -amount else 0 end), 0)::text as "moneyOut",
      ${range ? sql`count(*) filter (where txn_date >= ${range.from} and txn_date <= ${range.to})::int` : sql`count(*)::int`} as "inRange",
      coalesce(min(txn_date)::text, '') as first, coalesce(max(txn_date)::text, '') as last
    from sb_bank_txns where company_id = ${companyId} and status = 'new'`) as unknown as { rows: number; moneyIn: string; moneyOut: string; inRange: number; first: string; last: string }[];
  return { rows: Number(r?.rows ?? 0), moneyIn: Number(r?.moneyIn ?? 0), moneyOut: Number(r?.moneyOut ?? 0), inRange: Number(r?.inRange ?? 0), first: r?.first ?? "", last: r?.last ?? "" };
}

/**
 * Categorize statement rows: writes one entry each. Money out credits the
 * bank (or card) and debits the category; money in is the reverse. With
 * `applyToSame`, every other unreviewed row in the account with the same
 * description and direction gets the same treatment.
 */
export async function categorize(companyId: number, txnId: number, input: { categoryId: number; memo?: string; clientId?: number | null; applyToSame?: boolean; remember?: string }, by: string): Promise<{ posted: number }> {
  if (!db) throw new LedgerError("Database not configured.");
  const [first] = await db.select().from(sbBankTxns).where(and(eq(sbBankTxns.companyId, companyId), eq(sbBankTxns.id, txnId))).limit(1);
  if (!first) throw new LedgerError("That row no longer exists.");
  if (first.status !== "new") throw new LedgerError("That row has already been handled.");
  if (input.categoryId === first.accountId) throw new LedgerError("Pick the account this money went to or came from, not the bank account itself.");
  const targets = [first];
  if (input.applyToSame) {
    const same = await db.select().from(sbBankTxns).where(and(eq(sbBankTxns.companyId, companyId), eq(sbBankTxns.accountId, first.accountId), eq(sbBankTxns.status, "new"), sql`lower(${sbBankTxns.description}) = lower(${first.description})`, sql`sign(${sbBankTxns.amount}) = sign(${first.amount}::bigint)`));
    for (const s of same) if (s.id !== first.id) targets.push(s);
  }
  let posted = 0;
  for (const t of targets) {
    await db.transaction(async (tx) => {
      const abs = Math.abs(t.amount);
      const bankLine = { accountId: t.accountId, ...(t.amount > 0 ? { debit: abs } : { credit: abs }), ref: t.ref, memo: "" };
      const catLine = { accountId: input.categoryId, ...(t.amount > 0 ? { credit: abs } : { debit: abs }), clientId: input.clientId ?? null, memo: (input.memo ?? "").trim() };
      const e = await postEntry(companyId, { date: t.txnDate, memo: t.description || (input.memo ?? "").trim() || "Bank transaction", source: "bank", sourceRef: `bank:${t.id}`, lines: [bankLine, catLine] }, by, tx);
      await tx.update(sbBankTxns).set({ status: "posted", entryId: e.id, lineId: e.lineIds[0] }).where(eq(sbBankTxns.id, t.id));
    });
    posted++;
  }
  if (input.remember?.trim()) await saveRule(companyId, input.remember, first.amount > 0 ? 1 : -1, input.categoryId, by);
  return { posted };
}

/** Tie a statement row to a line that is already in the ledger. */
export async function matchTxn(companyId: number, txnId: number, lineId: number): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(sbBankTxns).where(and(eq(sbBankTxns.companyId, companyId), eq(sbBankTxns.id, txnId))).limit(1);
    if (!t || t.status !== "new") throw new LedgerError("That row has already been handled.");
    const [l] = await tx.select({ id: sbLines.id, entryId: sbLines.entryId, accountId: sbLines.accountId, debit: sbLines.debit, credit: sbLines.credit, status: sbEntries.status })
      .from(sbLines).innerJoin(sbEntries, eq(sbEntries.id, sbLines.entryId)).where(and(eq(sbLines.companyId, companyId), eq(sbLines.id, lineId))).limit(1);
    if (!l || l.status !== "posted" || l.accountId !== t.accountId || l.debit - l.credit !== t.amount) throw new LedgerError("That entry doesn't match this row's account and amount.");
    const [taken] = await tx.select({ id: sbBankTxns.id }).from(sbBankTxns).where(eq(sbBankTxns.lineId, lineId)).limit(1);
    if (taken) throw new LedgerError("That entry is already matched to another row.");
    await tx.update(sbBankTxns).set({ status: "posted", entryId: l.entryId, lineId: l.id }).where(eq(sbBankTxns.id, t.id));
  });
}

export async function setExcluded(companyId: number, txnId: number, excluded: boolean): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const [t] = await db.select().from(sbBankTxns).where(and(eq(sbBankTxns.companyId, companyId), eq(sbBankTxns.id, txnId))).limit(1);
  if (!t) throw new LedgerError("That row no longer exists.");
  if (excluded ? t.status !== "new" : t.status !== "excluded") throw new LedgerError("That row has already been handled.");
  await db.update(sbBankTxns).set({ status: excluded ? "excluded" : "new" }).where(eq(sbBankTxns.id, t.id));
}

/** Put a handled row back to "to review". If categorizing it wrote the entry, that entry is voided; if it was matched (or is a trust row), it is only untied — a trust entry is voided from the client's own ledger. */
export async function undoTxn(companyId: number, txnId: number, by: string): Promise<void> {
  if (!db) throw new LedgerError("Database not configured.");
  const [t] = await db.select().from(sbBankTxns).where(and(eq(sbBankTxns.companyId, companyId), eq(sbBankTxns.id, txnId))).limit(1);
  if (!t || t.status !== "posted" || !t.entryId) throw new LedgerError("That row isn't posted.");
  const [e] = await db.select().from(sbEntries).where(eq(sbEntries.id, t.entryId)).limit(1);
  if (e && e.source === "bank" && e.sourceRef === `bank:${t.id}`) { await voidEntry(companyId, e.id, "Statement row sent back to review", by); return; }
  if (t.lineId) {
    const [l] = await db.select({ reconcileId: sbLines.reconcileId }).from(sbLines).where(eq(sbLines.id, t.lineId)).limit(1);
    if (l?.reconcileId) throw new LedgerError("This row is part of a reconciliation. Reopen that reconciliation first.");
  }
  await db.update(sbBankTxns).set({ status: "new", entryId: null, lineId: null }).where(eq(sbBankTxns.id, t.id));
}
