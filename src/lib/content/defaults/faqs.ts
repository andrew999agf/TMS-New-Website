/**
 * Frequently asked questions. Answers draw only on verified firm facts and
 * general process information — no invented policies. Rendered on the Contact
 * page with FAQPage structured data for SEO.
 */
export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: "What types of matters does the firm handle?",
    a: "T. Maxwell Smith, PLLC is a trial firm with a general practice. We handle civil and commercial litigation, personal injury and wrongful death, appeals, criminal defense, consumer and commercial debt matters, foreclosures, garnishments, business formation and disputes, and estate planning and probate.",
  },
  {
    q: "Where are the firm's offices?",
    a: "The firm has three Texas offices: a litigation hub in Fort Worth (1612 Summit Ave.), its principal office in Meridian in Bosque County, and a by-appointment office in Weatherford in Parker County.",
  },
  {
    q: "What counties does the firm serve?",
    a: "We have litigation experience across Collin, Denton, Wise, Tarrant, Dallas, Kaufman, Johnson, Parker, Bosque, and Hamilton counties, as well as the U.S. District Court for the Northern District of Texas and the Fifth Circuit.",
  },
  {
    q: "I've been served with a lawsuit. What should I do?",
    a: "Do not ignore it. Being served starts a deadline to file an answer, and missing it can result in a default judgment against you. Contact the firm promptly so we can review the papers and the dates that apply to your case.",
  },
  {
    q: "Does the firm handle appeals?",
    a: "Yes. Appellate work is a core part of the practice. We have handled appeals in the Texas courts of appeals, through the Supreme Court of Texas, and are admitted in the U.S. Court of Appeals for the Fifth Circuit.",
  },
  {
    q: "How do I get started?",
    a: "Use the Request a Consultation form. It walks you through a few questions about your situation and routes your matter to the right place at the firm. We will follow up using the contact method you choose.",
  },
  {
    q: "Does contacting the firm create an attorney-client relationship?",
    a: "No. Contacting the firm or submitting the consultation form does not create an attorney-client relationship, which is formed only through a signed engagement agreement. Please do not send confidential or time-sensitive details until that relationship is established.",
  },
];
