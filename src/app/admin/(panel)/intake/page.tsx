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
import { AddLeadManually } from "@/components/admin/AddLeadManually";
import { QuestionnairesPanel } from "@/components/admin/QuestionnairesPanel";
import { db, hasDb } from "@/db";
import { intakeSubmissions, referralAttorneys, engagementLetters, timeMatters } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getIntakeRecipients, getBlocks } from "@/lib/content";
import { EngagementDefaults } from "@/components/admin/EngagementDefaults";
import { emailConfigured } from "@/lib/email";
import { BRANCHES } from "@/lib/intake/config";
import { INTAKE_PARTNERS, getIntakePartner, partnerOfAnswers, partnerPath } from "@/lib/intake/partners";
import { PartnerIntakeTabs, PartnerLinkCard, type PartnerTab } from "@/components/admin/PartnerIntakeTabs";
import { SITE_URL } from "@/lib/seo";
import { PartnerContacts } from "@/components/admin/PartnerContacts";
import { getPartnerContacts } from "@/lib/intake/partner-contacts";
import { PartnerProfile } from "@/components/admin/PartnerProfile";
import { getPartnerProfile } from "@/lib/intake/partner-profile";
import { PartnerConsults } from "@/components/admin/PartnerConsults";
import { PartnerLetters } from "@/components/admin/PartnerLetters";
import { contractProgress } from "@/lib/intake/contracts";
import { AutoArchiveRules } from "@/components/admin/LeadOutcome";
import { PartnerCases, type CaseLeadRow } from "@/components/admin/PartnerCases";
import { casePrefills, leadCaseViews, type LeadCaseView } from "@/lib/intake/lead-cases";
import type { MatterOption } from "@/components/admin/MatterCombobox";
import { autoArchivePartnerLeads, getAutoArchiveRules } from "@/lib/intake/lead-archive";
import { consultLocations, fmtRequested, listConsults, partnerLocations } from "@/lib/intake/consults";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function IntakeAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const initialLeadId = typeof sp.lead === "string" ? Number(sp.lead) : null;
  // A partner office's sub-tab: the same leads, filtered to that partner.
  const activePartner = getIntakePartner(typeof sp.partner === "string" ? sp.partner : null);
  // On a partner tab, first archive whatever is due, so the lists below are already short.
  if (activePartner) await autoArchivePartnerLeads().catch(() => null);
  const archiveRules = activePartner ? await getAutoArchiveRules() : null;
  const recipients = await getIntakeRecipients(false);
  const branches = BRANCHES.map((b) => ({ id: b.id, label: b.label }));
  const senderFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "office@texaslawsmith.com";
  // The firm's standard hourly rates: shown beside the engagement dialog's
  // rate fields; typing below one strikes it through in the letter.
  const consultBlocks = await getBlocks("consultation");
  const rate = (k: string, fallback: number) => {
    const v = parseFloat(consultBlocks[k] ?? "");
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const defaultRates = {
    attorneyRate: rate("engagement.rate.attorney", 425),
    associateRate: rate("engagement.rate.associate", 425),
    staffRate: rate("engagement.rate.staff", 145),
  };

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
          sentTo: l.sentTo ?? "",
          signedAt: l.signedAt ? l.signedAt.toISOString() : null,
          signerName: l.signerName ?? "",
          customDocxName: l.customDocx ? (l.customDocxName || "edited copy.docx") : "",
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

  const partnerTabs: PartnerTab[] = INTAKE_PARTNERS.map((p) => {
    const mine = rows.filter((r) => partnerOfAnswers(r.answers)?.slug === p.slug);
    return { slug: p.slug, name: p.name, website: p.website, url: `${SITE_URL}${partnerPath(p.slug)}`, total: mine.length, fresh: mine.filter((r) => r.status === "new" && !r.archived).length };
  });
  const shownRows = activePartner ? rows.filter((r) => partnerOfAnswers(r.answers)?.slug === activePartner.slug) : rows;
  const activeTab = activePartner ? partnerTabs.find((t) => t.slug === activePartner.slug) ?? null : null;
  // The partner office's own intake staff: copied on that partner's lead emails.
  const partnerProfile = activePartner ? await getPartnerProfile(activePartner) : null;
  // Engagement letters for this partner's leads: which are started, and how many blanks are left.
  // Open leads first (the newest 100), then the archived ones, which stay hidden until asked for.
  const openLeads = activePartner ? shownRows.filter((r) => !r.archived) : [];
  const letterLeads = [...openLeads.slice(0, 100), ...(activePartner ? shownRows.filter((r) => r.archived).slice(0, 100) : [])];
  const letterProgress = activePartner ? await contractProgress(letterLeads.map((r) => r.id)).catch(() => new Map<number, { blanks: number; updatedAt: string }>()) : new Map<number, { blanks: number; updatedAt: string }>();
  // In-person consultation requests that came in through this partner's form.
  const consults = activePartner ? await listConsults(activePartner.slug).catch(() => []) : [];
  const FIRM_NAME_FOR_LOCATIONS = (await getBlocks("global"))["global.firmName"] || "T. Maxwell Smith, PLLC";
  // Who a referred-out lead went to, for the outcome box on both lists.
  const leadById = new Map(shownRows.map((r) => [r.id, r]));
  const referralOf = (id: number) => { const r = leadById.get(id); return r && r.status === "referred-out" ? { to: r.referredTo ?? "", fee: r.feeExpected, amount: r.feeAmount ?? "" } : undefined; };
  const partnerContacts = activePartner ? (await getPartnerContacts(activePartner.slug)).map((c) => ({ id: c.id, name: c.name, email: c.email, linkSentAt: c.linkSentAt })) : [];
  // Converted leads and the case records they were sent to (with any folder shared with the partner office).
  const caseViews = activePartner ? await leadCaseViews(shownRows.map((r) => r.id)).catch(() => new Map<number, LeadCaseView>()) : new Map<number, LeadCaseView>();
  const caseLeads = activePartner ? shownRows.filter((r) => r.status === "converted" || caseViews.get(r.id)?.caseId != null) : [];
  const casePrefill = await casePrefills(caseLeads.filter((r) => caseViews.get(r.id)?.caseId == null));
  // The Time Tracker's matter list, read only, for the matter-number box.
  let matterOptions: MatterOption[] = [];
  if (activePartner && db && caseLeads.length) { try { matterOptions = (await db.select().from(timeMatters).orderBy(asc(timeMatters.sort))).map((m) => ({ displayNumber: m.displayNumber, description: m.description })); } catch { /* the list is optional: a number can be typed */ } }
  const contactName = (email: string) => partnerContacts.find((c) => c.email.trim().toLowerCase() === email.trim().toLowerCase())?.name ?? "";
  const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "");
  const caseRows = caseLeads.map((r): CaseLeadRow => {
    const v = caseViews.get(r.id);
    return {
      leadId: r.id, name: r.name ?? "", area: String(r.answers.practiceArea ?? ""), received: shortDate(r.createdAt),
      state: v?.caseId != null ? "case" : v?.skipped ? "skipped" : "todo",
      prefill: casePrefill.get(r.id) ?? { name: r.name ?? "", county: r.county ?? "", court: "", role: "Other" },
      contactId: partnerContacts.find((c) => c.name === String(r.answers.helpedBy ?? ""))?.id ?? "",
      caseId: v?.caseId ?? null, caseMatter: v?.matter ?? "", caseName: v?.caseName ?? "", caseClosed: !!v?.caseClosed,
      folder: v?.folder ? { id: v.folder.id, files: v.folder.files, lastFile: shortDate(v.folder.lastFileAt), lastFileBy: v.folder.lastFileBy ? contactName(v.folder.lastFileBy) || "this firm" : "", people: v.folder.people.map((p) => ({ name: p.name, opened: shortDate(p.openedAt), off: p.off })) } : null,
    };
  }).sort((a, b) => Number(a.state !== "todo") - Number(b.state !== "todo"));
  const caseLinkOf = (id: number) => { const v = caseViews.get(id); return v?.caseId != null ? { href: `/admin/cases/${v.caseId}`, label: "Open the case" } : activePartner ? { href: `?partner=${activePartner.slug}&convert=${id}#cases`, label: "Send to Cases" } : undefined; };
  const focusCase = typeof sp.convert === "string" ? Number(sp.convert) || null : null;
  const focusConsult = typeof sp.consult === "string" ? Number(sp.consult) || null : null;
  const central = (iso: string | null, opt: Intl.DateTimeFormatOptions, locale = "en-CA") => (iso ? new Intl.DateTimeFormat(locale, { timeZone: "America/Chicago", ...opt }).format(new Date(iso)) : "");

  return (
    <>
      <AdminHeader
        title="Intake"
        description="Consultation requests. Manage who gets notified, filter, update status, and export."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AddLeadManually branches={branches} />
            <SendIntakeRequest branches={branches} />
          </div>
        }
      />
      <div className="p-8">
        <PartnerIntakeTabs partners={partnerTabs} active={activePartner?.slug ?? null} allCount={rows.length} />
        {activeTab ? (
          <>
            <PartnerLinkCard partner={activeTab} />
            <PartnerConsults attorneys={attorneys} partnerName={activeTab.name} partnerSlug={activeTab.slug} focusId={focusConsult} locations={[{ label: activeTab.name, options: partnerLocations(activeTab.name, partnerProfile?.contact ?? "") }, { label: FIRM_NAME_FOR_LOCATIONS, options: consultLocations() }]} contacts={partnerContacts.map((c) => ({ id: c.id, name: c.name }))}
              rows={consults.map((c) => ({
                id: c.id, intakeId: c.intakeId, status: c.status, requested: c.requested.map(fmtRequested), contactId: c.contactId, clientName: c.clientName, clientPhone: c.clientPhone, hasEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.clientEmail), matter: c.matter,
                sentToName: c.sentToName, whenText: c.whenText, startDate: central(c.startAt, { year: "numeric", month: "2-digit", day: "2-digit" }), startTime: central(c.startAt, { hour: "2-digit", minute: "2-digit", hour12: false }, "en-GB"),
                durationMin: c.durationMin, location: c.location, note: c.note, proposedAt: c.proposedAt, confirmedAt: c.confirmedAt, declineNote: c.declineNote, reminderDay: !!c.reminderDayAt, reminderHours: !!c.reminderHoursAt,
                leadStatus: c.leadStatus, leadArchived: c.leadArchived, referral: referralOf(c.intakeId), caseLink: caseLinkOf(c.intakeId),
                upcoming: c.upcoming, past: c.past,
              }))} />
            <PartnerLetters attorneys={attorneys} partnerName={activeTab.name} moreActive={Math.max(0, openLeads.length - 100)} rows={letterLeads.map((r) => ({ leadId: r.id, name: r.name ?? "", matter: String(r.answers.practiceArea ?? ""), received: new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" }), blanks: letterProgress.get(r.id)?.blanks ?? null, status: r.status, archived: r.archived, referral: referralOf(r.id), caseLink: caseLinkOf(r.id) }))} />
            <PartnerCases rows={caseRows} matters={matterOptions} contacts={partnerContacts.map((c) => ({ id: c.id, name: c.name }))} partnerName={activeTab.name} focusId={focusCase} />
            {archiveRules && <AutoArchiveRules afterOutcomeDays={archiveRules.afterOutcomeDays} idleDays={archiveRules.idleDays} />}
            {partnerProfile && <PartnerProfile partner={{ slug: activeTab.slug, name: activeTab.name }} logoUrl={partnerProfile.logoUrl} logoIsOriginal={partnerProfile.logoIsOriginal} hasOriginalLogo={partnerProfile.hasOriginalLogo} contact={partnerProfile.contact} />}
            <PartnerContacts partner={{ slug: activeTab.slug, name: activeTab.name }} contacts={partnerContacts} emailReady={emailConfigured} />
            <IntakeTable key={activeTab.slug} rows={shownRows} attorneys={attorneys} referralAttorneys={referralRows} initialLeadId={initialLeadId} letters={lettersByIntake} defaultRates={defaultRates} />
          </>
        ) : (
        <>
        <IntakeRecipientsManager
          initial={recipients}
          branches={branches}
          dbEnabled={hasDb}
          emailConfigured={emailConfigured}
          senderFrom={senderFrom}
        />
        <ReferralAttorneysManager initial={referralRows} />
        <EngagementDefaults initial={defaultRates} />
        <QuestionnairesPanel />
        <LeadSources leads={leads} />
        <IntakeOutcomes points={outcomes} />
        <AmountMetrics points={amounts} />
        <ReferralSources referrers={referrers} />
        <OutboundReferrals referrals={outbound} />
        <IntakeTable rows={rows} attorneys={attorneys} referralAttorneys={referralRows} initialLeadId={initialLeadId} letters={lettersByIntake} defaultRates={defaultRates} />
        </>
        )}
      </div>
    </>
  );
}
