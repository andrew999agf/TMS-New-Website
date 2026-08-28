/**
 * Intake wizard configuration (build spec Section 12).
 *
 * The entry screen shows selectable "bubbles" filtered in real time by a fuzzy
 * keyword match. Each bubble starts a branch; practice-area pages deep-link to
 * a branch via ?practice=<slug>. Every branch ends with the common final steps
 * (contact, conflict basics, urgency, free text, consent).
 *
 * All of this is editable in admin → Intake; this is the seed/fallback.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "tel"
  | "email"
  | "date"
  | "select"
  | "radio"
  | "checklist"
  | "yesno"
  /** A repeatable single-line input: one blank, with a "+ add another" button. */
  | "repeater"
  /** Repeatable people, each with name + phone + address, with autocomplete. */
  | "party"
  /** Street / City / State / ZIP composite; value is an Address object. */
  | "address"
  /** Specific gifts: each an item + recipients. */
  | "gifts"
  /** Residuary beneficiaries with an even-split toggle and percentage validation. */
  | "residuary"
  /** Drag-and-drop document upload (court papers etc.); value is IntakeFile[]. */
  | "files"
  /** Not an input: a prominent inline panel (label = heading, help = body).
   *  With `blocking: true` it also stops the flow while visible — used to
   *  decline matter types the firm does not accept. */
  | "notice";

/** An uploaded document attached to a submission (stored in media storage). */
export type IntakeFile = { name: string; url: string; size?: number };

/** A mailing address captured as separate parts. */
export type Address = { street?: string; city?: string; state?: string; zip?: string };

/** Format an address (object or legacy string) as "Street, City, ST ZIP". */
export function formatAddress(a?: Address | string | null): string {
  if (!a) return "";
  if (typeof a === "string") return a.trim();
  const street = (a.street ?? "").trim();
  const cityLine = [(a.city ?? "").trim(), [(a.state ?? "").trim(), (a.zip ?? "").trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, cityLine].filter(Boolean).join(", ");
}

/** A person captured in the flow — reused across fields with autocomplete. The
 *  address is stored as separate parts; `address` remains for legacy answers. */
export type Person = { name: string; phone?: string; street?: string; city?: string; state?: string; zip?: string; address?: string };
/** A specific gift: an item and the people who receive it. */
export type Gift = { item: string; to: Person[] };
/** A residuary beneficiary and (when not splitting evenly) their percentage. */
export type ResShare = { person: Person; percent: string };
export type ResiduaryValue = { even: boolean; shares: ResShare[] };

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  /** A prominent, auto-shown (dismissible) explanation for a tough elective
   *  question the client may not know how to answer. A standard "answer to the
   *  best of your ability / contact us" note is appended automatically. */
  guidance?: string;
  /** Inline glossary: a legal term inside the label the client may not know.
   *  It's rendered in the accent color; hover or tap reveals a plain-language
   *  definition so they know exactly what the question is asking for. */
  defs?: { term: string; title: string; body: string }[];
  /** For type "notice": while visible, Next/Submit are disabled. */
  blocking?: boolean;
  /** Label for a repeater's/party's add button (e.g. "Add a co-executor"). */
  addLabel?: string;
  /** Max entries for a party field (e.g. up to four co-agents). */
  max?: number;
  /** Show this field only when the condition(s) are met (array = OR). */
  showIf?: Condition | Condition[];
};

export type Step = {
  id: string;
  title: string;
  subtitle?: string;
  fields: Field[];
  /** Show this step only when the condition(s) are met (array = OR). */
  showIf?: Condition | Condition[];
  /** ALL of these must also hold (AND) — combined with showIf's OR list. */
  requireIf?: Condition | Condition[];
};

/**
 * Declarative visibility condition used by conditional steps/fields (e.g. only
 * ask for trustee details if the visitor checked a trust). Kept JSON-friendly
 * so the config stays serializable.
 *  - includesAny: the field's value (string or string[]) contains one of these
 *  - equals: the field's value strictly equals this
 *  - (neither): the field simply has a truthy value
 */
export type Condition = { field: string; includesAny?: string[]; equals?: string };

function oneCondMet(c: Condition, answers: Record<string, unknown>): boolean {
  const v = answers[c.field];
  if (c.includesAny) {
    const arr = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
    return c.includesAny.some((x) => arr.includes(x));
  }
  if (c.equals !== undefined) return v === c.equals;
  return Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim());
}

/** True when EVERY condition in the array is satisfied (AND). */
export function condMetAll(
  cond: Condition | Condition[] | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!cond) return true;
  const list = Array.isArray(cond) ? cond : [cond];
  return list.every((c) => oneCondMet(c, answers));
}

/** True when the condition (or any condition in the array) is satisfied. */
export function condMet(
  cond: Condition | Condition[] | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!cond) return true;
  const list = Array.isArray(cond) ? cond : [cond];
  return list.some((c) => oneCondMet(c, answers));
}

export type Branch = {
  id: string;
  label: string;
  /** What the visitor is feeling, shown under the bubble */
  blurb: string;
  practiceSlug: string;
  /** Other practice-area slugs this branch also covers. One branch often
   *  serves several pages — the injury branch handles a death in the family,
   *  the creditor branch handles a foreclosure — and this is what lets the
   *  "Request a Consultation" button on those pages open the right questions
   *  instead of dropping the visitor back on the picker. */
  alsoPractices?: string[];
  /** Fuzzy-match keywords/synonyms */
  keywords: string[];
  /** Plain-English description of the matter for the forwardable summary email
   *  (e.g. "a criminal matter"). Falls back to the label. */
  summaryNoun?: string;
  steps: Step[];
  /** Per-branch replacements for shared COMMON_STEPS, keyed by step id
   *  (e.g. reword the "conflict" or "urgency" step for this matter type). */
  commonOverrides?: Record<string, Step>;
};

/** Reused help text guiding a prospect to identify the exact court. */
export const COURT_HELP =
  "Look at the top of the first page of the lawsuit, citation, or court notice — it names the court, e.g. “141st District Court, Tarrant County,” “County Court at Law No. 2, Tarrant County,” or “City of Fort Worth Municipal Court.” If no case has been filed yet, you can leave this blank.";

const COURT_HELP_CRIMINAL =
  "It’s on your citation, bond paperwork, or court notice — e.g. “County Criminal Court No. 3, Tarrant County,” “396th District Court, Tarrant County,” or for a ticket, “City of Fort Worth Municipal Court.”";

/**
 * Canonical "amount in controversy" buckets, used by every money branch so the
 * admin metrics can compare like with like. Exported so the metrics panel and
 * the intake flow read from the same list.
 */
export const AMOUNT_RANGE = ["Under $25,000", "$25,000–$100,000", "$100,000–$500,000", "$500,000–$1M", "Over $1M", "Not sure"] as const;

/** Reusable inline definition for the amount question. */
const AMOUNT_DEF = {
  term: "amount in controversy",
  title: "Amount in controversy",
  body: "Your best estimate of the total dollars at stake — what you hope to recover, or what is being claimed against you. A rough range is fine; choose “Not sure” if you don’t know yet.",
};

/** A standardized amount-in-controversy question for a money branch. `guidance`
 *  is added for injury-type matters where the value truly isn't known early. */
const amountField = (guidance?: string): Field => ({
  name: "amountRange",
  label: "Approximate amount in controversy",
  type: "select",
  options: [...AMOUNT_RANGE],
  defs: [AMOUNT_DEF],
  ...(guidance ? { guidance } : {}),
});

