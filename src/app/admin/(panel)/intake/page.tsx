import { AdminHeader } from "@/components/admin/AdminShell";
import { IntakeTable, type IntakeRow } from "@/components/admin/IntakeTable";
import { LeadSources, type LeadPoint } from "@/components/admin/LeadSources";
import { ReferralSources, type ReferrerPoint } from "@/components/admin/ReferralSources";
import { IntakeRecipientsManager } from "@/components/admin/IntakeRecipientsManager";
import { ReferralAttorneysManager, type ReferralAttorneyRow } from "@/components/admin/ReferralAttorneysManager";
import { SendIntakeRequest } from "@/components/admin/SendIntakeRequest";
import { db, hasDb } from "@/db";
import { intakeSubmissions, referralAttorneys } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getIntakeRecipients } from "@/lib/content";
import { emailConfigured } from "@/lib/email";
import { BRANCHES } from "@/lib/intake/config";

export const dynamic = "force-dynamic";

export default async function IntakeAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const initialLeadId = typeof sp.lead === "string" ? Number(sp.lead) : null;
  const recipients = await getIntakeRecipients(false);
  const branches = BRANCHES.map((b) => ({ id: b.id, label: b.label }));
  const senderFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "office@texaslawsmith.com";

  let rows: IntakeRow[] = [];
  let leads: LeadPoint[] = [];
  let referrers: ReferrerPoint[] = [];
  let attorneys: string[] = [];
  let referralRows: ReferralAttorneyRow[] = [];
  if (db) {
    try {
      const data = await db.select().from(intakeSubmissions).orderBy(desc(intakeSubmissions.createdAt));
      leads = data.map((r) => ({ createdAt: r.createdAt.toISOString(), source: r.referralSource ?? null }));
      for (const r of data) {
        const src = r.referralSource ?? "";
        const a = (r.answers as Record<string, unknown>) ?? {};
        if (src === "Referred by another attorney") {
          const name = String(a.referrerAttorney ?? "").trim();
          if (name) referrers.push({ createdAt: r.createdAt.toISOString(), name, kind: "attorney" });
        } else if (src === "Referred by friend or family" || src === "Referred by a past client") {
          const name = String(a.referrerName ?? "").trim();
          if (name) referrers.push({ createdAt: r.createdAt.toISOString(), name, kind: "other" });
        }
      }
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
      const a = await db.select().from(referralAttorneys).orderBy(asc(referralAttorneys.sort), asc(referralAttorneys.name));
      attorneys = a.map((x) => x.name);
      referralRows = a.map((x) => ({ id: x.id, name: x.name, firm: x.firm ?? "", address: x.address ?? "", phone: x.phone ?? "", email: x.email ?? "", website: x.website ?? "", practiceArea: x.practiceArea ?? "" }));
    } catch {
      attorneys = [];
      referralRows = [];
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
        <ReferralAttorneysManager initial={referralRows} />
        <LeadSources leads={leads} />
        <ReferralSources referrers={referrers} />
        <IntakeTable rows={rows} attorneys={attorneys} referralAttorneys={referralRows} initialLeadId={initialLeadId} />
      </div>
    </>
  );
}
