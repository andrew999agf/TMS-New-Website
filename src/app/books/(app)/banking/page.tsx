import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbClients } from "@/db/schema";
import { requireBooks, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { canWrite, listAccounts } from "@/lib/books/ledger";
import { bankAccounts, listRules, listTxns, txnCounts } from "@/lib/books/banking";
import { bookBalance, listReconciliations, reconciliationView } from "@/lib/books/reconcile";
import { fmtCents, todayIso } from "@/lib/books/money";
import { BankImport, TxnHandled, TxnReview } from "@/components/books/Banking";
import { Reconcile } from "@/components/books/Reconcile";

export default async function BankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireBooks();
  const sp = await searchParams;
  const base = booksBase(await requestHost());
  const cid = session.companyId;
  const [banks, all, counts] = await Promise.all([bankAccounts(cid), listAccounts(cid), txnCounts(cid)]);
  const account = banks.find((b) => b.id === Number(sp.account)) ?? banks[0];
  const view = sp.view === "posted" || sp.view === "aside" || sp.view === "reconcile" ? sp.view : "review";
  const edit = canWrite(session.role);
  if (!account) return <div><h1 className="font-[family-name:var(--font-display)] text-2xl">Banking</h1><p className="mt-2 text-sm text-[var(--c-ink-muted)]">There is no active bank account in the chart of accounts. Add one under Chart of accounts (kind: Bank account).</p></div>;

  const isCard = account.subtype === "credit_card";
  const c = counts.get(account.id) ?? { new: 0, posted: 0, excluded: 0 };
  const balance = await bookBalance(cid, account);
  const link = (v: string, a = account.id) => `${base}/banking?account=${a}&view=${v}`;
  const tab = (v: string, label: string, n?: number) => <Link href={link(v)} className={`border-b-2 px-3 py-2 text-sm ${view === v ? "border-[var(--c-accent)] font-semibold text-[var(--c-accent)]" : "border-transparent text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`} data-testid={`bank-tab-${v}`}>{label}{n !== undefined ? <span className="ml-1.5 rounded-full bg-[var(--c-bg)] px-1.5 text-[11px]">{n}</span> : null}</Link>;

  let body: React.ReactNode;
  if (view === "review") {
    const [rows, clients, rules] = await Promise.all([listTxns(cid, account.id, "new"), db ? db.select().from(sbClients).where(eq(sbClients.companyId, cid)).orderBy(asc(sbClients.name)) : [], listRules(cid)]);
    const nameOf = (id: number) => { const a = all.find((x) => x.id === id); return a ? `${a.number} ${a.name}` : "(account removed)"; };
    const key = (r: { description: string; amount: number }) => `${r.description.toLowerCase()}|${Math.sign(r.amount)}`;
    const tally = new Map<string, number>(); for (const r of rows) tally.set(key(r), (tally.get(key(r)) ?? 0) + 1);
    const categories = all.filter((a) => a.active && !a.isTrust && a.id !== account.id).map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, needsClient: a.systemKey === "client_advances" }));
    body = (
      <>
        {edit && <BankImport accountId={account.id} isCard={isCard} />}
        <TxnReview key={account.id} total={c.new} accountId={account.id} rules={rules.map((r) => ({ id: r.id, pattern: r.pattern, direction: r.direction, account: nameOf(r.accountId) }))}
          rows={rows.map((r) => ({ id: r.id, date: r.date, amount: r.amount, description: r.description, ref: r.ref, suggestId: categories.some((x) => x.id === r.suggestId) ? r.suggestId : null, suggestFrom: r.suggestFrom, matches: r.matches, sameCount: (tally.get(key(r)) ?? 1) - 1 }))} categories={categories} clients={clients.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, matter: x.matter }))} canEdit={edit} />
      </>
    );
  } else if (view === "posted" || view === "aside") {
    const rows = await listTxns(cid, account.id, view === "posted" ? "posted" : "excluded");
    body = <TxnHandled rows={rows.map((r) => ({ id: r.id, date: r.date, amount: r.amount, description: r.description, ref: r.ref, entryId: r.entryId, category: r.category }))} kind={view === "posted" ? "posted" : "excluded"} canEdit={edit} />;
  } else {
    const recs = await listReconciliations(cid, account.id);
    const openRec = recs.find((r) => r.status === "open");
    const open = openRec ? await reconciliationView(cid, account, openRec.id) : null;
    body = (
      <div className="mt-4">
        <Reconcile key={open ? `${open.id}:${open.lines.length}` : "none"} accountId={account.id} accountLabel={`${account.number} ${account.name}`} isCard={isCard} today={todayIso()} canEdit={edit} isOwner={session.role === "owner"}
          open={open ? { id: open.id, statementDate: open.statementDate, statementBalance: open.statementBalance, beginning: open.beginning, lines: open.lines, bookBalance: open.bookBalance, trust: null } : null}
          past={recs.filter((r) => r.status === "final").map((r) => ({ id: r.id, statementDate: r.statementDate, statementBalance: r.statementBalance, finalizedBy: r.finalizedBy, finalizedAt: r.finalizedAt?.toISOString() ?? null, outstandingTotal: typeof (r.snapshot as { outstandingTotal?: number }).outstandingTotal === "number" ? (r.snapshot as { outstandingTotal: number }).outstandingTotal : null, clientTotal: null }))} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Banking</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">The operating account and credit cards. The IOLTA account is kept under Trust and never mixes with these. Statements come in as files you download from the bank; this site never signs in to a bank or moves money.</p>
      <div className="mt-4 flex flex-wrap gap-2" data-testid="bank-accounts">
        {banks.map((b) => { const n = counts.get(b.id)?.new ?? 0; return <Link key={b.id} href={link(view, b.id)} className={`rounded-lg border px-4 py-2 text-sm ${b.id === account.id ? "border-[var(--c-accent)] bg-[var(--c-surface)] font-semibold" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`} data-testid={`bank-acct-${b.number}`}>{b.name}{n > 0 && <span className="ml-2 rounded-full bg-[var(--c-accent)] px-1.5 text-[11px] font-semibold text-[var(--c-on-accent)]">{n}</span>}</Link>; })}
      </div>
      <p className="mt-3 text-sm">Balance in the books{isCard ? " (owed)" : ""}: <span className="font-mono font-semibold" data-testid="bank-balance">{fmtCents(balance, { paren: true, dollar: true })}</span></p>
      <nav className="mt-3 flex flex-wrap gap-1 border-b border-[var(--c-border)]" aria-label="Banking views">
        {tab("review", "To review", c.new)}{tab("posted", "Posted", c.posted)}{tab("aside", "Set aside", c.excluded)}{tab("reconcile", "Reconcile")}
      </nav>
      <div className="mt-4">{body}</div>
    </div>
  );
}
