import { AdminHeader } from "@/components/admin/AdminShell";
import { IntakeTable, type IntakeRow } from "@/components/admin/IntakeTable";
import { LeadSources, type LeadPoint } from "@/components/admin/LeadSources";
import { ReferralSources, type ReferrerPoint } from "@/components/admin/ReferralSources";
import { OutboundReferrals, type OutboundPoint } from "@/components/admin/OutboundReferrals";
import { AmountMetrics, type AmountPoint } from "@/components/admin/AmountMetrics";
import { IntakeOutcomes, type OutcomePoint } from "@/components/admin/IntakeOutcomes";
import type { LetterRow } from "@/components/admin/EngagementLetterDialog";
import { IntakeRecipientsManager } from "@/components/admin/IntakeRecipientsManager";
import { ReferralAttorneysManager, type ReferralAttorneyRow } from "@/components/admin/ReferralAttorneysManager";
import { SendIntakeRequest } from "@/components/admin/SendIntakeRequest";
import { db, hasDb } from "@/db";
import { intakeSubmissions, referralAttorneys, engagementLetters } from "@/db/schema";
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
  let amounts: AmountPoint[] = [];
  const referrers: ReferrerPoint[] = [];
  let outbound: OutboundPoint[] = [];
  let attorneys: string[] = [];
  let referralRows: ReferralAttorneyRow[] = [];
  let outcomes: OutcomePoint[] = [];
  const lettersByIntake: Record<number, LetterRow[]> = {};
  if (db) {
    try {
      // Select only the columns the list needs, so a newly-added column that
      // hasn't been created yet (before a Database Sync) can't make the whole
      // intake list disappear.
      const data = await db
        .select({
          id: intakeSubmissions.id,
          branch: intakeSubmissions.branch,
          practiceSlug: intakeSubmissions.practiceSlug,
          name: intakeSubmissions.name,
          email: intakeSubmissions.email,
          phone: intakeSubmissions.phone,
          county: intakeSubmissions.county,
          isUrgent: intakeSubmissions.isUrgent,
          deadline: intakeSubmissions.deadline,
          status: intakeSubmissions.status,
          archived: intakeSubmissions.archived,
          referredTo: intakeSubmissions.referredTo,
          feeExpected: intakeSubmissions.feeExpected,
          feeAmount: intakeSubmissions.feeAmount,
          createdAt: intakeSubmissions.createdAt,
          emailStatus: intakeSubmissions.emailStatus,
          incomplete: intakeSubmissions.incomplete,
          answers: intakeSubmissions.answers,
          referralSource: intakeSubmissions.referralSource,
        })
        .from(intakeSubmissions)
        .orderBy(desc(intakeSubmissions.createdAt));
      leads = data.map((r) => ({ createdAt: r.createdAt.toISOString(), source: r.referralSource ?? null }));
      // Amount-in-controversy points for the lead-value metrics panel.
      amounts = data
        .map((r) => ({ createdAt: r.createdAt.toISOString(), range: String((r.answers as Record<string, unknown>)?.amountRange ?? "").trim() }))
        .filter((a) => a.range);
      // Outbound: leads we referred out (a name is recorded in referredTo).
      outbound = data
        .filter((r) => (r.referredTo ?? "").trim())
        .map((r) => ({ createdAt: r.createdAt.toISOString(), referredTo: r.referredTo!.trim() }));
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
    outcomes = rows.map((r) => ({ status: r.status }));
    // Engagement letters, grouped per lead for the builder dialog.
    try {
      const ls = await db.select().from(engagementLetters).orderBy(desc(engagementLetters.createdAt));
      for (const l of ls) {
        if (l.intakeId == null) continue;
        (lettersByIntake[l.intakeId] ??= []).push({
          id: l.id, intakeId: l.intakeId,
          clientName: l.clientName, businessName: l.businessName, officerTitle: l.officerTitle, andIndividually: l.andIndividually,
          email: l.email, street: l.street, city: l.city, state: l.state, zip: l.zip, county: l.county,
          office: l.office as LetterRow["office"], side: l.side as LetterRow["side"],
          generalDescription: l.generalDescription, caseNumber: l.caseNumber, caseStyling: l.caseStyling,
          phase1Custom: l.phase1Custom, phase2Custom: l.phase2Custom,
          phase1: l.phase1 ?? true, phase2: l.phase2 ?? true,
          fees: l.fees,
          openUntil: l.openUntil ? l.openUntil.toISOString() : null,
          status: l.status as LetterRow["status"],
          sentAt: l.sentAt ? l.sentAt.toISOString() : null,
          createdAt: l.createdAt.toISOString(),
        });
      }
    } catch {
      /* engagement_letters may not exist until the next Database Sync */
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
        <IntakeOutcomes points={outcomes} />
        <AmountMetrics points={amounts} />
        <ReferralSources referrers={referrers} />
        <OutboundReferrals referrals={outbound} />
        <IntakeTable rows={rows} attorneys={attorneys} referralAttorneys={referralRows} initialLeadId={initialLeadId} letters={lettersByIntake} />
      </div>
    </>
  );
}
