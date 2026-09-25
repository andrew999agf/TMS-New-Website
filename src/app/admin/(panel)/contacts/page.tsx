import { AdminHeader } from "@/components/admin/AdminShell";
import { ContactsManager, type ContactListRow } from "@/components/admin/ContactsManager";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/contacts", session.role, session.permissions)) notFound();

  let rows: ContactListRow[] = [];
  if (db) {
    await ensureDiscoveryTables();
    try {
      rows = (await db.select().from(contacts).where(eq(contacts.archived, false)).orderBy(asc(contacts.name)))
        .map((c) => ({ id: c.id, kind: c.kind, name: c.name, firm: c.firm, side: c.side, email: c.email, phone: c.phone, address: c.address, notes: c.notes }));
    } catch { /* table just created */ }
  }

  return (
    <>
      <AdminHeader
        title="Contacts"
        description="The firm's contact book — clients (current, past, prospective), opposing parties, and attorneys on both sides. Every name field in the case tools suggests from this list, and attorneys entered on a case are filed here automatically."
      />
      <div className="p-6 max-w-5xl">
        <ContactsManager rows={rows} />
      </div>
    </>
  );
}
