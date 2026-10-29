import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbAccounts } from "@/db/schema";
import { requireBooks } from "@/lib/books/auth";

const TYPE_LABEL: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };

export default async function AccountsPage() {
  const session = await requireBooks();
  if (!db) return null;
  const rows = await db.select().from(sbAccounts).where(eq(sbAccounts.companyId, session.companyId)).orderBy(asc(sbAccounts.number));
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Chart of accounts</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">A law-firm chart, with the IOLTA account and the client trust liability kept apart from operating money. Editing comes with the banking module.</p>
      {(["asset", "liability", "equity", "income", "expense"] as const).map((t) => (
        <section key={t} className="mt-5">
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-ink-muted)]">{TYPE_LABEL[t]}</h2>
          <table className="w-full text-sm">
            <tbody>
              {rows.filter((r) => r.type === t).map((r) => (
                <tr key={r.id} className="border-t border-[var(--c-border)]" data-testid={`acct-${r.number}`}>
                  <td className="w-20 py-1.5 font-mono text-xs text-[var(--c-ink-muted)]">{r.number}</td>
                  <td className={`py-1.5 ${r.parentId ? "pl-5" : ""}`}>{r.name}{r.isTrust && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">TRUST</span>}</td>
                  <td className="py-1.5 text-right text-[11px] text-[var(--c-ink-muted)]">{r.subtype.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
