import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { debtDefenseWins } from "@/db/schema";

/**
 * The one source of truth for the debt-defense scoreboard: how many collection
 * suits the firm has beaten (non-suits + defense judgments) and the total
 * dollars that were claimed. Read by the public counter on the debt-defense
 * page — and reusable anywhere else (Results, home) without a second tally.
 */
export type DebtWinStats = { count: number; total: number };

/** Master switch (settings key): whether the scoreboard shows on the public
 *  site at all. Defaults OFF so the numbers can be fully populated first. */
export const DEBT_WINS_PUBLIC_KEY = "debtWins.public";

export async function getDebtDefenseStats(): Promise<DebtWinStats> {
  if (!db) return { count: 0, total: 0 };
  try {
    // Wins only — a logged judgment for the plaintiff never joins the tally,
    // and a settlement counts ONLY when it settled for more than 90% below the
    // claim (paid under 10% of the demand), claiming just the unpaid part.
    const [row] = await db
      .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${debtDefenseWins.amount} - ${debtDefenseWins.settledPaid}), 0)::float8` })
      .from(debtDefenseWins)
      .where(sql`${debtDefenseWins.outcome} <> 'judgment-plaintiff' and not (${debtDefenseWins.outcome} = 'settled' and ${debtDefenseWins.settledPaid} >= ${debtDefenseWins.amount} * 0.1)`);
    return { count: row?.count ?? 0, total: row?.total ?? 0 };
  } catch {
    return { count: 0, total: 0 }; // table not created yet — run Database updates
  }
}
