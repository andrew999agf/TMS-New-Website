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

export async function getDebtDefenseStats(): Promise<DebtWinStats> {
  if (!db) return { count: 0, total: 0 };
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${debtDefenseWins.amount}), 0)::float8` })
      .from(debtDefenseWins);
    return { count: row?.count ?? 0, total: row?.total ?? 0 };
  } catch {
    return { count: 0, total: 0 }; // table not created yet — run Database updates
  }
}