/** Steps appended to every branch before submission. */
export const COMMON_STEPS: Step[] = [
  {
    id: "contact",
    title: "How can we reach you?",
    fields: [
      { name: "name", label: "Full name", type: "text", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      {
        name: "preferredContact",
        label: "Preferred contact method",
        type: "radio",
        options: ["Telephone", "Email"],
      },
      { name: "county", label: "Your county or city", type: "text" },
    ],
  },
  {
    id: "conflict",
    title: "Who is on the other side?",
    subtitle:
      "We ask for the opposing party's name only to run a conflict check. Leave blank if you are not sure.",
    fields: [
      {
        name: "opposingParty",
        label: "Opposing party name(s)",
        type: "textarea",
        placeholder: "Person(s) or business(es) on the other side",
      },
    ],
  },
  {
    id: "urgency",
    title: "Is there a deadline?",
    subtitle: "A court date or legal deadline tells us how fast we need to move.",
    fields: [
      {
        name: "hasDeadline",
        label: "Do you have an upcoming court date or deadline?",
        type: "yesno",
      },
      { name: "deadline", label: "If so, what date?", type: "date" },
    ],
  },
  {
    id: "details",
    title: "Anything else we should know?",
    fields: [
      {
        name: "message",
        label: "In your own words",
        type: "textarea",
        placeholder: "A few sentences about what is going on.",
      },
    ],
  },
  {
    id: "referral",
    title: "How did you hear about us?",
    subtitle: "This just helps us know what's working — pick the closest option.",
    fields: [
      {
        name: "referralSource",
        label: "How did you find us?",
        type: "radio",
        options: [
          "Web search — Google",
          "Web search — Yahoo",
          "Web search — DuckDuckGo",
          "Web search — other",
          "AI — ChatGPT",
          "AI — Claude",
          "AI — other",
          "Facebook",
          "Instagram",
          "Referred by friend or family",
          "Referred by another attorney",
          "Referred by a past client",
          "Other",
        ],
      },
      {
        name: "referrerName",
        label: "Who can we thank?",
        type: "text",
        placeholder: "The name of the person who referred you",
        showIf: [
          { field: "referralSource", equals: "Referred by friend or family" },
          { field: "referralSource", equals: "Referred by a past client" },
        ],
      },
      {
        name: "referrerAttorney",
        label: "Which attorney or firm referred you?",
        type: "text",
        placeholder: "The attorney or firm's name",
        showIf: { field: "referralSource", equals: "Referred by another attorney" },
      },
      {
        name: "referralOther",
        label: "Tell us how",
        type: "text",
        placeholder: "How you heard about us",
        showIf: { field: "referralSource", equals: "Other" },
      },
    ],
  },
  {
    id: "consent",
    title: "One last thing.",
    fields: [
      {
        name: "consent",
        label:
          "I understand that submitting this form does not create an attorney-client relationship, and I will not include confidential details here.",
        type: "checklist",
        options: ["I understand and agree"],
        required: true,
      },
    ],
  },
];

/**
 * Reusable replacements for the shared conflict/urgency steps, for matters where
 * "the other side" and "a court date" don't fit (planning, formation, probate).
 */
const SOFT_URGENCY: Step = {
  id: "urgency",
  title: "Is there a deadline?",
  subtitle: "Any deadline — a hearing, a closing, a filing date — tells us how quickly to move.",
  fields: [
    { name: "hasDeadline", label: "Do you have a deadline or time-sensitive concern?", type: "yesno" },
    { name: "deadline", label: "If so, what date?", type: "date" },
  ],
};

function involvedStep(
  label: string,
  placeholder: string,
  subtitle = "We ask only so we can run a conflicts check. Leave blank if you are not sure.",
): Step {
  return {
    id: "conflict",
    title: "Who else is involved?",
    subtitle,
    fields: [{ name: "opposingParty", label, type: "textarea", placeholder }],
  };
}

/**
 * Estate-planning document options (the checkable "bubbles"). Defined as
 * constants so the conditional steps that follow can reference the exact
 * labels without typos. The drafting-info steps below are written so a future
 * template engine can map each answer straight into a document field; any
 * answer left blank becomes a labeled placeholder in the generated draft.
 */
export const EP = {
  WILL: "Last Will & Testament (standard will)",
  LIVING_TRUST: "Revocable Living Trust",
  TEST_TRUST: "Testamentary Trust (created within your will)",
  FIN_POA: "Statutory Durable (Financial) Power of Attorney",
  MED_POA: "Medical Power of Attorney",
  DIRECTIVE: "Directive to Physicians (Living Will)",
  HIPAA: "HIPAA Authorization",
  LADYBIRD: "Lady Bird / Transfer-on-Death Deed",
  GUARDIAN_DECL: "Declaration of Guardian",
  NOT_SURE: "Not sure — please recommend a plan for me",
} as const;

/**
 * Canonical estate-planning documents, used both by the admin "send a specific
 * intake" picker and by the deep link that pre-checks them in the wizard. Each
 * maps to the document-picker field/option in the estate branch above.
 */
/** Estate intake depth: full drafting questionnaire vs. a basic request. */
export const ESTATE_DEPTH = {
  FULL: "Provide comprehensive information for my estate plan — the full questionnaire, so document drafts can be prepared from my answers",
  BASIC: "Request basic information — just take my details and what I need, and the firm will follow up with me",
} as const;
const ESTATE_FULL_ONLY: Condition = { field: "estateDepth", equals: ESTATE_DEPTH.FULL };

export const ESTATE_PRACTICE_SLUG = "estate-succession-planning";

export const ESTATE_DOCS = [
  { id: "will", label: "Last Will & Testament", group: "Wills", field: "docsWill", value: EP.WILL },
  { id: "living-trust", label: "Revocable Living Trust", group: "Trusts", field: "docsTrust", value: EP.LIVING_TRUST },
  { id: "testamentary-trust", label: "Testamentary Trust", group: "Trusts", field: "docsTrust", value: EP.TEST_TRUST },
  { id: "financial-poa", label: "Financial Power of Attorney", group: "Powers of Attorney & Directives", field: "docsPoa", value: EP.FIN_POA },
  { id: "medical-poa", label: "Medical Power of Attorney", group: "Powers of Attorney & Directives", field: "docsPoa", value: EP.MED_POA },
  { id: "directive", label: "Directive to Physicians", group: "Powers of Attorney & Directives", field: "docsPoa", value: EP.DIRECTIVE },
  { id: "hipaa", label: "HIPAA Authorization", group: "Powers of Attorney & Directives", field: "docsPoa", value: EP.HIPAA },
  { id: "lady-bird", label: "Lady Bird / TOD Deed", group: "Deeds & Guardianship", field: "docsOther", value: EP.LADYBIRD },
  { id: "declaration-of-guardian", label: "Declaration of Guardian", group: "Deeds & Guardianship", field: "docsOther", value: EP.GUARDIAN_DECL },
] as const;

export const ESTATE_DOC_GROUPS = ["Wills", "Trusts", "Powers of Attorney & Directives", "Deeds & Guardianship"] as const;

/** Convert picked document ids into pre-checked answers for the estate wizard. */
export function estateDocsToAnswers(ids: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    const d = ESTATE_DOCS.find((x) => x.id === id);
    if (!d) continue;
    (out[d.field] ??= []).push(d.value);
  }
  return out;
}

const NEEDS_WILL: Condition[] = [
  { field: "docsWill", includesAny: [EP.WILL] },
  { field: "docsTrust", includesAny: [EP.TEST_TRUST] },
];
const NEEDS_TRUST: Condition = { field: "docsTrust", includesAny: [EP.LIVING_TRUST, EP.TEST_TRUST] };
const NEEDS_FAMILY: Condition[] = [
  ...NEEDS_WILL,
  NEEDS_TRUST,
  { field: "docsOther", includesAny: [EP.GUARDIAN_DECL] },
];
const NEEDS_ASSETS: Condition[] = [...NEEDS_WILL, NEEDS_TRUST];

