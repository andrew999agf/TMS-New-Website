import type { TrainingModule } from "./types";

/**
 * The training catalog. Order here is the order within each category on the
 * index. To add a module later, append a new TrainingModule object; to start a
 * new section, give it a new category (and add that category to
 * TRAINING_CATEGORIES in ./types). Content for the Handbook and Data Security
 * modules is summarized from the firm's own manuals; the Intern and Wills
 * modules are introductory overviews written for internal training.
 */
export const TRAINING_MODULES: TrainingModule[] = [
  /* ---------------------------------------------------------------- *
   * 1. Intern Onboarding & Orientation
   * ---------------------------------------------------------------- */
  {
    slug: "intern-orientation",
    title: "Intern Onboarding & Orientation",
    category: "Onboarding",
    audience: "Interns",
    summary:
      "Your first-day overview: who we are, what's expected of you, and how to work safely and professionally at the firm.",
    estMinutes: 15,
    updated: "January 2025",
    lessons: [
      {
        id: "welcome",
        title: "Welcome to T. Maxwell Smith, PLLC",
        blocks: [
          {
            type: "paragraph",
            text: "Welcome to the team. As an intern you play a real role in our work, and what you do here directly affects our clients. This short module orients you to the firm and the basics you need before you start.",
          },
          { type: "heading", text: "Our mission and values" },
          {
            type: "paragraph",
            text: "**Mission:** To provide comprehensive legal solutions that protect Texas families and businesses while upholding the highest standards of legal excellence and ethical practice.",
          },
          {
            type: "list",
            items: [
              "**Integrity** — we stay true to our word and hold the highest ethical standards in every interaction.",
              "**Client-first focus** — we understand each client's needs and act in their best interest.",
              "**Community leadership** — we contribute to our Texas communities.",
              "**Professional excellence** — we keep advancing our knowledge to serve clients well.",
            ],
          },
        ],
      },
      {
        id: "your-role",
        title: "Your Role as an Intern",
        blocks: [
          {
            type: "paragraph",
            text: "Interns and law clerks work **under the supervision of an attorney**. Your job is to support the legal team — research, drafting, organizing files, and similar tasks — always with an attorney reviewing the work.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "Never give legal advice",
            text: "Non-attorney staff must not give legal advice or tell a client what they should do. If a client asks for advice, take a message and route it to the supervising attorney.",
          },
          {
            type: "list",
            items: [
              "Work only on tasks assigned or approved by your supervising attorney.",
              "Maintain clear boundaries — you are not the client's lawyer.",
              "When you are unsure about anything, ask before you act.",
            ],
          },
        ],
      },
      {
        id: "conduct",
        title: "Professionalism & Conduct",
        blocks: [
          {
            type: "paragraph",
            text: "We keep a professional, respectful workplace. Treat colleagues, clients, and vendors with courtesy, and communicate professionally in person, by email, and on the phone.",
          },
          { type: "heading", text: "Attendance" },
          {
            type: "paragraph",
            text: "Arrive on time and ready to work. If you will be late or absent, notify your supervisor as early as possible.",
          },
          { type: "heading", text: "Dress code" },
          {
            type: "paragraph",
            text: "Dress is generally **business casual** for clerks in the office, and **court attire** (full professional dress) for any court appearance or formal meeting. When in doubt, err on the side of more professional. No athletic wear, flip-flops, torn clothing, or offensive graphics.",
          },
        ],
      },
      {
        id: "confidentiality-basics",
        title: "Confidentiality from Day One",
        blocks: [
          {
            type: "paragraph",
            text: "Everything you see and hear at the firm is confidential — including the simple fact that someone is a client. Confidentiality applies to interns exactly as it does to everyone else, during and after your time here.",
          },
          {
            type: "list",
            items: [
              "Do not discuss client matters outside the office or in public areas.",
              "Never post about firm or client matters on social media.",
              "Keep documents secure and follow a clean-desk habit.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Go deeper",
            text: "The \"Data Security & Confidentiality\" module covers this in full — please complete it early in your internship.",
          },
        ],
      },
      {
        id: "tools",
        title: "Timekeeping & Tools",
        blocks: [
          {
            type: "paragraph",
            text: "Accurate timekeeping matters for billing and compliance. Record your work using the firm's **Time Tracker** (in this same admin portal) as instructed by your supervisor.",
          },
          { type: "heading", text: "Using firm technology" },
          {
            type: "list",
            items: [
              "Use firm-provided devices and accounts for firm business only.",
              "Don't install unauthorized software or use personal email for firm work.",
              "Lock your screen when you step away.",
            ],
          },
        ],
      },
      {
        id: "getting-help",
        title: "Getting Help",
        blocks: [
          {
            type: "paragraph",
            text: "When you have a question, ask — that is exactly what we want from an intern. Start with your supervising attorney or the person who assigned the task.",
          },
          {
            type: "paragraph",
            text: "For ethics or confidentiality questions, you can reach the **Ethics and Confidentiality Compliance Officer**, Thomas Maxwell Smith, at max@texaslawsmith.com or (817) 475-5522.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * 2. Employee Handbook
   * ---------------------------------------------------------------- */
  {
    slug: "employee-handbook",
    title: "Employee Handbook",
    category: "Firm Policies",
    audience: "All staff",
    summary:
      "The firm's core employment policies — conduct, pay and benefits, safety, technology, and separation — in a quick-reference format.",
    estMinutes: 25,
    updated: "January 2025",
    sourceNote: "Based on the T. Maxwell Smith, PLLC Employee Handbook (rev. 01/2025; effective December 29, 2024).",
    lessons: [
      {
        id: "welcome-intro",
        title: "Welcome & Introduction",
        blocks: [
          {
            type: "paragraph",
            text: "This handbook explains the firm's policies, procedures, and expectations. It is a resource — not a contract or a guarantee of continued employment — and policies may change at the firm's discretion.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Employment at will",
            text: "Employment with T. Maxwell Smith, PLLC is \"at-will\": either you or the firm may end the employment relationship at any time, with or without cause or notice.",
          },
        ],
      },
      {
        id: "employment-info",
        title: "Employment Information",
        blocks: [
          { type: "heading", text: "Job classifications" },
          {
            type: "list",
            items: [
              "**Full-time** is 40 hours/week; **part-time** is fewer than 40.",
              "**Exempt** employees are not eligible for overtime under the FLSA; **non-exempt** employees are.",
            ],
          },
          { type: "heading", text: "Eligibility & records" },
          {
            type: "paragraph",
            text: "Employees must provide documentation establishing eligibility to work in the U.S. The firm keeps personnel records for payroll, benefits, and compliance, limits access to those with a business need, and handles personal information with care. Tell management promptly when your personal information (address, phone, emergency contacts) changes.",
          },
        ],
      },
      {
        id: "conduct",
        title: "Workplace Expectations & Conduct",
        blocks: [
          {
            type: "list",
            items: [
              "Treat colleagues, clients, and vendors with courtesy, respect, and professionalism.",
              "Communicate professionally in every channel.",
              "Arrive on time; notify your supervisor as soon as possible if you'll be late or absent.",
            ],
          },
          { type: "heading", text: "Dress code" },
          {
            type: "paragraph",
            text: "Standards vary by office and day — from Business Professional and Business Casual to Rural Professional and Smart Casual, with **Court Attire** for court and meetings. All clothing must be clean, pressed, and in good repair; no athletic wear, flip-flops, torn clothing, or offensive graphics.",
          },
          { type: "heading", text: "Company property & social media" },
          {
            type: "paragraph",
            text: "Use company property and resources for work purposes, and report damage promptly. On social media, never disclose confidential or proprietary information or speak for the firm without authorization.",
          },
        ],
      },
      {
        id: "comp-benefits",
        title: "Compensation & Benefits",
        blocks: [
          { type: "heading", text: "Pay & overtime" },
          {
            type: "paragraph",
            text: "Pay is biweekly (pay periods run Friday–Thursday; paychecks every other Friday). Direct deposit is available. Non-exempt employees earn overtime at 1.5× for hours over 40 in a workweek, and **overtime must be pre-approved**.",
          },
          { type: "heading", text: "Timekeeping" },
          {
            type: "paragraph",
            text: "Record work hours in the firm's designated timekeeping system. Falsifying or tampering with time records is a serious violation.",
          },
          { type: "heading", text: "Leave" },
          {
            type: "list",
            items: [
              "Full-time employees accrue paid vacation/personal days based on tenure (none in the first 6 months, 5 days at 6–30 months, 10 days at 36+ months), rolling over up to 20 days max.",
              "Full-time employees receive 3 paid sick days/year (no rollover); notify your supervisor by 8:00 AM on the day of illness.",
              "Request time off in writing — 2 weeks ahead for 3+ consecutive days, 1 week ahead for 1–2 days.",
              "Paid holidays (full-time) follow the Texas State Court schedule: New Year's Day, Memorial Day, Independence Day, Thanksgiving, Christmas Eve, and Christmas Day.",
            ],
          },
        ],
      },
      {
        id: "performance-safety",
        title: "Performance, Safety & Security",
        blocks: [
          {
            type: "paragraph",
            text: "Expect periodic performance reviews and ongoing feedback. The firm supports development through on-the-job training, workshops, and internal mentoring, and promotes from within where possible.",
          },
          { type: "heading", text: "Safety" },
          {
            type: "list",
            items: [
              "Follow safety protocols and report hazards immediately.",
              "In an emergency: evacuate for fire, call 911 for medical emergencies, and shelter as directed in severe weather.",
              "Report any workplace injury — however minor — to a supervisor right away.",
              "The firm has a zero-tolerance policy for workplace violence, threats, and unauthorized weapons.",
            ],
          },
        ],
      },
      {
        id: "technology",
        title: "Technology & Communication",
        blocks: [
          {
            type: "list",
            items: [
              "Use company technology for business purposes; avoid unauthorized software and non-work sites.",
              "Keep email professional; don't share confidential information unless authorized.",
              "Use strong passwords, lock devices when not in use, and never share login credentials.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Suspicious emails",
            text: "If you receive a suspicious email, do NOT open it or any links/attachments. Take a photo of the email in your inbox and report it to your supervisor immediately.",
          },
        ],
      },
      {
        id: "separation",
        title: "Employee Separation",
        blocks: [
          {
            type: "paragraph",
            text: "If you resign, the firm requests written notice — four weeks for attorneys, two weeks for other employees — though the firm may accept a resignation effective immediately.",
          },
          {
            type: "list",
            items: [
              "Involuntary termination may occur for performance, policy violations, or business needs.",
              "Final paychecks follow applicable law; all company property (keys, badges, equipment, documents) must be returned by the last working day.",
              "Exit interviews are voluntary but encouraged and kept confidential.",
            ],
          },
        ],
      },
      {
        id: "acknowledgment",
        title: "Acknowledgment & Amendments",
        blocks: [
          {
            type: "paragraph",
            text: "Employees may be asked to sign an acknowledgment confirming they have received, read, and understood the handbook and agree to follow its policies. The firm may revise the handbook at any time and will communicate changes; it is each employee's responsibility to stay informed.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Mark this module complete",
            text: "Completing this module records that you have read and understood the handbook summary. Use the button at the bottom of the page.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * 3. Data Security & Confidentiality
   * ---------------------------------------------------------------- */
  {
    slug: "data-security-confidentiality",
    title: "Data Security & Confidentiality",
    category: "Firm Policies",
    audience: "All staff",
    summary:
      "How we protect client and firm information — confidentiality rules, legal ethics, safe use of AI, cybersecurity, and reporting.",
    estMinutes: 25,
    updated: "January 2025",
    sourceNote: "Based on Company Policies Related to Confidentiality and Legal Ethics, T. Maxwell Smith, PLLC (rev. 01/2025).",
    lessons: [
      {
        id: "why",
        title: "Why Confidentiality Matters",
        blocks: [
          {
            type: "paragraph",
            text: "Protecting client information is the foundation of legal practice and our highest priority. These policies apply to **everyone** affiliated with the firm — full- and part-time employees, interns, and contractors — during and after your association with the firm.",
          },
          {
            type: "list",
            items: [
              "Safeguard client information and proprietary firm data.",
              "Comply with the ethics rules governing the legal profession.",
              "Use firm resources responsibly and report violations.",
            ],
          },
        ],
      },
      {
        id: "what-is-confidential",
        title: "What Is Confidential Information",
        blocks: [
          {
            type: "paragraph",
            text: "Confidential information is any non-public information you learn through your work with the firm. It includes, but is not limited to:",
          },
          { type: "heading", text: "Client information" },
          {
            type: "list",
            items: [
              "The fact of representation itself, and client identity and contact information.",
              "Case details, strategies, and work product.",
              "Financial and billing records, attorney–client communications, and settlement terms.",
            ],
          },
          { type: "heading", text: "Firm information" },
          {
            type: "list",
            items: [
              "Internal policies, financial data, and business strategies.",
              "Personnel and employment records.",
              "Technology systems and security protocols, and internal communications.",
            ],
          },
        ],
      },
      {
        id: "handling",
        title: "Handling Confidential Information",
        blocks: [
          { type: "heading", text: "Physical security" },
          {
            type: "list",
            items: [
              "Store confidential documents in locked cabinets; shred with firm-approved equipment.",
              "Keep a clean desk at end of day; never remove client files from firm premises without written authorization.",
              "Escort visitors in areas where confidential information is stored.",
            ],
          },
          { type: "heading", text: "Electronic security" },
          {
            type: "list",
            items: [
              "Password-protect all devices; use multi-factor authentication for remote access.",
              "Encrypt confidential information you transmit electronically.",
              "Never use personal email for firm business; get IT approval before using any cloud storage.",
            ],
          },
          { type: "heading", text: "Communication" },
          {
            type: "list",
            items: [
              "Don't discuss confidential matters in elevators, hallways, or public areas.",
              "Use speakerphone and video calls only in private spaces.",
              "Social-media posts about firm or client matters are strictly prohibited.",
            ],
          },
        ],
      },
      {
        id: "ethics",
        title: "Legal Ethics Essentials",
        blocks: [
          {
            type: "paragraph",
            text: "All staff must follow the professional-conduct standards of the State Bar of Texas. Non-attorney staff have specific duties:",
          },
          {
            type: "list",
            items: [
              "Work only under appropriate attorney supervision.",
              "Maintain clear boundaries — do not give legal advice.",
              "Report ethical concerns to a supervising attorney and complete required ethics training.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Conflicts of interest",
            text: "Every new matter requires a conflicts check before engagement. Report any potential conflict as soon as you identify it.",
          },
        ],
      },
      {
        id: "firm-resources",
        title: "Using Firm Resources Responsibly",
        blocks: [
          {
            type: "paragraph",
            text: "Firm technology, equipment, and information resources are provided for business use. Prohibited activities include:",
          },
          {
            type: "list",
            items: [
              "Installing unauthorized software or disabling security measures.",
              "Sharing passwords or access credentials, or storing firm data on personal devices without authorization.",
              "Sharing access to legal-research platforms or violating licensing agreements.",
              "Accessing information without a business need, or misusing client billing information.",
            ],
          },
        ],
      },
      {
        id: "ai",
        title: "Using AI Safely",
        blocks: [
          {
            type: "paragraph",
            text: "AI tools can help with research and drafting, but they are **assistants, not replacements for legal judgment**, and many platforms store what you give them. Treat AI like a knowledgeable colleague whose work must always be fact-checked.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "Never share these with an AI tool in their original form",
            text: "Client names and identifying info, protected health information, financial account details, Social Security numbers, non-public case numbers, settlement details, trade secrets, and proprietary business information.",
          },
          { type: "heading", text: "Anonymize before you use AI" },
          {
            type: "list",
            ordered: true,
            items: [
              "Create a secure \"legend\" (a code book) mapping real names to anonymous references like \"Individual A\" / \"Company B.\"",
              "Replace names, then less-obvious identifiers — cities, specific dates, dollar amounts, product names.",
              "Re-read and ask: \"Could someone figure out who this is about?\" Watch for combinations of details that identify someone.",
            ],
          },
          {
            type: "list",
            items: [
              "Never use AI to confirm final legal conclusions, verify case citations, or provide definitive strategy.",
              "Independently verify every citation and legal principle against primary sources, and document your verification.",
            ],
          },
        ],
      },
      {
        id: "cybersecurity",
        title: "Data Security & Cybersecurity",
        blocks: [
          {
            type: "list",
            items: [
              "Use strong passwords and change them regularly.",
              "Lock computers and devices when not in use.",
              "Don't share login credentials or access unauthorized systems.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Phishing",
            text: "If you receive a suspicious email, do NOT open it or any links/attachments. Take a photograph of the email in your inbox and email it to your supervisor immediately.",
          },
        ],
      },
      {
        id: "reporting",
        title: "Reporting Violations",
        blocks: [
          {
            type: "list",
            items: [
              "Report suspected breaches immediately to the Ethics and Confidentiality Compliance Officer; submit written documentation within 24 hours.",
              "Data breaches, trust-account irregularities, and filing-deadline issues require immediate (often same-day) reporting.",
              "The firm maintains a strict **non-retaliation** policy for good-faith reports.",
            ],
          },
          {
            type: "paragraph",
            text: "Ethics and Confidentiality Compliance Officer: **Thomas Maxwell Smith** — max@texaslawsmith.com, (817) 475-5522.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * 4. Introduction to Drafting Wills
   * ---------------------------------------------------------------- */
  {
    slug: "drafting-wills-intro",
    title: "Introduction to Drafting Wills",
    category: "Legal Skills",
    audience: "Clerks & staff",
    summary:
      "A plain-English primer on Texas wills — key terms, validity requirements, the parts of a will, and how we draft them at the firm.",
    estMinutes: 20,
    updated: "January 2025",
    lessons: [
      {
        id: "overview",
        title: "What a Will Does",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "This module is a general introduction for firm staff, not legal advice. All estate-planning work is performed under the supervision of, and signed off by, a licensed attorney.",
          },
          {
            type: "paragraph",
            text: "A **will** is a legal document that directs how a person's property is distributed after death and names who will carry out those wishes. The person making the will is the **testator**.",
          },
          { type: "heading", text: "Key terms" },
          {
            type: "list",
            items: [
              "**Executor** — the person appointed to administer the estate.",
              "**Beneficiary** — a person or entity who receives property under the will.",
              "**Devise / bequest** — a gift of property made in a will.",
              "**Residuary estate** — whatever is left after specific gifts are distributed.",
              "**Probate** — the court process for validating a will and administering the estate.",
            ],
          },
        ],
      },
      {
        id: "validity",
        title: "Texas Requirements for a Valid Will",
        blocks: [
          {
            type: "paragraph",
            text: "Under the Texas Estates Code, a typical (attested) will is valid when:",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "The testator has **testamentary capacity** (is of sound mind) and is **18 or older**, married, or a member of the armed forces.",
              "The will is **in writing**.",
              "It is **signed by the testator** (or by another person at the testator's direction and in their presence).",
              "It is **attested by two credible witnesses age 14+** who sign in the testator's presence.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Two special cases",
            text: "A holographic will is one written wholly in the testator's own handwriting and signed by them — no witnesses required. A self-proving affidavit (signed before a notary) lets the will be admitted to probate without live witness testimony.",
          },
        ],
      },
      {
        id: "components",
        title: "Core Components of a Will",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Identification & declaration** — names the testator and declares the document to be their will.",
              "**Revocation of prior wills** — revokes earlier wills and codicils.",
              "**Appointment of an executor** — ideally an **independent executor** serving **without bond** to simplify administration.",
              "**Guardian for minor children** — names a guardian where applicable.",
              "**Specific gifts** — particular items or amounts to named beneficiaries.",
              "**Residuary clause** — disposes of everything not specifically gifted.",
              "**Signature & attestation** — testator and witnesses sign.",
              "**Self-proving affidavit** — notarized statement attached to the will.",
            ],
          },
        ],
      },
      {
        id: "considerations",
        title: "Common Provisions & Considerations",
        blocks: [
          {
            type: "list",
            items: [
              "**Independent administration** — Texas strongly favors it; it keeps the estate out of heavy court supervision.",
              "**Per stirpes vs. per capita** — how a deceased beneficiary's share passes to their descendants.",
              "**Contingent beneficiaries** — who inherits if a primary beneficiary predeceases the testator.",
              "**Simultaneous death / survivorship** — clauses addressing near-simultaneous deaths.",
              "**Digital assets** — authority for the executor to access online accounts.",
            ],
          },
        ],
      },
      {
        id: "workflow",
        title: "The Drafting Workflow at Our Firm",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Open the matter and run a **conflicts check** before any work begins.",
              "Gather client information — full legal name, family, assets, and intended beneficiaries.",
              "Use the firm's **approved templates**; never start from an unvetted internet form.",
              "Prepare a draft for the **supervising attorney's review** — do not finalize anything without sign-off.",
              "Plan the **execution ceremony**: testator and two witnesses sign together, plus a notary for the self-proving affidavit.",
              "Store the executed original securely and note its location in the file.",
            ],
          },
        ],
      },
      {
        id: "pitfalls",
        title: "Pitfalls & Ethics",
        blocks: [
          {
            type: "callout",
            tone: "warning",
            title: "Unauthorized practice of law",
            text: "Non-attorney staff must not advise clients on what their will should say or which options to choose. Gather information and prepare drafts; route all legal questions to the attorney.",
          },
          {
            type: "list",
            items: [
              "Watch for signs of diminished capacity or undue influence and raise them with the attorney.",
              "Accuracy is critical — a misspelled name or wrong amount can defeat a gift.",
              "Keep every client detail confidential, consistent with the firm's confidentiality policy.",
              "Nothing is final until the supervising attorney has reviewed and approved it.",
            ],
          },
        ],
      },
    ],
  },
];

/** All modules. */
export function getModules(): TrainingModule[] {
  return TRAINING_MODULES;
}

/** Look up a module by slug. */
export function getModule(slug: string): TrainingModule | undefined {
  return TRAINING_MODULES.find((m) => m.slug === slug);
}
