import { AdminHeader } from "@/components/admin/AdminShell";
import { LoginsManager } from "@/components/admin/LoginsManager";
import { requireFullAdmin } from "@/lib/auth";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function LoginsPage() {
  const session = await requireFullAdmin();
  let rows: { id: number; name: string; email: string; role: string; permissions: string[]; lastLoginAt: string | null }[] = [];
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
      }));
    } catch {
      /* run Apply database updates to add the new account columns */
    }
  }

  return (
    <>
      <AdminHeader
        title="User Management"
        description="Accounts &amp; access. Timekeeper logins get the Time Tracker only — use the access toggles to grant more. Owner/Editor have full access."
      />
      <div className="p-8">
        <LoginsManager initial={rows} selfId={Number(session.sub)} />
      </div>
    </>
  );
}
