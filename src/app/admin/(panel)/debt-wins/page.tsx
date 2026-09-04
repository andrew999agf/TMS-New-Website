import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { AdminHeader } from "@/components/admin/AdminShell";
import { DebtWinsManager, type DebtWinRow } from "@/components/admin/DebtWinsManager";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { debtDefenseWins } from "@/db/schema";
import { getSetting } from "@/lib/content";
import { DEBT_WINS_PUBLIC_KEY } from "@/lib/debt-wins";

export const dynamic = "force-dynamic";

export default async function DebtWinsPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/debt-wins", session.role, session.permissions)) notFound();

  let rows: DebtWinRow[] = [];
  if (db) {
    try {
      rows = (await db.select().from(debtDefenseWins).orderBy(desc(debtDefenseWins.wonAt), desc(debtDefenseWins.id))).map((r) => {
        // Confidential settlements are REDACTED SERVER-SIDE for everyone but
        // the owner and whoever logged the entry — the identifying details
        // never even reach the browser. Only the amounts survive.
        const confidential = r.confidential ?? false;
        const redacted = confidential && session.role !== "owner" && r.createdBy !== session.email;
        return {
          id: r.id, amount: r.amount, settledPaid: r.settledPaid ?? 0, outcome: r.outcome,
          wonAt: redacted ? "" : r.wonAt,
          court: redacted ? "" : (r.court ?? ""),
          caseNumber: redacted ? "" : (r.caseNumber ?? ""),
          plaintiff: redacted ? "" : (r.plaintiff ?? ""),
          note: redacted ? "" : r.note,
          createdBy: r.createdBy, confidential, redacted,
        };
      });
    } catch {
      /* run Settings → Database updates once */
    }
  }

  // Every court and plaintiff ever entered, most-used first — the autocomplete
  // that keeps spellings consistent. Redacted rows contribute nothing.
  const distinct = (vals: string[]) => {
    const freq = new Map<string, number>();
    for (const v of vals) { const t = v.trim(); if (t) freq.set(t, (freq.get(t) ?? 0) + 1); }
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  };
  const visible = rows.filter((r) => !r.redacted);
  const courts = distinct(visible.map((r) => r.court));
  const plaintiffs = distinct(visible.map((r) => r.plaintiff));
  const publicOn = await getSetting<boolean>(DEBT_WINS_PUBLIC_KEY, false);

  return (
    <>
      <AdminHeader
        title="Debt Defense Wins"
        description="Every non-suit and defense judgment goes on the board — the counter on the debt-defense page updates the moment an entry is added."
      />
      <div className="p-8">
        <DebtWinsManager rows={rows} courts={courts} plaintiffs={plaintiffs} publicOn={publicOn === true} />
      </div>
    </>
  );
}