export const BRANCHES: Branch[] = [
  {
    id: "sued",
    label: "I'm being sued / received legal papers",
    blurb: "Someone filed against me",
    practiceSlug: "consumer-debt-defense",
    summaryNoun: "a lawsuit that has been filed against them",
    keywords: [
      "eviction", "evicted", "evict", "notice to vacate", "forcible detainer", "landlord suing me",
      "sued", "being sued", "lawsuit", "law suit", "summons", "citation", "served", "served papers",
      "court papers", "legal papers", "petition", "complaint", "answer deadline", "default judgment",
      "judgment against me", "taken to court", "they are suing me", "someone is suing me",
      "debt", "debt collector", "collection", "collections", "credit card", "credit card debt",
      "collection lawsuit", "owe money", "creditor",
    ],
    steps: [
      {
        id: "who",
        title: "Who is suing you?",
        fields: [
          {
            name: "whoSuing",
            label: "The other side is a…",
            type: "radio",
            options: ["Bank or debt buyer", "Business", "Individual", "Not sure"],
            required: true,
          },
        ],
      },
      {
        id: "lawsuit",
        title: "About the lawsuit",
        subtitle: "Whatever you know — estimates are fine, and you can leave blanks.",
        fields: [
          {
            name: "creditor",
            label: "If it's a debt or collection case, which creditor?",
            type: "select",
            options: [
              "Not a debt case",
              "Discover",
              "Capital One",
              "Bank of America",
              "Chase",
              "Barclays",
              "LVNV Funding",
              "Midland Credit Management",
              "Other / Not listed",
            ],
          },
          { ...amountField(), label: "Approximate amount in controversy (claimed against you)" },
          { name: "served", label: "Have you been served with papers?", type: "yesno" },
          { name: "servedWhen", label: "If served, when?", type: "date" },
          { name: "court", label: "Which court? (named on the papers)", type: "text", placeholder: "e.g., County Court at Law No. 2, Tarrant County", help: COURT_HELP },
        ],
      },
    ],
  },
  {
    id: "sue",
    label: "I need to sue someone / I'm owed money",
    blurb: "I need to bring a claim",
    practiceSlug: "plaintiffs-litigation",
    summaryNoun: "a civil claim or dispute",
    keywords: [
      "sue", "i want to sue", "file a lawsuit", "owed", "owe me", "they owe me", "someone owes me",
      "money owed", "unpaid", "didn't pay", "not paid", "won't pay", "claim", "breach", "breach of contract",
      "contract dispute", "fraud", "scammed", "ripped off", "cheated", "partnership", "partnership dispute",
      "business partner", "defamation", "slander", "libel", "property dispute", "boundary dispute",
      // NOTE: "lemon" and "warranty" are deliberately NOT keywords — they pull
      // in consumer used-car purchase disputes, which the firm does not accept.
      "contractor", "bad contractor", "unpaid invoice", "collect", "deceptive trade", "dtpa",
      "consumer protection", "negligence",
    ],
    steps: [
      {
        id: "nature",
        title: "What is the dispute about?",
        fields: [
          {
            name: "nature",
            label: "Nature of the claim",
            type: "radio",
            options: ["Contract", "Fraud", "Partnership dispute", "Property", "Defamation", "Other"],
            required: true,
          },
          // Screen out consumer vehicle-purchase disputes (used-car dealers,
          // vehicle warranty companies) — a large share of unwanted inquiries.
          // Business/commercial vehicle matters continue normally.
          {
            name: "vehiclePurchase",
            label: "Is this dispute about a vehicle you bought or leased (car, truck, trailer, or RV)?",
            type: "radio",
            options: ["No", "Yes — for personal or family use", "Yes — a business or commercial vehicle (company truck, CDL rig, fleet)"],
            required: true,
          },
          {
            name: "vehicleDecline",
            label: "We can't help with this one",
            type: "notice",
            blocking: true,
            help: "This firm does not accept consumer disputes over the purchase or lease of a vehicle — including used-car dealers, trailer and RV lots, and vehicle warranty companies. Rather than take your time, we'll say so up front. The State Bar of Texas Lawyer Referral Service can connect you with a consumer attorney: texasbar.com or (800) 252-9690. If your dispute is actually about a business or commercial vehicle, change your answer above and continue.",
            showIf: { field: "vehiclePurchase", equals: "Yes — for personal or family use" },
          },
        ],
      },
      {
        id: "stakes",
        title: "What is at stake?",
        fields: [
          amountField(),
          {
            name: "eventDate",
            label: "Approximate date of the breach or wrongful act (if known)",
            type: "date",
            defs: [
              { term: "breach", title: "Breach of contract", body: "The date the other side failed to do what the contract required — a missed payment, an undelivered product or service, or any broken promise in the agreement. Your best estimate is fine." },
              { term: "wrongful act", title: "Wrongful act", body: "For non-contract claims (fraud, defamation, a partnership dispute), the date the harmful conduct happened — when you were defrauded, when the false statement was made, and so on." },
            ],
          },
          { name: "documents", label: "Do key documents exist (contracts, emails)?", type: "yesno" },
          { name: "court", label: "If a lawsuit has already been filed, which court?", type: "text", placeholder: "e.g., 141st District Court, Tarrant County", help: COURT_HELP },
          {
            name: "timeline",
            label: "Brief timeline of events",
            type: "textarea",
            placeholder: "What happened, and roughly when?",
          },
        ],
      },
    ],
  },
  {
    id: "injured",
    label: "I was injured / a loved one died",
    blurb: "An accident or loss",
    practiceSlug: "personal-injury",
    alsoPractices: ["wrongful-death"],
    summaryNoun: "a personal injury matter",
    keywords: [
      "injured", "injury", "hurt", "wreck", "car wreck", "car accident", "crash", "collision",
      "rear ended", "hit by a car", "accident", "18-wheeler", "18 wheeler", "semi", "semi truck",
      "commercial truck", "trucking", "motorcycle", "pedestrian", "premises", "slip and fall",
      "slip", "fall", "fell", "dog bite", "hurt at work", "on the job", "broken bone", "hospital",
      "wrongful death", "died", "killed", "fatality", "drunk driver", "at fault", "insurance",
      "insurance claim", "adjuster", "uninsured", "underinsured",
    ],
    steps: [
      {
        id: "incident",
        title: "What happened?",
        fields: [
          {
            name: "incidentType",
            label: "Type of incident",
            type: "radio",
            options: ["Vehicle wreck", "18-wheeler / commercial truck", "Premises (slip/fall, property)", "Workplace", "Other"],
            required: true,
          },
          { name: "incidentDate", label: "Date of the incident", type: "date", defs: [{ term: "incident", title: "Date of the incident", body: "The day the accident, injury, fire, or event happened. If you're not certain, your best estimate is fine — the exact date can be confirmed later." }] },
        ],
      },
      {
        id: "injuries",
        title: "Injuries and treatment",
        fields: [
          {
            name: "injuries",
            label: "Injuries and current treatment status",
            type: "textarea",
            placeholder: "What injuries, and are you still being treated?",
          },
          { name: "yourInsurer", label: "Have you spoken to any insurer yet?", type: "yesno" },
          { name: "otherInsurer", label: "Do you know the other side's insurer?", type: "text" },
          amountField("Injury cases are hard to value early — before treatment is complete. Just give your rough sense of the harm, or choose “Not sure.”"),
          { name: "court", label: "If a lawsuit has already been filed, which court?", type: "text", placeholder: "e.g., 141st District Court, Tarrant County", help: COURT_HELP },
        ],
      },
    ],
  },
  {
    id: "wreck-pd",
    label: "Vehicle wreck — property damage only",
    blurb: "My car was damaged; nobody was seriously hurt",
    practiceSlug: "personal-injury",
    summaryNoun: "a vehicle-wreck property-damage claim",
    keywords: [
      "property damage", "car damage", "vehicle damage", "fender bender", "totaled", "total loss",
      "hit my car", "hit my truck", "body shop", "repair estimate", "diminished value",
      "insurance won't pay", "lowball", "claim denied", "other driver's insurance", "deductible",
      "hit and run", "parked car", "uninsured driver property damage",
    ],
    steps: [
      {
        id: "wreck",
        title: "About the wreck",
        fields: [
          { name: "accidentDate", label: "When did it happen?", type: "date" },
          {
            name: "accidentWhere",
            label: "Where did it happen?",
            type: "text",
            placeholder: "Street or intersection, city, and county",
            help: "The county matters — it decides which court a claim would be filed in.",
          },
          {
            name: "damageSeverity",
            label: "How bad is the damage?",
            type: "radio",
            options: ["Totaled / not drivable", "Major — drivable but serious damage", "Moderate — panels, bumper, dents", "Minor / cosmetic"],
            required: true,
          },
          {
            name: "anyoneHurt",
            label: "Was anyone hurt in the wreck?",
            type: "radio",
            options: ["No — property damage only", "Some soreness, but nothing treated", "Yes, someone was treated"],
          },
        ],
      },
      {
        id: "claim",
        title: "The insurance side",
        subtitle: "Where things stand tells us how to help fastest.",
        fields: [
          {
            name: "faultDriver",
            label: "Whose fault was it?",
            type: "radio",
            options: ["The other driver", "Disputed", "Partly both", "Not sure"],
          },
          {
            name: "claimStatus",
            label: "Where does the insurance claim stand?",
            type: "radio",
            options: [
              "Haven't filed a claim yet",
              "Filed — waiting / being delayed",
              "Offer feels too low",
              "Claim denied",
              "Other driver is uninsured or fled",
            ],
          },
          { ...amountField(), label: "Approximate amount in controversy (repair / value of the loss)" },
        ],
      },
      {
        id: "photos",
        title: "Photos of the damage",
        fields: [
          {
            name: "hasPhotos",
            label: "Do you have photos of the damage or the scene?",
            type: "yesno",
            help: "If yes, hold on to them — we'll ask you to email or text them to us after we're in touch. Please don't send anything through this form.",
          },
        ],
      },
    ],
    // Near the end: if injuries surface later, would they pursue them?
    commonOverrides: {
      details: {
        id: "details",
        title: "Anything else we should know?",
        fields: [
          {
            name: "message",
            label: "In your own words",
            type: "textarea",
            placeholder: "A few sentences about what is going on.",
          },
          {
            name: "piInterest",
            label: "Sometimes injuries show up days or weeks after a wreck. If it turned out you had a personal-injury claim worth pursuing, would you consider filing it?",
            type: "radio",
            options: ["Yes, I'd consider it", "Maybe — I'd want to talk it through", "No — property damage only"],
          },
        ],
      },
    },
  },
  {
    id: "criminal",
    label: "Criminal charge or investigation",
    blurb: "I'm facing the State",
    practiceSlug: "criminal-defense",
    summaryNoun: "a criminal matter",
    keywords: [
      "criminal", "crime", "arrested", "arrest", "charged", "charge", "criminal charge", "dwi", "dui",
      "accused", "accuse", "accusation", "falsely accused", "prosecuted", "prosecution",
      "drunk driving", "assault", "family violence", "domestic violence", "theft", "drugs", "possession",
      "investigation", "investigated", "detective", "jail", "in jail", "bond", "bail", "warrant",
      "police", "indicted", "felony", "misdemeanor", "probation", "probation violation", "expunction",
      "expungement", "nondisclosure",
    ],
    steps: [
      {
        id: "status",
        title: "Where do things stand?",
        fields: [
          {
            name: "stage",
            label: "Are you…",
            type: "radio",
            options: ["Charged", "Under investigation", "Not sure"],
            required: true,
          },
          { name: "chargeType", label: "Charge type (if known)", type: "text" },
          { name: "chargeCounty", label: "County", type: "text" },
          { name: "court", label: "Which court is the case in? (if known)", type: "text", placeholder: "e.g., County Criminal Court No. 3, Tarrant County", help: COURT_HELP_CRIMINAL },
        ],
      },
      {
        id: "custody",
        title: "Custody and court",
        fields: [
          { name: "inCustody", label: "Are you or your loved one currently in custody?", type: "yesno" },
          { name: "bondStatus", label: "Bond status (if known)", type: "text" },
          { name: "courtDate", label: "Upcoming court date", type: "date" },
        ],
      },
    ],
  },
  {
    id: "estate",
    label: "Estate planning (wills, trusts & POAs)",
    blurb: "I want to plan ahead",
    practiceSlug: "estate-succession-planning",
    summaryNoun: "an estate planning matter",
    keywords: [
      "estate", "estate plan", "estate planning", "estate planning attorney", "plan ahead", "when i die",
      "leave to my kids", "beneficiary", "inherit", "inheritance plan", "succession", "farm", "ranch",
      // wills
      "last will", "last will and testament", "make a will", "standard will", "simple will",
      "update my will", "new will", "holographic will",
      // trusts
      "trust", "living trust", "revocable living trust", "revocable trust", "testamentary trust",
      "special needs trust", "spendthrift trust", "trust agreement", "trustee",
      // powers of attorney & directives
      "power of attorney", "poa", "durable power of attorney", "financial power of attorney",
      "statutory durable power of attorney", "medical power of attorney", "health care power of attorney",
      "directive to physicians", "living will", "advance directive", "hipaa", "hipaa release", "hipaa authorization",
      // deeds & guardianship
      "transfer on death", "transfer on death deed", "tod deed", "lady bird deed", "enhanced life estate deed",
      "guardian", "guardianship", "declaration of guardian", "disposition of remains",
    ],
    commonOverrides: {
      conflict: {
        id: "conflict",
        title: "Who else is involved?",
        subtitle:
          "Just so we can run a conflicts check. List the people who would be part of your plan — spouse, children, beneficiaries, family members, or anyone who might have an adverse interest. Leave blank if you are not sure.",
        fields: [
          {
            name: "opposingParty",
            label: "Family members, beneficiaries, or other interested parties",
            type: "textarea",
            placeholder: "e.g., spouse, children, beneficiaries, business partners, other family",
          },
        ],
      },
      urgency: {
        id: "urgency",
        title: "Is there a deadline?",
        subtitle: "A deadline or time concern tells us how quickly we need to move.",
        fields: [
          { name: "hasDeadline", label: "Do you have a deadline or time-sensitive concern?", type: "yesno" },
          { name: "deadline", label: "If so, what date?", type: "date" },
        ],
      },
    },
    steps: [
      // 1) The document picker — grouped "bubbles" in a fixed, logical order:
      //    Estate Planning › Wills › Trusts › Powers of Attorney › Deeds & Guardianship.
      // 0) How deep does the client want to go today?
      {
        id: "depth",
        title: "How would you like to start?",
        subtitle: "Either way, a licensed attorney reviews everything — nothing is final today.",
        fields: [
          {
            name: "estateDepth",
            label: "Choose one",
            type: "radio",
            required: true,
            options: [ESTATE_DEPTH.FULL, ESTATE_DEPTH.BASIC],
            help: "The comprehensive path walks through the same questionnaire we use to prepare drafts (about 10–15 minutes). The basic path just captures who you are and what you need.",
          },
        ],
      },
      {
        id: "documents",
        title: "What would you like to set up?",
        subtitle: "Check every document you need — you can combine them. Not sure? Check the last box and we'll recommend a plan.",
        fields: [
          { name: "docsWill", label: "Wills", type: "checklist", options: [EP.WILL] },
          { name: "docsTrust", label: "Trusts", type: "checklist", options: [EP.LIVING_TRUST, EP.TEST_TRUST] },
          {
            name: "docsPoa",
            label: "Powers of Attorney & Health Directives",
            type: "checklist",
            options: [EP.FIN_POA, EP.MED_POA, EP.DIRECTIVE, EP.HIPAA],
          },
          { name: "docsOther", label: "Deeds & Guardianship", type: "checklist", options: [EP.LADYBIRD, EP.GUARDIAN_DECL] },
          { name: "docsNotSure", label: "Help me decide", type: "checklist", options: [EP.NOT_SURE] },
        ],
      },
      // 2) Testator / principal — the person the documents are for (every doc needs this).
      {
        id: "testator",
        requireIf: ESTATE_FULL_ONLY,
        title: "About you",
        subtitle: "These details go at the top of every document, exactly as you write them here.",
        fields: [
          { name: "testatorFullName", label: "Your full legal name", type: "text", required: true, placeholder: "First Middle Last", help: "Include your middle name if applicable. Spell it exactly as it should appear in the documents." },
          { name: "testatorAddress", label: "Home (residence) address", type: "address" },
          { name: "testatorPhone", label: "Phone number", type: "text", placeholder: "(000) 000-0000" },
          { name: "testatorCounty", label: "County of residence", type: "text" },
          { name: "testatorDob", label: "Date of birth", type: "date" },
          { name: "maritalStatus", label: "Marital status", type: "radio", options: ["Single", "Married", "Widowed", "Divorced"] },
          { name: "spouseName", label: "Spouse's full legal name", type: "text", showIf: { field: "maritalStatus", equals: "Married" } },
          { name: "everLivedOtherState", label: "Have you ever lived in a state other than Texas?", type: "yesno", help: "This can affect community-property questions; if yes, note where and when in the last step." },
          { name: "priorWill", label: "Do you have a prior will or estate plan?", type: "yesno" },
        ],
      },
      // 3) Family — needed for wills, trusts, and guardian declarations.
      {
        id: "family",
        requireIf: ESTATE_FULL_ONLY,
        title: "Your family",
        subtitle: "Who should the plan provide for or protect?",
        showIf: NEEDS_FAMILY,
        fields: [
          {
            name: "children",
            label: "Children",
            type: "repeater",
            placeholder: "Full name — and date of birth",
            addLabel: "Add another child",
            help: "One per person. Include adopted children; note any from a prior relationship or with special needs.",
          },
          { name: "minorChildren", label: "Do you have minor children (under 18)?", type: "yesno" },
          {
            name: "otherDependents",
            label: "Anyone else you support or want to provide for?",
            type: "repeater",
            placeholder: "Full name and relationship — e.g., a parent or grandchild",
            addLabel: "Add another person",
          },
        ],
      },
      // 4) Will details — also used when a testamentary trust is created in the will.
      {
        id: "willDetails",
        requireIf: ESTATE_FULL_ONLY,
        title: "Your will",
        subtitle: "Who carries it out, and who receives what.",
        showIf: NEEDS_WILL,
        fields: [
          { name: "executors", label: "Executor", type: "party", required: true, max: 4, addLabel: "Add a co-executor", help: "Who administers your estate. Add a co-executor only if more than one will serve together." },
          { name: "executorAlts", label: "Successor executor(s)", type: "party", max: 4, addLabel: "Add a successor executor", help: "Who serves, in order, if the executor above cannot." },
          { name: "guardians", label: "Guardian of minor children", type: "party", max: 2, addLabel: "Add a co-guardian", help: "Co-guardians must be married.", showIf: { field: "minorChildren", equals: "Yes" } },
          { name: "guardianAlts", label: "Alternate guardian(s)", type: "party", max: 2, addLabel: "Add an alternate guardian", showIf: { field: "minorChildren", equals: "Yes" } },
          { name: "minorTrust", label: "Hold a minor child's inheritance in a trust until they're older?", type: "yesno", help: "Recommended so a young child doesn't receive everything outright.", showIf: { field: "minorChildren", equals: "Yes" } },
          { name: "minorTrustees", label: "Trustee of the minor's trust", type: "party", max: 4, addLabel: "Add a co-trustee", showIf: { field: "minorTrust", equals: "Yes" } },
          { name: "minorTrustAge", label: "When should the child receive the property?", type: "text", placeholder: "e.g., at 25; or 1/3 at 25, 1/2 at 30, balance at 35", showIf: { field: "minorTrust", equals: "Yes" } },
          { name: "gifts", label: "Specific gifts (optional)", type: "gifts", addLabel: "Add a specific gift", help: "Particular items or amounts to particular people. Use the + on the right to split one gift between people." },
          { name: "residuary", label: "Residuary estate — who receives everything else", type: "residuary" },
          { name: "funeralWishes", label: "Funeral / burial wishes (optional)", type: "textarea" },
          {
            name: "witnessChoice",
            label: "Witnesses & date of execution",
            type: "radio",
            options: ["Leave blank — fill in by hand at signing", "Enter what I have now"],
            help: "Most wills leave the witnesses and signing date blank to complete at the signing. If you already know the witnesses, you can enter their names and contact info now and they'll be inserted into the attestation.",
          },
          { name: "witnesses", label: "Witnesses", type: "party", max: 3, addLabel: "Add a witness", showIf: { field: "witnessChoice", equals: "Enter what I have now" } },
          { name: "executionDate", label: "Date of execution (optional)", type: "date", showIf: { field: "witnessChoice", equals: "Enter what I have now" } },
        ],
      },
      // 5) Trust details — living and/or testamentary trust.
      {
        id: "trustDetails",
        requireIf: ESTATE_FULL_ONLY,
        title: "Your trust",
        subtitle: "Who manages it and who benefits.",
        showIf: NEEDS_TRUST,
        fields: [
          { name: "trustees", label: "Trustee", type: "party", max: 4, addLabel: "Add a co-trustee", help: "For a living trust this is often you, then a successor." },
          { name: "trusteeAlts", label: "Successor trustee(s)", type: "party", required: true, max: 4, addLabel: "Add a successor trustee", help: "Who takes over on your incapacity or death." },
          { name: "trustBeneficiaries", label: "Trust beneficiaries", type: "residuary" },
          {
            name: "trustDistribution",
            label: "How should beneficiaries receive their shares?",
            type: "radio",
            options: ["Outright", "At certain ages (staggered)", "Held for life (HEMS standard)", "Trustee's discretion"],
          },
          { name: "trustAges", label: "If staggered, at what ages?", type: "text", placeholder: "e.g., 1/3 at 25, 1/2 at 30, balance at 35", showIf: { field: "trustDistribution", equals: "At certain ages (staggered)" } },
          {
            name: "trustFunding",
            label: "Which assets will fund the living trust?",
            type: "textarea",
            placeholder: "List the property to be retitled into the trust (home, accounts, etc.).",
            help: "A living trust only avoids probate for assets actually transferred into it.",
            showIf: { field: "docsTrust", includesAny: [EP.LIVING_TRUST] },
          },
        ],
      },
      // 6) Financial POA.
      {
        id: "financialPoa",
        requireIf: ESTATE_FULL_ONLY,
        title: "Financial power of attorney",
        subtitle: "Who can handle your finances, and which powers they have.",
        showIf: { field: "docsPoa", includesAny: [EP.FIN_POA] },
        fields: [
          { name: "finAgents", label: "Agent (attorney-in-fact)", type: "party", required: true, max: 4, addLabel: "Add a co-agent", help: "Who handles your financial matters. You may name up to four co-agents." },
          { name: "finActing", label: "If you name more than one agent, they may act:", type: "radio", options: ["Independently — any one alone", "Only by majority", "Only by unanimous agreement"], guidance: "This decides how co-agents make decisions when you name more than one. “Independently” lets any one act alone — the most convenient, but with the least oversight. “Majority” or “unanimous” require the agents to agree — more checks, but slower and harder in an emergency. If you name only one agent, this doesn’t apply." },
          { name: "finAlts", label: "Successor agent(s)", type: "party", max: 4, addLabel: "Add a successor agent", help: "Who serves if your agent(s) cannot. Up to four." },
          { name: "finEffective", label: "When should it take effect?", type: "radio", options: ["Immediately", "Only if I become incapacitated (springing)"], guidance: "“Immediately” means your agent can act as soon as you sign — useful if you want help now or in a sudden emergency, and it avoids the delay of proving incapacity. “Springing” means it only takes effect once a doctor certifies you can’t manage your affairs — more protection against early misuse, but slower to invoke when time matters." },
          {
            name: "finPowers",
            label: "Powers granted (Texas statutory durable power of attorney)",
            type: "checklist",
            help: "Check \"All powers\" to grant everything, or check only the specific powers you want to grant.",
            guidance: "These are the categories of financial authority you can hand to your agent. “All powers” grants every category below; otherwise, check only the ones you want the agent to handle. Most people grant broad authority so their agent isn’t blocked in an emergency — but it’s entirely your choice.",
            options: [
              "ALL POWERS (a general grant of every power below)",
              "Real property transactions",
              "Tangible personal property transactions",
              "Stock and bond transactions",
              "Commodity and option transactions",
              "Banking and other financial-institution transactions",
              "Business operating transactions",
              "Insurance and annuity transactions",
              "Estate, trust, and other beneficiary transactions",
              "Claims and litigation",
              "Personal and family maintenance",
              "Benefits from Social Security, Medicare, Medicaid, or other governmental programs",
              "Retirement plan transactions",
              "Tax matters",
              "Digital assets and electronic communications",
            ],
          },
          { name: "finGifts", label: "Gift-giving power", type: "radio", options: ["No gift power", "Limited to the annual gift-tax exclusion", "Broad gift power"], guidance: "Whether your agent may make gifts of your money or property on your behalf. “No gift power” is the safest against misuse. “Limited to the annual gift-tax exclusion” allows modest yearly gifts (often used for tax or Medicaid planning). “Broad gift power” allows larger gifts and is used in some estate-tax planning. If you’re unsure, “No gift power” or the limited option is a sensible default." },
        ],
      },
      // 7) Medical POA / Directive / HIPAA.
      {
        id: "medicalPoa",
        requireIf: ESTATE_FULL_ONLY,
        title: "Health-care documents",
        subtitle: "Who speaks for your care, and your wishes.",
        showIf: { field: "docsPoa", includesAny: [EP.MED_POA, EP.DIRECTIVE, EP.HIPAA] },
        fields: [
          { name: "medAgents", label: "Health-care agent", type: "party", max: 4, addLabel: "Add a co-agent", help: "Who makes medical decisions if you cannot. Must be 18+.", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medAlts", label: "Successor health-care agent(s)", type: "party", max: 4, addLabel: "Add a successor agent", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medLimits", label: "Any limits on your agent's authority?", type: "textarea", help: "Leave blank to grant full authority. Anything entered here is printed as a stated limitation; otherwise blank lines are left for you to fill in by hand.", guidance: "Leave this blank to give your health-care agent full authority to make medical decisions if you cannot speak for yourself — that is what most people do. Only add text here if you want to restrict something specific (for example, a treatment you would never want your agent to authorize).", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medOriginalLocation", label: "Where will the signed original be kept?", type: "text", placeholder: "Defaults to your home address", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medCopyHolders", label: "Individuals / institutions who will hold a signed copy", type: "party", max: 4, addLabel: "Add a copy holder", help: "Usually your agent and alternate. Listed by name and address in the document.", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medEndDate", label: "Does this power of attorney end on a specific date?", type: "text", placeholder: "Leave blank for INDEFINITE (no expiration)", guidance: "Most people leave this blank so the document stays in effect indefinitely until they revoke it. Only enter a date if you specifically want it to expire automatically.", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          {
            name: "lifeSupport",
            label: "Life-support wishes (Directive to Physicians)",
            type: "textarea",
            placeholder: "Your wishes if you have a terminal or irreversible condition.",
            guidance: "This is your directive if you ever have a terminal or irreversible condition and can no longer speak for yourself — for example, whether you would want life-sustaining treatment continued, or withheld so you can pass naturally. There is no right or wrong answer; it simply reflects your personal wishes and beliefs.",
            showIf: { field: "docsPoa", includesAny: [EP.DIRECTIVE] },
          },
          {
            name: "hipaaPeople",
            label: "Who may receive your medical information (HIPAA)?",
            type: "party",
            addLabel: "Add a person",
            help: "Family members or others who should be able to get your records.",
            showIf: { field: "docsPoa", includesAny: [EP.HIPAA] },
          },
        ],
      },
      // 8) Declaration of guardian.
      {
        id: "guardianDeclaration",
        requireIf: ESTATE_FULL_ONLY,
        title: "Declaration of guardian",
        subtitle: "Who you'd want — and not want — if a guardianship ever became necessary.",
        showIf: { field: "docsOther", includesAny: [EP.GUARDIAN_DECL] },
        fields: [
          { name: "guardianPreferred", label: "Preferred guardian(s), in order of choice", type: "party", max: 4, addLabel: "Add another choice" },
          { name: "guardianExcluded", label: "Anyone you do NOT want to serve as your guardian", type: "party", addLabel: "Add a person", help: "A judge cannot appoint a person you exclude here." },
        ],
      },
      // 9) Lady Bird / TOD deed.
      {
        id: "deed",
        requireIf: ESTATE_FULL_ONLY,
        title: "Lady Bird / Transfer-on-Death deed",
        subtitle: "Pass real property at death without probate.",
        showIf: { field: "docsOther", includesAny: [EP.LADYBIRD] },
        fields: [
          { name: "deedProperty", label: "Property address (and legal description if you have it)", type: "textarea", help: "We'll confirm the legal description from the prior deed." },
          { name: "deedGrantee", label: "Who should receive the property at your death?", type: "party", max: 4, addLabel: "Add another grantee" },
        ],
      },
      // 10) Asset inventory — for wills and trusts.
      {
        id: "assets",
        requireIf: ESTATE_FULL_ONLY,
        title: "Your assets",
        subtitle: "A rough inventory — estimates are fine. This helps us draft and fund the plan.",
        showIf: NEEDS_ASSETS,
        fields: [
          {
            name: "assets",
            label: "What does the estate include?",
            type: "checklist",
            options: [
              "Home / residence",
              "Other real estate / land / farm",
              "Bank / investment accounts",
              "Retirement accounts (IRA/401k)",
              "Life insurance",
              "Business interest",
              "Vehicles",
              "Valuable personal property",
            ],
          },
          {
            name: "beneficiaryDesignations",
            label: "Do any accounts already name a beneficiary (POD/TOD, retirement, life insurance)?",
            type: "yesno",
            help: "Those pass outside the will — good to flag so the plan is consistent.",
          },
          { name: "estimatedValue", label: "Approximate total estate value", type: "select", options: ["Under $100,000", "$100,000–$500,000", "$500,000–$2M", "$2M–$5M", "Over $5M", "Not sure"] },
        ],
      },
    ],
  },
  {
    id: "probate",
    label: "Probate / inheritance issue",
    blurb: "Someone passed away",
    practiceSlug: "probate",
    summaryNoun: "a probate matter",
    keywords: [
      "probate", "probate a will", "inheritance", "died", "passed away", "death", "executor",
      "administrator", "heir", "heirs", "will contest", "contest a will", "estate dispute", "inherit",
      "no will", "intestate", "muniment of title", "letters testamentary", "dependent administration",
      "determination of heirship", "estate of",
    ],
    commonOverrides: {
      conflict: involvedStep(
        "Heirs, executor, or other interested parties",
        "e.g., siblings, other heirs, the named executor",
      ),
      urgency: SOFT_URGENCY,
    },
    steps: [
      {
        id: "death",
        title: "About the estate",
        fields: [
          { name: "deathDate", label: "Date of death", type: "date" },
          { name: "deathCounty", label: "County", type: "text", help: "Probate is usually filed in the Texas county where the person lived when they passed away." },
          { name: "willExists", label: "Is there a will?", type: "yesno" },
          { name: "originalLocated", label: "Has the original will been located?", type: "yesno" },
        ],
      },
      {
        id: "estate",
        title: "Size and disputes",
        fields: [
          {
            name: "estateSize",
            label: "Estimated estate size",
            type: "select",
            options: ["Under $100,000", "$100,000–$500,000", "$500,000–$2M", "Over $2M", "Not sure"],
          },
          { name: "disputes", label: "Are there disputes among heirs?", type: "yesno" },
        ],
      },
    ],
  },
  {
    id: "business",
    label: "Business matter",
    blurb: "Formation, contracts, or a dispute",
    practiceSlug: "business-related-matters",
    summaryNoun: "a business matter",
    keywords: [
      "business", "llc", "corporation", "incorporate", "company", "form a company", "formation",
      "operating agreement", "bylaws", "partnership agreement", "contract", "contract review",
      "draft a contract", "vendor", "buy a business", "sell a business", "business sale", "succession",
      "shareholder", "member dispute", "business dispute", "commercial dispute", "commercial litigation",
      "non-compete", "deal", "transaction",
    ],
    commonOverrides: {
      conflict: involvedStep(
        "Other parties involved (partners, counterparties, or the other side of a dispute)",
        "e.g., business partner, vendor, the other company",
      ),
      urgency: SOFT_URGENCY,
    },
    steps: [
      {
        id: "type",
        title: "What do you need?",
        fields: [
          {
            name: "businessNeed",
            label: "Type of matter",
            type: "radio",
            options: ["Formation", "Contract", "Dispute", "Succession"],
            required: true,
          },
          { name: "entityType", label: "Entity type & stage", type: "text", placeholder: "e.g., new LLC, existing corporation" },
          { name: "counterpart", label: "Counterparty (if any)", type: "text" },
          { ...amountField(), label: "Approximate amount in controversy (for a dispute)", showIf: { field: "businessNeed", equals: "Dispute" } },
        ],
      },
    ],
  },
  {
    id: "creditor",
    label: "Foreclosure / garnishment / receivership",
    blurb: "My property or accounts are at risk",
    practiceSlug: "garnishments",
    alsoPractices: ["foreclosures", "receivership-matters"],
    summaryNoun: "a foreclosure, garnishment, or receivership matter",
    keywords: [
      "foreclosure", "foreclose", "foreclosure sale", "sale date", "save my house", "my house",
      "garnishment", "garnished", "wages garnished", "bank account frozen", "frozen account", "levy",
      "writ", "writ of garnishment", "receiver", "receivership", "turnover", "post-judgment",
      "judgment collection", "they froze my account", "property seized", "seizure",
    ],
    steps: [
      {
        id: "which",
        title: "Which situation?",
        fields: [
          {
            name: "matterType",
            label: "This is about…",
            type: "radio",
            options: ["Foreclosure", "Garnishment", "Receivership"],
            required: true,
          },
          {
            name: "stage",
            label: "Stage",
            type: "text",
            placeholder: "Notice received? Sale date set? Writ served?",
          },
          { name: "court", label: "Court that issued the order (if known)", type: "text", placeholder: "e.g., 348th District Court, Tarrant County", help: COURT_HELP },
          { ...amountField(), label: "Approximate amount in controversy (debt, judgment, or property at risk)" },
        ],
      },
    ],
  },
  {
    id: "appeal",
    label: "Appeal",
    blurb: "I lost and want to appeal",
    practiceSlug: "appellate-law",
    summaryNoun: "an appeal",
    keywords: [
      "appeal", "appeal a judgment", "appellate", "lost", "lost my case", "lost at trial",
      "judgment against me", "reverse", "overturn", "court of appeals", "supersedeas",
      "supersedeas bond", "notice of appeal", "motion for new trial", "appeal deadline", "deadline",
    ],
    steps: [
      {
        id: "trial",
        title: "About the judgment",
        fields: [
          { name: "trialCourt", label: "Trial court & county", type: "text", required: true, help: COURT_HELP },
          {
            name: "judgmentDate",
            label: "Date of the judgment",
            type: "date",
            help: "Appellate deadlines are short — this helps us flag urgency.",
          },
          { name: "representedAtTrial", label: "Were you represented at trial?", type: "yesno" },
        ],
      },
    ],
  },
  {
    id: "other",
    label: "Something else / not sure",
    blurb: "I just need to talk to someone",
    practiceSlug: "business-related-matters",
    summaryNoun: "a legal matter",
    keywords: [
      "other", "not sure", "unsure", "help", "question", "general", "general question", "advice",
      "need advice", "talk to a lawyer", "consultation", "don't know", "something else", "legal question",
    ],
    commonOverrides: {
      conflict: involvedStep(
        "Anyone else involved (optional)",
        "If your matter involves another person or business, list them",
      ),
      urgency: SOFT_URGENCY,
    },
    steps: [
      {
        id: "describe",
        title: "Tell us what is going on",
        fields: [
          {
            name: "description",
            label: "Describe your situation",
            type: "textarea",
            required: true,
            placeholder: "In a few sentences.",
          },
        ],
      },
    ],
  },
];

