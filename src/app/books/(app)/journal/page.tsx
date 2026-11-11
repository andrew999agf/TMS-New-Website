import { requireBooks } from "@/lib/books/auth";
import { canWrite, listAccounts, listEntries } from "@/lib/books/ledger";
import { isIsoDate, todayIso } from "@/lib/books/money";
import { EntryList, JournalForm } from "@/components/books/Journal";

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireBooks();
  const sp = await searchParams;
  const today = todayIso();
  const from = isIsoDate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const to = isIsoDate(sp.to) ? sp.to : today;
  const [accounts, entries] = await Promise.all([listAccounts(session.companyId), listEntries(session.companyId, { from, to, limit: 300 })]);
  const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm";
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Journal</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Every entry in the books, from every screen. Entries are never edited or deleted: a wrong one is voided with a reason and stays on the record.</p>
      {canWrite(session.role) && <JournalForm accounts={accounts.map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, isTrust: a.isTrust, active: a.active }))} today={today} />}
      <form className="mt-6 flex flex-wrap items-end gap-2 text-xs" method="get">
        <label>From<input type="date" name="from" defaultValue={from} className={`${input} mt-1 block`} /></label>
        <label>To<input type="date" name="to" defaultValue={to} className={`${input} mt-1 block`} /></label>
        <button className="rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:border-[var(--c-accent)]">Show</button>
        <span className="pb-2 text-[var(--c-ink-muted)]">{entries.length} entr{entries.length === 1 ? "y" : "ies"}{entries.length === 300 ? " (the newest 300)" : ""}</span>
      </form>
      <EntryList entries={entries.map((e) => ({ id: e.id, date: e.date, memo: e.memo, source: e.source, kind: e.kind, status: e.status, createdBy: e.createdBy, voidReason: e.voidReason, lines: e.lines }))} canEdit={canWrite(session.role)} />
    </div>
  );
}
