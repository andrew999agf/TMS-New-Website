import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { requireBooks, booksCompany, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { accountByKey, canWrite, clientTrustBalances } from "@/lib/books/ledger";
import { clientLedger } from "@/lib/books/trust";
import { bookBalance, listReconciliations, reconciliationView } from "@/lib/books/reconcile";
import { fmtCents, todayIso } from "@/lib/books/money";
import { ClientLedger, ClientList } from "@/components/books/Trust";
import { Reconcile } from "@/components/books/Reconcile";

export default async function TrustPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireBooks();
  const sp = await searchParams;
  const base = booksBase(await requestHost());
  const cid = session.companyId;
  const edit = canWrite(session.role);
  const [bank, clients, company] = await Promise.all([accountByKey(cid, "iolta_bank"), clientTrustBalances(cid), booksCompany(cid)]);
  if (!bank) return <div><h1 className="font-[family-name:var(--font-display)] text-2xl">Trust (IOLTA)</h1><p className="mt-2 text-sm text-[var(--c-ink-muted)]">The IOLTA bank account is missing from the chart of accounts.</p></div>;
  const view = sp.view === "reconcile" ? "reconcile" : "ledgers";
  const bankBal = await bookBalance(cid, bank);
  const clientTotal = clients.reduce((s, c) => s + c.balance, 0);
  const agree = bankBal === clientTotal && clients.every((c) => c.balance >= 0);
  const rows = clients.map((c) => ({ id: c.clientId, name: c.name, matter: c.matter, reference: c.reference, active: c.active, balance: c.balance }));
  const selected = rows.find((c) => c.id === Number(sp.client)) ?? null;
  const tab = (v: string, label: string) => <Link href={`${base}/trust${v === "reconcile" ? "?view=reconcile" : ""}`} className={`border-b-2 px-3 py-2 text-sm ${view === v ? "border-[var(--c-accent)] font-semibold text-[var(--c-accent)]" : "border-transparent text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`} data-testid={`trust-tab-${v}`}>{label}</Link>;

  let body: React.ReactNode;
  if (view === "ledgers") {
    const lines = selected ? await clientLedger(cid, selected.id) : [];
    body = (
      <>
        <ClientList clients={rows} base={base} selected={selected?.id ?? null} canEdit={edit} />
        {selected && <ClientLedger key={selected.id} client={selected} lines={lines} canEdit={edit} today={todayIso()} />}
      </>
    );
  } else {
    const recs = await listReconciliations(cid, bank.id);
    const openRec = recs.find((r) => r.status === "open");
    const open = openRec ? await reconciliationView(cid, bank, openRec.id) : null;
    body = (
      <Reconcile key={open ? `${open.id}:${open.lines.length}` : "none"} accountId={bank.id} accountLabel="the IOLTA account" today={todayIso()} canEdit={edit} isOwner={session.role === "owner"}
        open={open ? { id: open.id, statementDate: open.statementDate, statementBalance: open.statementBalance, beginning: open.beginning, lines: open.lines, bookBalance: open.bookBalance, trust: open.trust } : null}
        past={recs.filter((r) => r.status === "final").map((r) => { const s = r.snapshot as { outstandingTotal?: number; clientTotal?: number }; return { id: r.id, statementDate: r.statementDate, statementBalance: r.statementBalance, finalizedBy: r.finalizedBy, finalizedAt: r.finalizedAt?.toISOString() ?? null, outstandingTotal: typeof s.outstandingTotal === "number" ? s.outstandingTotal : null, clientTotal: typeof s.clientTotal === "number" ? s.clientTotal : null }; })} />
    );
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Trust (IOLTA)</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Client money{company?.ioltaBankName ? ` at ${company.ioltaBankName}${company.ioltaLast4 ? ` ····${company.ioltaLast4}` : ""}` : ""}: one ledger per client, never below zero, never mixed with the firm&apos;s. Record each movement here when you make it at the bank; this site never moves money.</p>
      <div className={`mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border p-4 ${agree ? "border-[var(--c-border)] bg-[var(--c-surface)]" : "border-red-300 bg-red-50 text-[#1c1917]"}`} data-testid="trust-summary">
        <p className="text-sm">IOLTA account in the books <span className="ml-2 font-mono text-base font-semibold" data-testid="trust-bank-balance">{fmtCents(bankBal, { paren: true, dollar: true })}</span></p>
        <p className="text-sm">Total of client ledgers <span className="ml-2 font-mono text-base font-semibold" data-testid="trust-client-total">{fmtCents(clientTotal, { paren: true, dollar: true })}</span></p>
        <p className={`inline-flex items-center gap-1.5 text-xs font-semibold ${agree ? "text-emerald-700" : "text-red-800"}`} data-testid="trust-agree">{agree ? <><CheckCircle2 size={14} /> In agreement</> : <><CircleAlert size={14} /> These do not agree, or a ledger is below zero</>}</p>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-[var(--c-border)]" aria-label="Trust views">{tab("ledgers", "Client ledgers")}{tab("reconcile", "Three-way reconciliation")}</nav>
      <div className="mt-4">{body}</div>
      <p className="mt-6 text-xs leading-relaxed text-[var(--c-ink-muted)]">Entries are never edited or deleted, only voided with a reason, and every change is logged. Keep trust records for five years after the representation ends (Texas Disciplinary Rule 1.15). A balance listing by client is under Reports.</p>
    </div>
  );
}
