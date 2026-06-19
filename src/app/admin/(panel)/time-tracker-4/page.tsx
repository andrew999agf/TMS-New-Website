import { AdminHeader } from "@/components/admin/AdminShell";
import { TimeTracker, type EntryView } from "@/components/admin/TimeTracker";
import { VoiceTimeEntry4 } from "@/components/admin/VoiceTimeEntry4";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { db } from "@/db";
import { timeEntries, timeActivityUsers, timeCategories, timeMatters, admins } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Time Tracker 4.0 — identical tracker (same database, same CSV import/export,
 * same categories/users/skin), with the rebuilt 4.0 voice engine: a forgiving
 * two-step state machine on the reliable browser speech API, with much stronger
 * matter matching. The original tracker and earlier voice versions stay
 * available as fallbacks.
 */
export default async function TimeTracker4Page() {
  const session = await requireAdmin();
  const me = Number(session.sub);
  const admin = isFullAdmin(session.role);

  let entries: EntryView[] = [];
  let activityUsers: { id: number; name: string; rate: number }[] = [];
  let categories: { id: number; name: string }[] = [];
  let matters: { displayNumber: string; description: string }[] = [];
  let owners: { id: number; name: string }[] = [{ id: me, name: session.name }];

  if (db) {
    try {
      const [users, cats, matterRows] = await Promise.all([
        db.select().from(timeActivityUsers).orderBy(asc(timeActivityUsers.sort)),
        db.select().from(timeCategories).orderBy(asc(timeCategories.sort)),
        db.select().from(timeMatters).orderBy(asc(timeMatters.sort)),
      ]);
      activityUsers = users.map((u) => ({ id: u.id, name: u.name, rate: u.rate }));
      categories = cats.map((c) => ({ id: c.id, name: c.name }));
      matters = matterRows.map((m) => ({ displayNumber: m.displayNumber, description: m.description }));

      const rows = admin
        ? await db.select().from(timeEntries).orderBy(desc(timeEntries.createdAt))
        : await db.select().from(timeEntries).where(eq(timeEntries.ownerId, me)).orderBy(desc(timeEntries.createdAt));

      if (admin) {
        const ad = await db.select({ id: admins.id, name: admins.name }).from(admins).orderBy(asc(admins.name));
        owners = ad;
      }
      const ownerName = new Map(owners.map((o) => [o.id, o.name]));

      entries = rows.map((e) => ({
        id: e.id,
        ownerId: e.ownerId,
        ownerName: ownerName.get(e.ownerId) ?? "—",
        matter: e.matter,
        entryDate: e.entryDate,
        activityDescription: e.activityDescription,
        note: e.note,
        price: e.price,
        quantity: e.quantity,
        activityUserName: e.activityUserName,
        nonBillable: e.nonBillable,
        status: e.status as "active" | "archived",
        exportedAt: e.exportedAt ? e.exportedAt.toISOString() : null,
        exportedBy: e.exportedBy,
      }));
    } catch {
      /* tables may not exist yet — run Apply database updates */
    }
  }

  return (
    <>
      <AdminHeader
        title="Time Tracker 4.0"
        description="Same tracker and CSV, with the rebuilt 4.0 voice engine: a forgiving two-step flow with much stronger case matching. The original Time Tracker stays available as a fallback."
      />
      <div className="p-8">
        <TimeTracker
          entries={entries}
          activityUsers={activityUsers}
          categories={categories}
          matters={matters}
          me={{ id: me, name: session.name, admin }}
          owners={owners}
          VoiceComponent={VoiceTimeEntry4}
        />
      </div>
    </>
  );
}
