import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { BillingReview, type ReviewEntry } from "@/components/admin/BillingReview";
import { requireAdmin } from "@/lib/auth";
import { canReviewBilling } from "@/lib/admin-sections";
import { db } from "@/db";
import { timeEntries, timeActivityUsers, timeMatters, admins } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BillingReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAdmin();
  if (!canReviewBilling(session.role, session.permissions)) redirect("/admin");
  const sp = await searchParams;
  const initialUser = typeof sp.user === "string" ? sp.user : "";
  const initialDate = typeof sp.date === "string" ? sp.date : "";

  let entries: ReviewEntry[] = [];
  let people: string[] = [];
  let matters: { displayNumber: string; description: string }[] = [];

  if (db) {
    try {
      const [rows, ad, matterRows, users] = await Promise.all([
        db.select().from(timeEntries).where(eq(timeEntries.status, "active")).orderBy(desc(timeEntries.entryDate), desc(timeEntries.createdAt)),
        db.select({ id: admins.id, name: admins.name }).from(admins),
        db.select().from(timeMatters).orderBy(asc(timeMatters.sort)),
        db.select().from(timeActivityUsers).orderBy(asc(timeActivityUsers.sort)),
      ]);
      const ownerName = new Map(ad.map((a) => [a.id, a.name]));
      matters = matterRows.map((m) => ({ displayNumber: m.displayNumber, description: m.description }));

      entries = rows.map((e) => ({
        id: e.id,
        person: (e.activityUserName || "").trim() || ownerName.get(e.ownerId) || "(unassigned)",
        ownerName: ownerName.get(e.ownerId) ?? "—",
        matter: e.matter,
        entryDate: e.entryDate,
        activityDescription: e.activityDescription,
        note: e.note,
        price: e.price,
        quantity: e.quantity,
        activityUserName: e.activityUserName,
        nonBillable: e.nonBillable,
      }));

      const names = new Set<string>(entries.map((e) => e.person));
      for (const u of users) names.add(u.name);
      people = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
    } catch {
      /* run Apply database updates */
    }
  }

  return (
    <>
      <AdminHeader
        title="Billing Review"
        description="Review and revise staff time (live entries only). Move between people and change the date range; edits save straight to the time tracker."
      />
      <div className="p-6">
        <BillingReview entries={entries} people={people} matters={matters} initialUser={initialUser} initialDate={initialDate} />
      </div>
    </>
  );
}
