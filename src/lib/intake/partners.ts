/**
 * Partner intake links.
 *
 * A partner is another office that sits down with walk-in clients (or hands
 * them a link) and sends the matter to this firm. Each partner gets ONE
 * unlisted page — /i/<slug> — that is not in the site's menus, sitemap or
 * search, and is marked noindex. What comes in is an ordinary intake lead,
 * tagged with the partner, so it shows in the Intake tab AND in that
 * partner's own sub-tab (same record: processing it in one processes it in
 * the other).
 *
 * Adding a partner is one entry in INTAKE_PARTNERS. No database change.
 */

export type PartnerArea = {
  id: string;
  label: string;
  blurb: string;
  /** Which of the firm's own intake branches this routes as — decides who on the intake team is notified. */
  branch: string;
  practiceSlug: string;
};

export type IntakePartner = {
  slug: string;
  name: string;
  website: string;
  areas: PartnerArea[];
};

/** The general matter types a partner's walk-ins choose from. */
export const PARTNER_AREAS: PartnerArea[] = [
  { id: "civil-defense", label: "Civil Defense", blurb: "I've been sued, or someone is threatening to sue me", branch: "sued", practiceSlug: "civil-commercial-litigation" },
  { id: "debt-defense", label: "Credit Card / Debt Defense", blurb: "A creditor or debt collector is suing or collecting from me", branch: "sued", practiceSlug: "consumer-debt-defense" },
  { id: "probate", label: "Probate", blurb: "A loved one passed away — an estate or inheritance matter", branch: "probate", practiceSlug: "probate" },
  { id: "estate-planning", label: "Estate Planning", blurb: "A will, a trust, or powers of attorney", branch: "estate", practiceSlug: "estate-succession-planning" },
  { id: "injury", label: "Personal Injury / Wrongful Death", blurb: "I was hurt, or a family member was killed", branch: "injured", practiceSlug: "personal-injury" },
  { id: "collection", label: "Collection", blurb: "Someone owes me or my business money", branch: "sue", practiceSlug: "commercial-debt-collection-defense" },
  { id: "real-estate", label: "Real Estate", blurb: "A dispute over land, a home, a lease, or a sale", branch: "sue", practiceSlug: "civil-commercial-litigation" },
  { id: "other", label: "Other", blurb: "Something else, or I'm not sure", branch: "other", practiceSlug: "business-related-matters" },
];

export const INTAKE_PARTNERS: IntakePartner[] = [
  { slug: "texas-mexico-law", name: "Texas Mexico Law", website: "https://texasmexicolaw.com", areas: PARTNER_AREAS },
];

export function getIntakePartner(slug: string | null | undefined): IntakePartner | null {
  if (!slug) return null;
  return INTAKE_PARTNERS.find((p) => p.slug === slug) ?? null;
}

/** The partner a stored lead came through, read from its answers. */
export function partnerOfAnswers(answers: Record<string, unknown> | null | undefined): IntakePartner | null {
  const slug = answers && typeof answers.partnerSlug === "string" ? answers.partnerSlug : "";
  return getIntakePartner(slug);
}

export const partnerPath = (slug: string) => `/i/${slug}`;

/** Labels for the answer keys the partner form adds (emails, the lead drawer, CSV). */
export const PARTNER_FIELD_LABELS: Record<string, string> = {
  practiceArea: "Type of matter",
  partnerName: "Came in through",
  preferredLanguage: "Preferred language",
  opposingCounsel: "Attorney on the other side",
  caseFiled: "Is a court case already filed?",
  caseInfo: "Court and case number",
  urgent: "Is this urgent?",
  urgentReason: "Why it is urgent",
  helpedBy: "Staff member who helped with this form",
};
