import { AdminHeader } from "@/components/admin/AdminShell";
import { IntakeTable, type IntakeRow } from "@/components/admin/IntakeTable";
import { IntakeRecipientsManager } from "@/components/admin/IntakeRecipientsManager";
import { SendIntakeRequest } from "@/components/admin/SendIntakeRequest";
import { db, hasDb } from "@/db";
import { intakeSubmissions, referralAttorneys } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getIntakeRecipients } from "@/lib/content";
import { emailConfigured } from "@/lib/email";
import { BRANCHES } from "@/lib/intake/config";

export const dynamic = "force-dynamic";

export default async function IntakeAdminPage() {
  const recipients = await getIntakeRecipients(false);
  const branches = BRANCHES.map((b) => ({ id: b.id, label: b.label }));
  const senderFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "office@texaslawsmith.com";

  let rows: IntakeRow[] = [];
  let attorneys: string[] = [];
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
        archived: r.archived ?? false,
        referredTo: r.referredTo ?? null,
        feeExpected: r.feeExpected ?? false,
        feeAmount: r.feeAmount ?? null,
        createdAt: r.createdAt.toISOString(),
        emailStatus: r.emailStatus ?? null,
        incomplete: r.incomplete ?? false,
        answers: (r.answers as Record<string, unknown>) ?? {},
      }));
    } catch {
      rows = [];
    }
    try {
      const a = await db.select({ name: referralAttorneys.name }).from(referralAttorneys).orderBy(asc(referralAttorneys.name));
      attorneys = a.map((x) => x.name);
    } catch {
      attorneys = [];
    }
  }

  return (
    <>
      <AdminHeader
        title="Intake"
        description="Consultation requests. Manage who gets notified, filter, update status, and export."
        actions={<SendIntakeRequest branches={branches} />}
      />
      <div className="p-8">
        <IntakeRecipientsManager
          initial={recipients}
          branches={branches}
          dbEnabled={hasDb}
          emailConfigured={emailConfigured}
          senderFrom={senderFrom}
        />
        <IntakeTable rows={rows} attorneys={attorneys} />
      </div>
    </>
  );
}
