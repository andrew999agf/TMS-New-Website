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
  /** Spanish, for the form's language switch. The stored answer is always the English label. */
  labelEs: string;
  blurbEs: string;
  /** Which of the firm's own intake branches this routes as — decides who on the intake team is notified. */
  branch: string;
  practiceSlug: string;
};

export type IntakePartner = {
  slug: string;
  name: string;
  website: string;
  /** The starting logo (a file under /public). The admin can upload a different one. */
  logo?: string;
  /** Their contact details as first given: one office per block, blocks
   *  separated by a blank line. The admin can edit this text. */
  contact?: string;
  areas: PartnerArea[];
};

/** The general matter types a partner's walk-ins choose from. */
export const PARTNER_AREAS: PartnerArea[] = [
  { id: "civil-defense", label: "Civil Defense", blurb: "I've been sued, or someone is threatening to sue me", labelEs: "Defensa civil", blurbEs: "Me demandaron, o alguien amenaza con demandarme", branch: "sued", practiceSlug: "civil-commercial-litigation" },
  { id: "debt-defense", label: "Credit Card / Debt Defense", blurb: "A creditor or debt collector is suing or collecting from me", labelEs: "Defensa de deudas / tarjetas de crédito", blurbEs: "Un acreedor o un cobrador me está demandando o cobrando", branch: "sued", practiceSlug: "consumer-debt-defense" },
  { id: "probate", label: "Probate", blurb: "A loved one passed away — an estate or inheritance matter", labelEs: "Sucesiones (probate)", blurbEs: "Falleció un ser querido: un asunto de herencia o sucesión", branch: "probate", practiceSlug: "probate" },
  { id: "estate-planning", label: "Estate Planning", blurb: "A will, a trust, or powers of attorney", labelEs: "Planificación patrimonial", blurbEs: "Un testamento, un fideicomiso o poderes legales", branch: "estate", practiceSlug: "estate-succession-planning" },
  { id: "injury", label: "Personal Injury / Wrongful Death", blurb: "I was hurt, or a family member was killed", labelEs: "Lesiones personales / muerte por negligencia", blurbEs: "Sufrí una lesión, o un familiar falleció por culpa de otro", branch: "injured", practiceSlug: "personal-injury" },
  { id: "collection", label: "Collection", blurb: "Someone owes me or my business money", labelEs: "Cobranza", blurbEs: "Alguien me debe dinero a mí o a mi negocio", branch: "sue", practiceSlug: "commercial-debt-collection-defense" },
  { id: "real-estate", label: "Real Estate", blurb: "A dispute over land, a home, a lease, or a sale", labelEs: "Bienes raíces", blurbEs: "Una disputa sobre un terreno, una casa, un arrendamiento o una venta", branch: "sue", practiceSlug: "civil-commercial-litigation" },
  { id: "other", label: "Other", blurb: "Something else, or I'm not sure", labelEs: "Otro", blurbEs: "Otra cosa, o no estoy seguro(a)", branch: "other", practiceSlug: "business-related-matters" },
];

export const INTAKE_PARTNERS: IntakePartner[] = [
  {
    slug: "texas-mexico-law", name: "Texas Mexico Law", website: "https://texasmexicolaw.com",
    logo: "/partners/texas-mexico-law.png",
    contact: [
      "800 W Weatherford St,\nFort Worth, TX, United States\nCriminal Phone: (817) 335-2331\nEmail: phillip@texasmexicolaw.com",
      "1550 West Berry St,\nFort Worth, TX, 76110\nImmigration Phone: (817) 546-7320\nEmail: rocio@texasmexicolaw.com",
    ].join("\n\n"),
    areas: PARTNER_AREAS,
  },
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
  helpedBy: "Contact at the referring office",
  formLanguage: "Form completed in",
  consultRequested: "In-person consultation requested",
  consultDates: "Dates requested (a request, not an appointment)",
};
