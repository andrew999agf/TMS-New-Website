import { AdminHeader } from "@/components/admin/AdminShell";
import { LoginsManager } from "@/components/admin/LoginsManager";
import { requireFullAdmin } from "@/lib/auth";
import { db } from "@/db";
import { admins, timeActivityUsers } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getSetting } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function LoginsPage() {
  const session = await requireFullAdmin();
  let rows: { id: number; name: string; email: string; role: string; permissions: string[]; lastLoginAt: string | null; hourly: boolean }[] = [];
  let activityUsers: string[] = [];
  const ttDefaults = await getSetting<Record<string, string>>("tt.userDefaults", {});
  if (db) {
    try {
      const data = await db.select().from(admins).orderBy(asc(admins.name));
      rows = data.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        permissions: (a.permissions as string[]) ?? [],
        lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
        hourly: Boolean(a.hourly),
      }));
    } catch {
      /* run Apply database updates to add the new account columns */
    }
    try {
      const us = await db.select({ name: timeActivityUsers.name }).from(timeActivityUsers).orderBy(asc(timeActivityUsers.sort));
      activityUsers = us.map((u) => u.name);
    } catch {
      /* table may not exist yet */
    }
  }

  return (
    <>
      <AdminHeader
        title="User Management"
        description="Accounts &amp; access. Timekeeper logins get the Time Tracker and Training — use the access toggles to grant more. Owner/Editor have full access."
      />
      <div className="p-8">
        <LoginsManager
          initial={rows}
          selfId={Number(session.sub)}
          activityUsers={activityUsers}
          ttDefaults={ttDefaults ?? {}}
        />
      </div>
    </>
  );
}