/* ----------------------- entry-screen matching ------------------------- */
/*
 * The bubble filter used to be a loose Fuse.js fuzzy search (threshold 0.4,
 * ignoreLocation), which produced embarrassing results: "real estate" matched
 * "Estate planning" (the word "estate") AND fuzzily hit unrelated labels like
 * "Criminal charge or investigation". This replaces it with a deterministic,
 * phrase-aware scorer:
 *   - whole multi-word phrases score highest ("real estate", "slip and fall"),
 *   - then exact keyword words, then the label, then a tight prefix/one-typo
 *     allowance — no cross-field fuzzing.
 * Only strong matches show, and secondary hits far below the top score are
 * dropped, so the user sees the one or two branches that actually fit — or a
 * clean "nothing matched" rather than a wrong guess.
 */

/** Generic words ignored when scoring (so "my", "need a lawyer", etc. don't
 *  match everything). "will" is here on purpose — as a bare word it's the verb
 *  far more often than the document; real will requests match via phrases. */
const MATCH_STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "is", "am", "are", "was", "were",
  "be", "been", "being", "it", "its", "this", "that", "these", "those", "my", "me", "mine", "we", "us",
  "our", "you", "your", "they", "them", "their", "he", "she", "his", "her", "do", "does", "did", "have",
  "has", "had", "get", "got", "getting", "give", "going", "gonna", "want", "wants", "wanted", "need",
  "needs", "needed", "about", "with", "without", "someone", "somebody", "anyone", "people", "person",
  "please", "just", "really", "very", "legal", "lawyer", "lawyers", "attorney", "attorneys", "law",
  "matter", "matters", "case", "cases", "issue", "issues", "help", "thing", "things", "something",
  "anything", "advice", "question", "questions", "consultation", "general", "not", "sure", "know",
  "some", "any", "how", "what", "when", "where", "who", "why", "can", "could", "would", "should",
  "will", "if", "so", "but", "because", "over", "into", "out", "up", "down", "there",
]);

