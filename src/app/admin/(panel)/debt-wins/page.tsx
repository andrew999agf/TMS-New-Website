import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { AdminHeader } from "@/components/admin/AdminShell";
import { DebtWinsManager, type DebtWinRow } from "@/components/admin/DebtWinsManager";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { debtDefenseWins } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DebtWinsPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/debt-wins", session.role, session.permissions)) notFound();

  let rows: DebtWinRow[] = [];
  if (db) {
    try {
      rows = (await db.select().from(debtDefenseWins).orderBy(desc(debtDefenseWins.wonAt), desc(debtDefenseWins.id))).map((r) => ({
        id: r.id, amount: r.amount, outcome: r.outcome, wonAt: r.wonAt,
        court: r.court ?? "", caseNumber: r.caseNumber ?? "", plaintiff: r.plaintiff ?? "",
        note: r.note, createdBy: r.createdBy,
      }));
    } catch {
      /* run Settings → Database updates once */
    }
  }

  // Every court and plaintiff ever entered, most-used first — the autocomplete
  // that keeps spellings consistent.
  const distinct = (vals: string[]) => {
    const freq = new Map<string, number>();
    for (const v of vals) { const t = v.trim(); if (t) freq.set(t, (freq.get(t) ?? 0) + 1); }
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  };
  const courts = distinct(rows.map((r) => r.court));
  const plaintiffs = distinct(rows.map((r) => r.plaintiff));

  return (
    <>
      <AdminHeader
        title="Debt Defense Wins"
        description="Every non-suit and defense judgment goes on the board — the counter on the debt-defense page updates the moment an entry is added."
      />
      <div className="p-8">
        <DebtWinsManager rows={rows} courts={courts} plaintiffs={plaintiffs} />
      </div>
    </>
  );
}
