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
        id: r.id, amount: r.amount, outcome: r.outcome, wonAt: r.wonAt, note: r.note, createdBy: r.createdBy,
      }));
    } catch {
      /* run Settings → Database updates once */
    }
  }

  return (
    <>
      <AdminHeader
        title="Debt Defense Wins"
        description="Every non-suit and defense judgment goes on the board — the counter on the debt-defense page updates the moment an entry is added."
      />
      <div className="p-8">
        <DebtWinsManager rows={rows} />
      </div>
    </>
  );
}
