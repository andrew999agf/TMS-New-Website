import "server-only";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries } from "@/db/schema";

/**
 * Read-only billing rollup for the Assistant — totals from the Time Tracker's
 * entries (it reads the table; it never writes or changes Time Tracker
 * behavior). Only ever attached for users who hold billing access
 * (owners/editors or the Billing Review grant); everyone else's assistant
 * never even sees this tool.
 */
export async function billingSummary(args: Record<string, unknown>): Promise<string> {
  if (!db) return JSON.stringify({ error: "No database." });
  const now = new Date();
  const def = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(String(args.month ?? "")) ? String(args.month) : def;
  try {
    const rows = await db.select().from(timeEntries).where(like(timeEntries.entryDate, `${month}-%`));
    let billableHours = 0, billableUsd = 0, nonBillableHours = 0;
    const byUser = new Map<string, { hours: number; usd: number }>();
    const byMatter = new Map<string, { hours: number; usd: number }>();
    for (const r of rows) {
      const hours = r.quantity || 0;
      const usd = (r.price || 0) * hours;
      if (r.nonBillable) {
        nonBillableHours += hours;
        continue;
      }
      billableHours += hours;
      billableUsd += usd;
      const u = byUser.get(r.activityUserName || "(unassigned)") ?? { hours: 0, usd: 0 };
      u.hours += hours; u.usd += usd;
      byUser.set(r.activityUserName || "(unassigned)", u);
      const key = r.matter || "(no matter)";
      const m = byMatter.get(key) ?? { hours: 0, usd: 0 };
      m.hours += hours; m.usd += usd;
      byMatter.set(key, m);
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return JSON.stringify({
      month,
      entries: rows.length,
      billableHours: round(billableHours),
      billableAmountUsd: round(billableUsd),
      nonBillableHours: round(nonBillableHours),
      byTimekeeper: [...byUser.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([name, v]) => ({ name, hours: round(v.hours), usd: round(v.usd) })),
      topMatters: [...byMatter.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, 12).map(([matter, v]) => ({ matter, hours: round(v.hours), usd: round(v.usd) })),
      note: "Amounts are rate x hours from Time Tracker entries for that month (both active and already-exported); Clio remains the billing authority.",
    });
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message.slice(0, 150) });
  }
}
