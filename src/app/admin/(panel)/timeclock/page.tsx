import { AdminHeader } from "@/components/admin/AdminShell";
import { TimeClockManager, type PunchView } from "@/components/admin/TimeClockManager";
import { PayrollScheduleCard, TimeClockReportCard } from "@/components/admin/TimeClockAdminTools";
import { getSetting } from "@/lib/content";
import { PAYROLL_KEY, PAYROLL_DEFAULT, PAYROLL_PERIOD_KEY, currentPayrollPeriod, type PayrollSchedule, type PayrollPeriod } from "./payroll";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { and, eq, gte, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Time-clock history: everyone's punches for full admins (with fix-entry
 *  tools), the signed-in person's own punches otherwise. Last 6 weeks. */
export default async function TimeClockPage() {
  const session = await requireAdmin();
  const admin = isFullAdmin(session.role);
  const me = Number(session.sub);
  // Handbook default: biweekly Fridays, payroll finalized two days ahead.
  const payroll = await getSetting<PayrollSchedule>(PAYROLL_KEY, PAYROLL_DEFAULT);
  // Saved payroll-report period, rolled forward two weeks at a time once its
  // Through date has passed — the report card opens on this range.
  const savedPeriod = await getSetting<PayrollPeriod | null>(PAYROLL_PERIOD_KEY, null);
  const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const period = currentPayrollPeriod(savedPeriod, todayCT);

  let punches: PunchView[] = [];
  let people: { id: number; name: string }[] = [];
  if (db) {
    try {
      const names = new Map((await db.select({ id: admins.id, name: admins.name }).from(admins)).map((a) => [a.id, a.name]));
      people = (await db.select({ id: admins.id, name: admins.name }).from(admins).where(eq(admins.hourly, true))).sort((a, b) => a.name.localeCompare(b.name));
      const since = new Date(Date.now() - 42 * 86_400_000);
      const rows = await db
        .select()
        .from(timeClockPunches)
        .where(admin ? gte(timeClockPunches.clockIn, since) : and(gte(timeClockPunches.clockIn, since), eq(timeClockPunches.adminId, me)))
        .orderBy(desc(timeClockPunches.clockIn));
      punches = rows.map((p) => ({
        id: p.id,
        adminId: p.adminId,
        name: names.get(p.adminId) ?? `User ${p.adminId}`,
        clockIn: p.clockIn.toISOString(),
        clockOut: p.clockOut ? p.clockOut.toISOString() : null,
        autoClosed: p.autoClosed,
        autoOpen: p.autoOpen,
      }));
    } catch {
      /* run Apply database updates first */
    }
  }

  return (
    <>
      <AdminHeader
        title="Time Clock"
        description={
          admin
            ? "Hourly punches for the last six weeks. Fix a time, add a missed shift, or delete a bad punch — the Monday email report uses these entries."
            : "Your hourly punches for the last six weeks. Ask an administrator to correct anything that looks off."
        }
      />
      <div className="max-w-4xl space-y-4 p-8">
        {admin && <PayrollScheduleCard initial={payroll} />}
        {admin && <TimeClockReportCard people={people} period={period} />}
        <TimeClockManager punches={punches} people={people} canEdit={admin} />
      </div>
    </>
  );
}
