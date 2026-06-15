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
};

export type Step = {
  id: string;
  title: string;
  subtitle?: string;
  fields: Field[];
};

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
          { name: "courtNamed", label: "Court named on the papers (if known)", type: "text" },
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
    label: "Estate planning (will / trust / POA)",
    blurb: "I want to plan ahead",
    practiceSlug: "estate-succession-planning",
    summaryNoun: "an estate planning matter",
    keywords: [
      "will", "last will", "make a will", "trust", "living trust", "estate plan", "estate planning",
      "power of attorney", "poa", "medical power of attorney", "directive", "living will", "advance directive",
      "guardian", "guardianship", "beneficiary", "inherit", "inheritance plan", "succession", "farm",
      "ranch", "land", "transfer on death", "lady bird deed", "plan ahead", "when i die", "leave to my kids",
      "estate planning attorney",
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
      {
        id: "household",
        title: "Tell us about your household",
        fields: [
          { name: "maritalStatus", label: "Single or married?", type: "radio", options: ["Single", "Married"] },
          { name: "children", label: "Children (names/ages optional)", type: "textarea" },
          { name: "priorWill", label: "Do you have a prior will?", type: "yesno" },
        ],
      },
      {
        id: "assets",
        title: "What does the estate include?",
        subtitle: "Check what applies. Rough is fine.",
        fields: [
          {
            name: "assets",
            label: "Assets",
            type: "checklist",
            options: ["Home", "Land / farm", "Business", "Bank / investment accounts", "Retirement accounts", "Other"],
          },
          { name: "executor", label: "Executor preference", type: "text" },
          { name: "guardian", label: "Guardian preference (if minor children)", type: "text" },
          { name: "wishes", label: "Special wishes", type: "textarea" },
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
          { name: "deathCounty", label: "County", type: "text" },
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
          { name: "trialCourt", label: "Trial court & county", type: "text", required: true },
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
