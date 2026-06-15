import { AdminHeader } from "@/components/admin/AdminShell";
import { LoginsManager } from "@/components/admin/LoginsManager";
import { requireFullAdmin } from "@/lib/auth";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function LoginsPage() {
  const session = await requireFullAdmin();
  let rows: { id: number; name: string; email: string; role: string; lastLoginAt: string | null }[] = [];
  if (db) {
    const data = await db.select().from(admins).orderBy(asc(admins.name));
    rows = data.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    }));
  }

  return (
    <>
      <AdminHeader
        title="Logins"
        description="Admin accounts. A “timekeeper” login can only use the Time Tracker; “editor” and “owner” have full admin access."
      />
      <div className="p-8">
        <LoginsManager initial={rows} selfId={Number(session.sub)} />
      </div>
    </>
  );
}