/** Extra multi-word triggers that should match as PHRASES only (they don't add
 *  their individual words to a branch's word set, so common terms like "estate"
 *  in "real estate" don't leak into the wrong branch). Kept here rather than in
 *  the editable keyword lists to keep those clean. */
const EXTRA_PHRASES: Record<string, string[]> = {
  estate: [
    "a will", "my will", "the will", "need a will", "make a will", "write a will", "draft a will",
    "update my will", "get a will", "power of attorney", "living will", "plan my estate",
    "leave my house to", "leave everything to",
  ],
  probate: ["no will", "will contest", "contest a will", "contesting a will", "without a will", "died without"],
  business: [
    "real estate", "real property", "real estate dispute", "commercial lease", "lease agreement",
    "earnest money", "purchase agreement", "buy a business", "sell a business", "non compete",
    "business dispute", "buy a house", "sell a house", "buying a house", "selling a house",
    "buying property", "selling property", "closing on a house",
    "small business", "my business", "start a business", "new business", "open a business",
  ],
  sue: [
    "boundary dispute", "property dispute", "property line", "title dispute", "quiet title",
    "adverse possession", "breach of contract", "owes me money", "not paying me",
    "lied about me", "spreading lies",
  ],
  criminal: ["criminal charge", "under investigation", "charged with", "warrant for my arrest"],
  injured: ["car accident", "car wreck", "slip and fall", "hit by a car", "loved one died"],
  creditor: ["about to lose my house", "foreclosure sale", "wages garnished", "froze my account"],
  appeal: ["lost my case", "lost at trial", "appeal a judgment", "notice of appeal"],
  sued: ["being sued", "served with papers", "notice to vacate", "default judgment"],
};

