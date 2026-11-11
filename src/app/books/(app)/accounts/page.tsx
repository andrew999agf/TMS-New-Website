import { requireBooks, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { balances, canWrite, listAccounts, natural } from "@/lib/books/ledger";
import { AccountsManager } from "@/components/books/AccountsManager";

export default async function AccountsPage() {
  const session = await requireBooks();
  const [accts, bal, host] = await Promise.all([listAccounts(session.companyId), balances(session.companyId), requestHost()]);
  const rows = accts.map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, subtype: a.subtype, parentId: a.parentId, isTrust: a.isTrust, systemKey: a.systemKey, active: a.active, balance: natural(a, bal.get(a.id)) }));
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Chart of accounts</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">A law-firm chart, with the IOLTA account and the client trust liability kept apart from operating money. Balances are to date; click an account to see what makes up its balance.</p>
      <AccountsManager rows={rows} base={booksBase(host)} canEdit={canWrite(session.role)} />
    </div>
  );
}
