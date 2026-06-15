import { AdminHeader } from "@/components/admin/AdminShell";
import { IntakeTable, type IntakeRow } from "@/components/admin/IntakeTable";
import { IntakeRecipientsManager } from "@/components/admin/IntakeRecipientsManager";
import { db, hasDb } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getIntakeRecipients } from "@/lib/content";
import { emailConfigured } from "@/lib/email";
import { BRANCHES } from "@/lib/intake/config";

export const dynamic = "force-dynamic";

export default async function IntakeAdminPage() {
  const recipients = await getIntakeRecipients(false);
  const branches = BRANCHES.map((b) => ({ id: b.id, label: b.label }));
  const senderFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "office@texaslawsmith.com";

  let rows: IntakeRow[] = [];
  if (db) {
    try {
      const data = await db.select().from(intakeSubmissions).orderBy(desc(intakeSubmissions.createdAt));
      rows = data.map((r) => ({
        id: r.id,
        branch: r.branch,
        practiceSlug: r.practiceSlug,
        name: r.name,
        email: r.email,
        phone: r.phone,
        county: r.county,
        isUrgent: r.isUrgent,
        deadline: r.deadline,
        status: r.status as IntakeRow["status"],
        createdAt: r.createdAt.toISOString(),
        answers: (r.answers as Record<string, unknown>) ?? {},
      }));
    } catch {
      rows = [];
    }
  }

  return (
    <>
      <AdminHeader
        title="Intake"
        description="Consultation requests. Manage who gets notified, filter, update status, and export."
      />
      <div className="p-8">
        <IntakeRecipientsManager
          initial={recipients}
          branches={branches}
          dbEnabled={hasDb}
          emailConfigured={emailConfigured}
          senderFrom={senderFrom}
        />
        <IntakeTable rows={rows} />
      </div>
    </>
  );
}