function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Meaningful words from a string: length ≥ 3 and not a stop word. */
function contentTokens(s: string): string[] {
  return normText(s).split(" ").filter((t) => t.length >= 3 && !MATCH_STOP.has(t));
}

/** True when the edit distance between a and b is ≤ 1 (one typo). */
function within1Edit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  if (i < la || j < lb) edits++;
  return edits <= 1;
}

type BranchLex = { branch: Branch; phrases: string[]; words: Set<string>; labelWords: Set<string> };

const BRANCH_LEX: BranchLex[] = BRANCHES.map((b) => {
  const phrases: string[] = [];
  const words = new Set<string>();
  for (const raw of b.keywords ?? []) {
    const p = normText(raw);
    if (!p) continue;
    const parts = p.split(" ");
    if (parts.length > 1) phrases.push(p);
    for (const w of parts) if (w.length >= 3 && !MATCH_STOP.has(w)) words.add(w);
  }
  for (const p of EXTRA_PHRASES[b.id] ?? []) { const n = normText(p); if (n) phrases.push(n); }
  const labelWords = new Set<string>();
  for (const w of normText(b.label).split(" ")) if (w.length >= 3 && !MATCH_STOP.has(w) && !words.has(w)) labelWords.add(w);
  return { branch: b, phrases, words, labelWords };
});

