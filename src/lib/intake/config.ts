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
  | "yesno";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  help?: string;
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

function oneCondMet(c: Condition, answers: Record<string, string | string[]>): boolean {
  const v = answers[c.field];
  if (c.includesAny) {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    return c.includesAny.some((x) => arr.includes(x));
  }
  if (c.equals !== undefined) return v === c.equals;
  return Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim());
}

/** True when the condition (or any condition in the array) is satisfied. */
export function condMet(
  cond: Condition | Condition[] | undefined,
  answers: Record<string, string | string[]>,
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
          { name: "amountClaimed", label: "Amount claimed (if stated)", type: "text", placeholder: "$" },
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
      "contractor", "bad contractor", "unpaid invoice", "collect", "deceptive trade", "dtpa",
      "consumer protection", "lemon", "warranty", "negligence",
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
        ],
      },
      {
        id: "stakes",
        title: "What is at stake?",
        fields: [
          {
            name: "amount",
            label: "Approximate amount at issue",
            type: "select",
            options: ["Under $25,000", "$25,000–$100,000", "$100,000–$500,000", "$500,000–$1M", "Over $1M", "Not sure"],
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
    practiceSlug: "personal-injury-wrongful-death",
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
          { name: "incidentDate", label: "Date of the incident", type: "date" },
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
          { name: "court", label: "If a lawsuit has already been filed, which court?", type: "text", placeholder: "e.g., 141st District Court, Tarrant County", help: COURT_HELP },
        ],
      },
    ],
  },
  {
    id: "criminal",
    label: "Criminal charge or investigation",
    blurb: "I'm facing the State",
    practiceSlug: "criminal-defense",
    summaryNoun: "a criminal matter",
    keywords: [
      "criminal", "crime", "arrested", "arrest", "charged", "charge", "criminal charge", "dwi", "dui",
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
      "leave to my kids", "beneficiary", "inherit", "inheritance plan", "succession", "farm", "ranch", "land",
      // wills
      "will", "last will", "last will and testament", "make a will", "standard will", "simple will",
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
        title: "About you",
        subtitle: "These details go at the top of every document, exactly as you write them here.",
        fields: [
          { name: "testatorFullName", label: "Your full legal name", type: "text", required: true, help: "Spell it exactly as it should appear in the documents." },
          { name: "testatorAddress", label: "Home (residence) address", type: "text", placeholder: "Street, City, Texas, ZIP" },
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
        title: "Your family",
        subtitle: "Who should the plan provide for or protect?",
        showIf: NEEDS_FAMILY,
        fields: [
          {
            name: "children",
            label: "Children",
            type: "textarea",
            placeholder: "One per line: full name, date of birth, and note if from a prior relationship.",
            help: "Include adopted children. Note any with special needs.",
          },
          { name: "minorChildren", label: "Do you have minor children (under 18)?", type: "yesno" },
          {
            name: "otherDependents",
            label: "Anyone else you support or want to provide for?",
            type: "textarea",
            placeholder: "e.g., a parent, grandchild, or other dependent",
          },
        ],
      },
      // 4) Will details — also used when a testamentary trust is created in the will.
      {
        id: "willDetails",
        title: "Your will",
        subtitle: "Who carries it out, and who receives what.",
        showIf: NEEDS_WILL,
        fields: [
          { name: "executor", label: "Executor (who administers your estate)", type: "text", required: true, help: "Full name and relationship to you." },
          { name: "executorAlt1", label: "First alternate executor", type: "text" },
          { name: "executorAlt2", label: "Second alternate executor", type: "text" },
          { name: "guardianMinor", label: "Guardian for minor children", type: "text", help: "Co-guardians must be married. Leave blank if not applicable." },
          { name: "guardianMinorAlt", label: "Alternate guardian for minor children", type: "text" },
          {
            name: "specificGifts",
            label: "Specific gifts",
            type: "textarea",
            placeholder: "e.g., \"My truck to John Smith.\" One per line. Leave blank if none.",
            help: "Particular items or dollar amounts to particular people.",
          },
          { name: "residuaryBeneficiary", label: "Who receives everything else (the residue)?", type: "textarea", placeholder: "e.g., \"All to my children who survive me, in equal shares.\"" },
          { name: "residuaryAlternate", label: "If they don't survive you, then to whom?", type: "textarea" },
          { name: "funeralWishes", label: "Funeral / burial wishes (optional)", type: "textarea" },
        ],
      },
      // 5) Trust details — living and/or testamentary trust.
      {
        id: "trustDetails",
        title: "Your trust",
        subtitle: "Who manages it and who benefits.",
        showIf: NEEDS_TRUST,
        fields: [
          { name: "trustee", label: "Trustee (who manages the trust)", type: "text", help: "For a living trust this is often you, then a successor." },
          { name: "successorTrustee", label: "Successor trustee", type: "text", required: true, help: "Who takes over on your incapacity or death." },
          { name: "trustBeneficiaries", label: "Trust beneficiaries", type: "textarea", placeholder: "Who benefits, and in what shares." },
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
        title: "Financial power of attorney",
        subtitle: "Who can handle your finances, and when.",
        showIf: { field: "docsPoa", includesAny: [EP.FIN_POA] },
        fields: [
          { name: "finAgent", label: "Agent (attorney-in-fact)", type: "text", required: true, help: "The person who will handle your financial matters." },
          { name: "finAgentAlt", label: "Alternate agent", type: "text" },
          { name: "finEffective", label: "When should it take effect?", type: "radio", options: ["Immediately", "Only if I become incapacitated (springing)"] },
          { name: "finScope", label: "Scope of authority", type: "radio", options: ["All powers (general)", "Limited — I'll specify"] },
          { name: "finScopeLimits", label: "If limited, which powers?", type: "textarea", showIf: { field: "finScope", equals: "Limited — I'll specify" } },
          { name: "finGifts", label: "Gift-giving power", type: "radio", options: ["No gift power", "Limited to annual exclusion", "Broad gift power"] },
        ],
      },
      // 7) Medical POA / Directive / HIPAA.
      {
        id: "medicalPoa",
        title: "Health-care documents",
        subtitle: "Who speaks for your care, and your wishes.",
        showIf: { field: "docsPoa", includesAny: [EP.MED_POA, EP.DIRECTIVE, EP.HIPAA] },
        fields: [
          { name: "medAgent", label: "Health-care agent", type: "text", help: "Who makes medical decisions if you cannot. Must be 18+.", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medAgentAlt", label: "Alternate health-care agent", type: "text", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          { name: "medLimits", label: "Any limits on your agent's authority?", type: "textarea", showIf: { field: "docsPoa", includesAny: [EP.MED_POA] } },
          {
            name: "lifeSupport",
            label: "Life-support wishes (Directive to Physicians)",
            type: "textarea",
            placeholder: "Your wishes if you have a terminal or irreversible condition.",
            showIf: { field: "docsPoa", includesAny: [EP.DIRECTIVE] },
          },
          {
            name: "hipaaRecipients",
            label: "Who may receive your medical information (HIPAA)?",
            type: "textarea",
            placeholder: "Family members or others who should be able to get your records.",
            showIf: { field: "docsPoa", includesAny: [EP.HIPAA] },
          },
        ],
      },
      // 8) Declaration of guardian.
      {
        id: "guardianDeclaration",
        title: "Declaration of guardian",
        subtitle: "Who you'd want — and not want — if a guardianship ever became necessary.",
        showIf: { field: "docsOther", includesAny: [EP.GUARDIAN_DECL] },
        fields: [
          { name: "guardianPreferred", label: "Preferred guardian(s), in order of choice", type: "textarea" },
          { name: "guardianExcluded", label: "Anyone you do NOT want to serve as your guardian", type: "textarea", help: "A judge cannot appoint a person you exclude here." },
        ],
      },
      // 9) Lady Bird / TOD deed.
      {
        id: "deed",
        title: "Lady Bird / Transfer-on-Death deed",
        subtitle: "Pass real property at death without probate.",
        showIf: { field: "docsOther", includesAny: [EP.LADYBIRD] },
        fields: [
          { name: "deedProperty", label: "Property address (and legal description if you have it)", type: "textarea", help: "We'll confirm the legal description from the prior deed." },
          { name: "deedGrantee", label: "Who should receive the property at your death?", type: "text" },
        ],
      },
      // 10) Asset inventory — for wills and trusts.
      {
        id: "assets",
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
        ],
      },
    ],
  },
  {
    id: "creditor",
    label: "Foreclosure / garnishment / receivership",
    blurb: "My property or accounts are at risk",
    practiceSlug: "garnishments",
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
          { name: "amounts", label: "Amounts involved", type: "text", placeholder: "$" },
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

export function getBranch(id: string): Branch | undefined {
  return BRANCHES.find((b) => b.id === id);
}

export function branchForPractice(slug: string): Branch | undefined {
  return BRANCHES.find((b) => b.practiceSlug === slug);
}