/**
 * Rank the intake branches for a free-text query. Returns the branches that
 * genuinely fit, best first (empty when nothing matches well). Scoring:
 *   phrase hit = 4 + 2×words · exact keyword word = 4 · label word = 2 ·
 *   prefix or one-typo on a keyword word = 2. Only branches at or above both a
 *   floor and 60% of the top score are returned, so weak/irrelevant hits drop.
 */
export function rankBranches(query: string, limit = 4): Branch[] {
  const scored = scoreBranches(query);
  if (!scored.length) return [];
  const top = scored[0].score;
  // A scatter of weak, equal single-token hits (no phrase, no clear leader) means
  // the query is genuinely ambiguous — show the "nothing matched, start a general
  // consultation" prompt instead of a row of wrong guesses.
  if (top <= 4 && scored.filter((s) => s.score === top).length >= 3) return [];
  // Keep only branches close to the leader so a strong match doesn't drag along
  // unrelated secondary hits.
  const cut = Math.max(4, top * 0.75);
  return scored.filter((x) => x.score >= cut).slice(0, limit).map((x) => x.branch);
}

/** Raw per-branch scores, best first (score > 0 only). Exported for tuning/tests. */
export function scoreBranches(query: string): { branch: Branch; score: number }[] {
  const norm = normText(query);
  if (!norm) return [];
  const padded = ` ${norm} `;
  const tokens = [...new Set(contentTokens(query))];
  const scored: { branch: Branch; score: number }[] = [];

  for (const lex of BRANCH_LEX) {
    let score = 0;
    for (const p of lex.phrases) if (padded.includes(` ${p} `)) score += 4 + 2 * p.split(" ").length;
    for (const t of tokens) {
      if (lex.words.has(t)) { score += 4; continue; }
      if (lex.labelWords.has(t)) { score += 2; continue; }
      let soft = 0;
      for (const w of lex.words) {
        if (w.length >= 4 && t.length >= 4 && (w.startsWith(t) || t.startsWith(w))) { soft = 2; break; }
        if (w.length >= 5 && t.length >= 5 && within1Edit(t, w)) { soft = 2; break; }
      }
      score += soft;
    }
    if (score > 0) scored.push({ branch: lex.branch, score });
  }
  scored.sort((a, b) => b.score - a.score || BRANCHES.indexOf(a.branch) - BRANCHES.indexOf(b.branch));
  return scored;
}

/**
 * Every free-text (textarea) field across all flows, as {name, label} — used to
 * render ALL of a submission's narrative answers (their words, timeline, injuries,
 * etc.) in the summary email, not just one, so nothing gets lost.
 */
export const NARRATIVE_FIELDS: { name: string; label: string }[] = (() => {
  const seen = new Map<string, string>();
  const add = (step: Step) => {
    for (const f of step.fields) if (f.type === "textarea" && !seen.has(f.name)) seen.set(f.name, f.label);
  };
  for (const s of COMMON_STEPS) add(s);
  for (const b of BRANCHES) {
    for (const s of b.steps) add(s);
    if (b.commonOverrides) for (const s of Object.values(b.commonOverrides)) add(s);
  }
  return [...seen.entries()].map(([name, label]) => ({ name, label }));
})();

/** Every question across all flows, in the order they're asked — name → label.
 *  Used to present answers to the intake team with clear labels, in a logical
 *  order, instead of raw field keys. */
export const INTAKE_FIELDS: { name: string; label: string; type: FieldType }[] = (() => {
  const seen = new Map<string, { label: string; type: FieldType }>();
  const order: string[] = [];
  const add = (step: Step) => {
    for (const f of step.fields) if (!seen.has(f.name)) { seen.set(f.name, { label: f.label, type: f.type }); order.push(f.name); }
  };
  for (const s of COMMON_STEPS) add(s);
  for (const b of BRANCHES) {
    for (const s of b.steps) add(s);
    if (b.commonOverrides) for (const s of Object.values(b.commonOverrides)) add(s);
  }
  return order.map((name) => ({ name, ...seen.get(name)! }));
})();

const FIELD_LABEL_MAP = new Map(INTAKE_FIELDS.map((f) => [f.name, f.label]));

/** Human label for an answer key, falling back to a prettified key. */
export function fieldLabel(name: string): string {
  return FIELD_LABEL_MAP.get(name) ?? name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/** Format any answer value into one clean, human-readable string — people
 *  (name/phone/address), addresses, gifts, residuary shares, files, lists. */
export function formatAnswerValue(v: unknown): string {
  const personLine = (p: Person): string => {
    const addr = formatAddress(p) || (typeof p?.address === "string" ? p.address.trim() : "");
    return [p?.name?.trim(), p?.phone?.trim(), addr].filter(Boolean).join(" — ");
  };
  const fmtObj = (o: Record<string, unknown>): string => {
    if ("street" in o || "city" in o || "state" in o || "zip" in o) return formatAddress(o as Address);
    if ("item" in o && "to" in o) { const g = o as Gift; return `${String(g.item ?? "").trim()} → ${(g.to ?? []).map(personLine).filter(Boolean).join(", ")}`; }
    if ("shares" in o) {
      const rv = o as ResiduaryValue;
      const sh = (rv.shares ?? []).filter((s) => s.person?.name?.trim());
      if (!sh.length) return "";
      return rv.even ? `Equal shares: ${sh.map((s) => personLine(s.person)).join("; ")}` : sh.map((s) => `${(s.percent || "?").toString().trim()}% — ${personLine(s.person)}`).join("; ");
    }
    if ("person" in o) return personLine((o as ResShare).person);
    if ("name" in o) return personLine(o as Person);
    return "";
  };
  if (v == null) return "";
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    if (v.every((x) => x && typeof x === "object" && "url" in (x as object))) return (v as IntakeFile[]).map((f) => f.name || f.url).join("; ");
    return v.map((x) => (x && typeof x === "object" ? fmtObj(x as Record<string, unknown>) : String(x))).filter((s) => s.trim()).join("  |  ");
  }
  if (typeof v === "object") return fmtObj(v as Record<string, unknown>);
  return String(v).trim();
}

export function getBranch(id: string): Branch | undefined {
  return BRANCHES.find((b) => b.id === id);
}

/**
 * The kind of attorney a turned-back prospect should be pointed to, tailored to
 * the practice area of their intake (e.g. a probate intake → "a probate
 * attorney"). Maps by practice slug, with a keyword fallback so future or
 * renamed branches still resolve sensibly.
 */
export function turnbackAreaForBranch(branchId: string): string {
  const b = getBranch(branchId);
  switch (b?.practiceSlug) {
    case "consumer-debt-defense": return "a consumer-debt-defense or civil attorney";
    case "garnishments": return "a consumer-debt or civil attorney";
    case "plaintiffs-litigation": return "a civil litigation attorney";
    case "business-related-matters": return "a business or civil attorney";
    case "personal-injury": return "a personal injury attorney";
    case "wrongful-death": return "a wrongful death attorney";
    case "foreclosures": return "a foreclosure or consumer-debt attorney";
    case "criminal-defense": return "a criminal defense attorney";
    case "estate-succession-planning": return "an estate planning attorney";
    case "probate": return "a probate attorney";
    case "appellate-law": return "an appellate attorney";
    case "family-law": return "a family law attorney";
  }
  const hay = `${b?.label ?? ""} ${b?.practiceSlug ?? ""} ${branchId}`.toLowerCase();
  if (/divorce|family|custody|child\s*support|adoption/.test(hay)) return "a family law attorney";
  if (/probate|inherit/.test(hay)) return "a probate attorney";
  if (/estate|will|trust/.test(hay)) return "an estate planning attorney";
  if (/criminal|dwi|dui/.test(hay)) return "a criminal defense attorney";
  if (/injur|wreck|accident|wrongful/.test(hay)) return "a personal injury attorney";
  if (/appeal|appellate/.test(hay)) return "an appellate attorney";
  if (/debt|garnish|foreclos|collection/.test(hay)) return "a civil or consumer-debt attorney";
  return "a civil attorney";
}

export function branchForPractice(slug: string): Branch | undefined {
  return (
    BRANCHES.find((b) => b.practiceSlug === slug) ??
    BRANCHES.find((b) => b.alsoPractices?.includes(slug))
  );
}
