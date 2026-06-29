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
   * Estate Planning (Wills & Trusts) — a multi-part series. Each sub-module ends
   * "Check your understanding" review. Introductory training only; all
   * estate-planning work is performed under attorney supervision.
   * ---------------------------------------------------------------- */
  {
    slug: "wills-1-foundations",
    title: "Wills 1 — Foundations & Key Terms",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "What a will is and does, the vocabulary you'll use every day, and how a will fits alongside other estate-planning documents.",
    estMinutes: 12,
    updated: "January 2025",
    lessons: [
      {
        id: "what-a-will-does",
        title: "What a Will Does",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "This series is a general introduction for firm staff, not legal advice. Non-attorney staff gather information and prepare drafts; a licensed attorney reviews and signs off on all work.",
          },
          {
            type: "paragraph",
            text: "A **will** (formally a \"last will and testament\") is a legal document in which a person directs how their property should be distributed after death and names the people who will carry out those wishes and care for any minor children.",
          },
          {
            type: "paragraph",
            text: "If someone dies **without** a valid will, they die **intestate**, and Texas's intestacy statutes — not the person's own wishes — decide who inherits. A central reason clients come to us is to take that decision back into their own hands.",
          },
          {
            type: "list",
            items: [
              "Directs **who** receives **what** property.",
              "Names an **executor** to administer the estate.",
              "Can name a **guardian** for minor children.",
              "Can set up simple trusts for young or vulnerable beneficiaries.",
            ],
          },
        ],
      },
      {
        id: "key-terms",
        title: "Key Terms",
        blocks: [
          {
            type: "list",
            items: [
              "**Testator** — the person making the will.",
              "**Executor** — the person appointed to administer the estate; an **independent executor** can act with minimal court supervision.",
              "**Beneficiary** — a person or entity who receives property under the will.",
              "**Devise / bequest** — a gift of property made in a will.",
              "**Residuary estate** — everything left after specific gifts and debts; the **residuary clause** says who gets it.",
              "**Probate** — the court process that validates the will and oversees administration.",
              "**Intestate** — dying without a valid will.",
              "**Codicil** — a formal amendment to an existing will.",
              "**Guardian** — the person named to care for minor children (or their property).",
            ],
          },
        ],
      },
      {
        id: "types-and-related-docs",
        title: "Types of Wills & Related Documents",
        blocks: [
          { type: "heading", text: "Two common will formats in Texas" },
          {
            type: "list",
            items: [
              "**Attested will** — typed, signed by the testator, and witnessed by two people. This is what we prepare in almost every case.",
              "**Holographic will** — written entirely in the testator's own handwriting and signed; no witnesses required. Valid in Texas but rarely the right choice for planning.",
            ],
          },
          { type: "heading", text: "Documents that are NOT a will" },
          {
            type: "paragraph",
            text: "Clients often lump these together with a will. They are separate documents (often prepared in the same engagement) and a will does not do their job:",
          },
          {
            type: "list",
            items: [
              "**Durable power of attorney** — handles finances during life.",
              "**Medical power of attorney** and **directive to physicians (living will)** — handle health-care decisions during life.",
              "**Living trust** — a separate vehicle that can avoid probate for the assets placed in it.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "What happens to a person's property if they die without a valid will in Texas?", a: "They die \"intestate,\" and the Texas intestacy statutes decide who inherits — not the deceased's personal wishes." },
              { q: "What is the difference between a specific bequest and the residuary estate?", a: "A specific bequest is a particular gift to a named beneficiary; the residuary estate is everything left over after specific gifts and debts, distributed under the residuary clause." },
              { q: "Name two documents that are often prepared with a will but are not part of it.", a: "Any two of: durable (financial) power of attorney, medical power of attorney, directive to physicians/living will, or a living trust." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "wills-2-validity",
    title: "Wills 2 — Texas Validity Requirements",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "The legal requirements that make a Texas will valid — capacity, the signing formalities, holographic wills, self-proving affidavits, and revoking old wills.",
    estMinutes: 14,
    updated: "January 2025",
    lessons: [
      {
        id: "capacity-age",
        title: "Testamentary Capacity & Age",
        blocks: [
          {
            type: "paragraph",
            text: "To make a valid will the testator must have **testamentary capacity** and meet an **age/status** requirement.",
          },
          {
            type: "paragraph",
            text: "**Testamentary capacity** means that, at the time of signing, the testator is of sound mind: they understand they are making a will, generally know the nature and extent of their property, know the people who would normally inherit (the \"natural objects of their bounty\"), and can connect these together to form a plan.",
          },
          {
            type: "paragraph",
            text: "**Age/status:** the testator must be **18 or older**, **or** be (or have been) married, **or** be a member of the U.S. armed forces.",
          },
        ],
      },
      {
        id: "formalities",
        title: "Signing Formalities (Attested Will)",
        blocks: [
          {
            type: "paragraph",
            text: "A typical attested will is valid when all of the following are met:",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "It is **in writing**.",
              "It is **signed by the testator** (or by another person at the testator's direction and in their presence).",
              "It is **attested by two credible witnesses age 14 or older** who sign their names in the testator's presence.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Witness best practice",
            text: "Use witnesses who are not beneficiaries. A gift to a witness can be voided, even though the will itself may still be valid. Our execution ceremony uses neutral witnesses.",
          },
        ],
      },
      {
        id: "holographic",
        title: "Holographic Wills",
        blocks: [
          {
            type: "paragraph",
            text: "A **holographic will** is written **wholly in the testator's own handwriting** and signed by them. Because it is in the testator's hand, it needs **no witnesses**.",
          },
          {
            type: "paragraph",
            text: "These come up when a client brings in a handwritten document, but we generally prepare formal attested wills — they are clearer, harder to challenge, and can be made self-proving.",
          },
        ],
      },
      {
        id: "self-proving-revocation",
        title: "Self-Proving Affidavits & Revocation",
        blocks: [
          { type: "heading", text: "Self-proving affidavit" },
          {
            type: "paragraph",
            text: "A **self-proving affidavit** is a notarized statement, signed by the testator and witnesses, attached to the will. It lets the will be admitted to probate **without** the witnesses having to appear in court later. We attach one to virtually every will.",
          },
          { type: "heading", text: "Revoking a prior will" },
          {
            type: "list",
            items: [
              "By a **later will or codicil** that revokes the earlier one (every will we draft begins by revoking prior wills).",
              "By a **physical act** — the testator destroying or canceling the will with intent to revoke.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "How many witnesses must sign an attested Texas will, and what is the minimum age?", a: "Two credible witnesses, each at least 14 years old, signing in the testator's presence." },
              { q: "Why do we attach a self-proving affidavit to the will?", a: "So the will can be admitted to probate without the witnesses having to testify in court later." },
              { q: "Why should witnesses generally not be beneficiaries?", a: "A gift to a witness can be voided. Using neutral, non-beneficiary witnesses protects the gifts in the will." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "wills-3-client-information",
    title: "Wills 3 — Gathering Client Information",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "How to run a wills intake using the firm's Will Preparation Questionnaire — the people, the assets, the will provisions, and the full document menu.",
    estMinutes: 20,
    updated: "January 2025",
    lessons: [
      {
        id: "preparing",
        title: "Preparing for the Interview",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Use the firm's questionnaire",
            text: "We collect intake on the firm's \"Client Will Preparation Questionnaire.\" Send it to the client ahead of the meeting; it is the backbone of everything below.",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "**Run/confirm the conflicts check** before substantive work — especially when a married couple is represented together.",
              "**Send the Will Preparation Questionnaire** in advance and ask the client to gather deeds, account statements, beneficiary designations, and any prior will.",
              "**Set expectations** — the attorney makes the legal decisions; you are gathering information.",
              "**Choose a private setting** — wills involve sensitive family and financial details.",
            ],
          },
        ],
      },
      {
        id: "the-people",
        title: "The People: Client & Family",
        blocks: [
          { type: "heading", text: "Client information" },
          {
            type: "list",
            items: [
              "Full legal **name** and **address**, and **phone numbers** (home/office/fax).",
              "**Ever lived in a state other than Texas?** Note where and when — it can raise community-property questions for the attorney.",
            ],
          },
          { type: "heading", text: "Marital history" },
          {
            type: "list",
            items: [
              "**Currently married** — spouse's name and date of marriage.",
              "**Widowed** — deceased spouse's name, date of death, residence at death, and whether they left a will (get a copy).",
              "**Divorced** — ex-spouse's name, date and place of divorce (the decree can matter).",
            ],
          },
          { type: "heading", text: "Children & dependents" },
          {
            type: "list",
            items: [
              "List each child (born or adopted): **name, date of birth, address, and whether living**.",
              "Note **which children are from a prior marriage** (blended families need care).",
              "Note **anyone else the client supports** financially (e.g., a grandchild or parent).",
            ],
          },
        ],
      },
      {
        id: "the-assets",
        title: "The Assets",
        blocks: [
          {
            type: "paragraph",
            text: "Work through the questionnaire's asset categories. You're building a working inventory, not appraising.",
          },
          {
            type: "list",
            items: [
              "**Real property** — residence and any other property: address, date acquired, and mortgage balance.",
              "**Cash** — on hand, plus savings/bank accounts (institution, amount, name on account).",
              "**Business interests** — describe any ownership.",
              "**Life insurance** — company, policy number, insured, and face amount.",
              "**Retirement plans / IRAs** — institution, amount, name on account, and **beneficiary**.",
              "**Vehicles** (including boats and trailers) — make, ID number, owner, amount owing.",
              "**Furniture, household goods, personal effects** — list items of particular sentimental or economic value.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Flag non-probate assets",
            text: "Life insurance and retirement accounts with a named beneficiary pass OUTSIDE the will. Capture the beneficiary and flag these for the attorney — a will does not override a beneficiary designation.",
          },
        ],
      },
      {
        id: "will-provisions",
        title: "Will Provisions",
        blocks: [
          { type: "heading", text: "Fiduciaries" },
          {
            type: "list",
            items: [
              "**Executor** — primary plus **first and second alternates** (name, address, relationship).",
              "**Guardian** for minor children — primary plus an alternate (name, address, relationship). **Co-guardians must be married.**",
            ],
          },
          { type: "heading", text: "Beneficiaries" },
          {
            type: "list",
            items: [
              "**Personal property** — who receives which items; for a clean plan, use a class gift (e.g., \"all to my children who survive me in equal shares\") rather than itemizing.",
              "**Other assets** — specific gifts of other property.",
              "**Rest of estate (residue)** — who receives everything else; always give **alternates**.",
            ],
          },
          {
            type: "paragraph",
            text: "Also capture any **funeral / burial instructions** (and remind the client to tell next of kin).",
          },
        ],
      },
      {
        id: "document-menu",
        title: "The Estate-Planning Document Menu",
        blocks: [
          {
            type: "paragraph",
            text: "Most clients should consider these companion documents at the same time as the will. Note the client's choices and route them to the attorney:",
          },
          {
            type: "list",
            items: [
              "**Statutory Durable Power of Attorney** — agent handles finances/property; effective immediately or on incapacity.",
              "**Medical (Health Care) Power of Attorney** — agent makes health-care decisions on certified incapacity.",
              "**Directive to Physicians (living will)** — instructions on life support if terminally ill; may appoint an agent (optional).",
              "**Appointment of Agent to Control Disposition of Remains** — who controls the remains (and is financially responsible).",
              "**Declaration of Guardian** — names who should (and should NOT) serve if a guardianship ever arises.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Default order if no declaration",
            text: "Without a Declaration of Guardian, a court appoints a guardian in this order: (1) spouse, (2) parent, (3) adult child, (4) adult sibling, (5) other qualified person. The declaration lets the client choose instead.",
          },
        ],
      },
      {
        id: "interview-and-handoff",
        title: "Interview Technique & Handoff",
        blocks: [
          {
            type: "list",
            items: [
              "**Ask open-ended questions** and work from the questionnaire; listen for what's missing.",
              "**Stay neutral** — record the client's wishes; don't steer or react.",
              "**Note your observations** about clarity and that the client appears to act freely (capacity / undue influence) — never diagnose.",
              "**Spell names exactly** as they should appear, and attach documents the client provided.",
              "Keep everything **confidential**, summarize open questions, and **hand the file to the attorney**.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Do not give legal advice",
            text: "If the client asks \"What should I do?\" or \"Is that allowed?\", capture the question and route it to the supervising attorney.",
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "Why does the questionnaire ask whether the client ever lived outside Texas?", a: "Living in another state can raise community-property questions the attorney needs to evaluate." },
              { q: "How many alternates does the questionnaire collect for the executor, and what's the rule for co-guardians?", a: "A primary plus first and second alternate executors; co-guardians must be married to serve together." },
              { q: "Name two companion documents from the firm's document menu besides the will.", a: "Any two of: statutory durable power of attorney, medical power of attorney, directive to physicians, appointment of agent to control disposition of remains, or declaration of guardian." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "wills-4-anatomy",
    title: "Wills 4 — Anatomy of a Will",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "A clause-by-clause tour of a typical will — from the opening declaration through the dispositive gifts to the signature and self-proving affidavit.",
    estMinutes: 14,
    updated: "January 2025",
    lessons: [
      {
        id: "opening",
        title: "Opening: Identification, Declaration & Revocation",
        blocks: [
          {
            type: "list",
            items: [
              "**Identification & declaration** — names the testator and declares the document to be their last will.",
              "**Revocation of prior wills** — revokes all earlier wills and codicils to avoid conflicting documents.",
              "**Family statement** — often identifies the spouse and children so later clauses are unambiguous.",
            ],
          },
        ],
      },
      {
        id: "executor",
        title: "Appointing the Executor",
        blocks: [
          {
            type: "list",
            items: [
              "Names the **executor** and at least one **alternate**.",
              "Requests appointment as **independent executor** to keep administration out of heavy court supervision.",
              "States the executor may serve **without bond**, which saves the estate cost.",
              "Grants the powers the executor needs to manage and distribute the estate.",
            ],
          },
        ],
      },
      {
        id: "guardianship",
        title: "Guardianship for Minor Children",
        blocks: [
          {
            type: "paragraph",
            text: "When the testator has minor children, the will names a **guardian** (and an alternate) to care for them. This is frequently the single most important clause to the client, and it is why young parents come in to make a will.",
          },
        ],
      },
      {
        id: "dispositive",
        title: "Dispositive Provisions",
        blocks: [
          {
            type: "list",
            items: [
              "**Specific gifts** — particular items or dollar amounts to named beneficiaries (e.g., a vehicle, a piece of jewelry, a set sum).",
              "**Residuary clause** — disposes of everything not specifically given. This is the workhorse clause and must always be present so nothing falls into intestacy.",
              "**Contingencies** — what happens if a beneficiary predeceases the testator.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Trusts within a will",
            text: "Gifts to minors are often left in a simple testamentary trust so an adult manages the property until the child reaches an age the testator chooses.",
          },
        ],
      },
      {
        id: "signature-attestation-affidavit",
        title: "Signature, Attestation & Affidavit",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Testator's signature** block.",
              "**Attestation clause** and the two **witness** signature blocks.",
              "**Self-proving affidavit** — notarized statement that lets the will prove itself in probate.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "Why does every will we draft begin by revoking prior wills?", a: "To prevent an older, conflicting will or codicil from competing with the new one." },
              { q: "What does it mean to appoint an executor 'independent' and 'without bond'?", a: "Independent administration keeps the estate out of heavy court supervision, and serving without bond saves the estate the cost of a fiduciary bond." },
              { q: "Why must a will always contain a residuary clause?", a: "It disposes of everything not specifically gifted, so no property is left to pass by intestacy." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "wills-5-provisions",
    title: "Wills 5 — Common Provisions & Considerations",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "The recurring choices that shape a will — independent administration, survivorship, how shares pass to descendants, special situations, and a word on taxes.",
    estMinutes: 14,
    updated: "January 2025",
    lessons: [
      {
        id: "independent-admin",
        title: "Independent Administration & No Bond",
        blocks: [
          {
            type: "paragraph",
            text: "Texas strongly favors **independent administration**, which lets the executor settle the estate with minimal court involvement — faster and far cheaper than dependent administration. Combined with a **no-bond** provision, it is the default we build into wills unless there's a reason not to.",
          },
        ],
      },
      {
        id: "survivorship",
        title: "Survivorship & Simultaneous Death",
        blocks: [
          {
            type: "paragraph",
            text: "A **survivorship clause** requires a beneficiary to outlive the testator by a set period (e.g., 120 hours) to inherit. This avoids property passing through two estates in quick succession and addresses the situation where spouses die in a common accident.",
          },
        ],
      },
      {
        id: "per-stirpes-contingent",
        title: "Per Stirpes, Per Capita & Contingent Beneficiaries",
        blocks: [
          {
            type: "list",
            items: [
              "**Per stirpes** — a deceased beneficiary's share passes down to their descendants (their branch of the family).",
              "**Per capita** — shares are divided equally among the surviving members of a generation.",
              "**Contingent beneficiaries** — who inherits if a primary beneficiary dies first; always confirm a backup so a gift doesn't lapse.",
            ],
          },
        ],
      },
      {
        id: "special-situations",
        title: "Special Situations",
        blocks: [
          {
            type: "list",
            items: [
              "**Minor beneficiaries** — leave property in trust or via the Texas Uniform Transfers to Minors Act rather than outright.",
              "**Blended families** — be precise about which children and step-children take, and in what shares.",
              "**Charitable gifts** — name the organization accurately.",
              "**Pets** — Texas allows a pet trust to fund an animal's care.",
              "**Digital assets** — give the executor authority to access online accounts.",
            ],
          },
        ],
      },
      {
        id: "taxes",
        title: "A Word on Taxes",
        blocks: [
          {
            type: "paragraph",
            text: "**Texas has no state estate or inheritance tax.** A federal estate tax exists but only affects very large estates (a high exemption threshold that changes over time). For most clients, estate tax is not a concern — but never tell a client they have \"no tax issue.\" Tax questions go to the attorney.",
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "Why is independent administration the Texas default we build in?", a: "It lets the executor settle the estate with minimal court supervision, which is faster and much cheaper than dependent administration." },
              { q: "What does a 120-hour survivorship clause accomplish?", a: "It requires a beneficiary to outlive the testator by that period to inherit, avoiding property passing through two estates at once and handling near-simultaneous deaths." },
              { q: "Under 'per stirpes' distribution, what happens to a deceased beneficiary's share?", a: "It passes down to that beneficiary's own descendants (their branch of the family)." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "wills-6-workflow",
    title: "Wills 6 — Drafting & Execution Workflow",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "How a will moves through the firm — from intake to draft, attorney review, the signing ceremony, and proper storage afterward.",
    estMinutes: 12,
    updated: "January 2025",
    lessons: [
      {
        id: "intake-to-draft",
        title: "From Intake to Draft",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Open the matter and confirm the **conflicts check** is clear.",
              "Assemble the intake information and resolve open questions with the attorney.",
              "Prepare the draft from the firm's **approved templates** — never an unvetted internet form.",
              "Double-check that **names, relationships, and amounts** exactly match the intake.",
            ],
          },
        ],
      },
      {
        id: "attorney-review",
        title: "Attorney Review",
        blocks: [
          {
            type: "paragraph",
            text: "Every draft goes to the **supervising attorney** for review before it is finalized. The attorney makes the legal decisions and is responsible for the final document. Nothing is sent to the client or scheduled for signing until the attorney approves it.",
          },
        ],
      },
      {
        id: "execution-ceremony",
        title: "The Execution Ceremony",
        blocks: [
          {
            type: "paragraph",
            text: "Texas wills must be signed with specific formalities. A typical signing:",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "Confirm the testator's identity and that they appear to understand and act freely.",
              "The **testator signs** the will in the presence of **two witnesses**.",
              "The **two witnesses sign** in the testator's presence.",
              "The testator and witnesses sign the **self-proving affidavit** before a **notary**.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Don't break the formalities",
            text: "Everyone should remain present together through the signing. A missed signature, a witness who steps out, or a missing notarization can defeat the will.",
          },
        ],
      },
      {
        id: "after-execution",
        title: "After Execution",
        blocks: [
          {
            type: "list",
            items: [
              "Store the **executed original** securely and record where it is kept in the file.",
              "Provide the client clear instructions on where their will is and how to update it.",
              "Note that wills should be revisited after major life events — marriage, divorce, births, deaths, or big changes in assets.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "Why do we draft from approved templates instead of online forms?", a: "Approved templates are vetted for Texas law and firm standards; unvetted internet forms can be invalid or create errors and liability." },
              { q: "Who signs the will and the self-proving affidavit at the execution ceremony?", a: "The testator and two witnesses sign the will in each other's presence; the testator and witnesses then sign the self-proving affidavit before a notary." },
              { q: "Name two life events that should prompt a client to revisit their will.", a: "Any two of: marriage, divorce, birth/adoption of a child, a death in the family, or a major change in assets." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "wills-7-ethics",
    title: "Wills 7 — Pitfalls, Ethics & UPL",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "The ethical lines and common mistakes to watch for — unauthorized practice of law, capacity and undue-influence red flags, accuracy, and confidentiality.",
    estMinutes: 10,
    updated: "January 2025",
    lessons: [
      {
        id: "upl",
        title: "Unauthorized Practice of Law",
        blocks: [
          {
            type: "callout",
            tone: "warning",
            title: "Staff don't advise",
            text: "Non-attorney staff must not tell a client what their will should say or which options to choose, set fees, or give legal opinions. Gather information, prepare drafts, and route all legal questions to the attorney.",
          },
        ],
      },
      {
        id: "capacity-undue-influence",
        title: "Capacity & Undue-Influence Red Flags",
        blocks: [
          {
            type: "paragraph",
            text: "You are often the first person to interact with the client. Without diagnosing anything, note and raise with the attorney signs such as:",
          },
          {
            type: "list",
            items: [
              "Confusion about their property, family, or what they're signing.",
              "A third party answering for the client, pushing changes, or refusing to let the client meet privately.",
              "Sudden, dramatic changes that benefit a new or unexpected person.",
            ],
          },
        ],
      },
      {
        id: "accuracy-errors",
        title: "Accuracy & Common Errors",
        blocks: [
          {
            type: "list",
            items: [
              "**Misspelled or wrong names** — can defeat a gift; spell everything exactly.",
              "**Wrong amounts or shares** that don't add up.",
              "**A missing residuary clause** that sends leftover property to intestacy.",
              "**No alternate** for a beneficiary or fiduciary.",
              "**Execution mistakes** — missing signatures, witnesses, or notarization.",
            ],
          },
        ],
      },
      {
        id: "confidentiality-conflicts",
        title: "Confidentiality & Conflicts",
        blocks: [
          {
            type: "list",
            items: [
              "Everything the client shares is **confidential** — apply the firm's confidentiality policy fully.",
              "Be alert to **conflicts**, especially when representing a couple; raise anything that feels adverse with the attorney.",
              "Nothing is final until the **supervising attorney** has reviewed and approved it.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "Give an example of something that would cross into unauthorized practice of law for staff.", a: "Telling the client what their will should say, advising which option to choose, setting the fee, or giving a legal opinion — instead of routing it to the attorney." },
              { q: "List two red flags that you should raise with the attorney (without diagnosing).", a: "Any two of: client confusion about property/family/the document; a third party pushing changes or preventing a private meeting; sudden dramatic changes favoring a new or unexpected person." },
              { q: "What is the single most common drafting error that can quietly defeat a gift?", a: "A misspelled or incorrect name (or wrong/ambiguous identification of a beneficiary or asset)." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "estate-testamentary-trusts",
    title: "Texas Testamentary Trusts",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "Trusts created inside a will — what they are, why clients use them, how they're structured, and the trustee's powers and duties under Texas law.",
    estMinutes: 18,
    updated: "January 2025",
    lessons: [
      {
        id: "what-it-is",
        title: "What a Testamentary Trust Is",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "A general introduction for firm staff, not legal advice. The attorney drafts and reviews every trust.",
          },
          {
            type: "paragraph",
            text: "A **testamentary trust** is a trust **created by a will**. Unlike a living (inter vivos) trust set up during life, it springs into existence only **at the testator's death**, when the will is probated and the named property passes to the trustee instead of outright to the beneficiary.",
          },
          { type: "heading", text: "The three roles" },
          {
            type: "list",
            items: [
              "**Settlor / testator** — the person whose will creates the trust.",
              "**Trustee** — holds and manages the trust property and makes distributions (governed by the **Texas Trust Code**).",
              "**Beneficiary** — the person the trust is for.",
            ],
          },
        ],
      },
      {
        id: "why-use",
        title: "Why Clients Use One",
        blocks: [
          {
            type: "list",
            items: [
              "**Manage money over time** instead of handing a beneficiary a lump sum.",
              "**Protect minors or young adults** until they're ready (often with staggered ages).",
              "**Spendthrift protection** — shield the inheritance from a beneficiary's creditors or divorce.",
              "**Special-needs planning** — preserve eligibility for government benefits (often coordinated with a separate special needs trust).",
              "**Control and incentives** — tie distributions to a standard and the beneficiary's circumstances.",
              "**Tax / generation-skipping planning** for larger estates.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "It does NOT avoid probate",
            text: "Because a testamentary trust is created by the will, the will must still be probated to fund it. A client whose main goal is avoiding probate may instead want a living trust — that's the attorney's call.",
          },
        ],
      },
      {
        id: "anatomy",
        title: "Creating the Trust in the Will",
        blocks: [
          {
            type: "list",
            items: [
              "The will **sets aside a share** of the estate to \"the Trustee of the [Beneficiary] Testamentary Trust\" rather than to the beneficiary outright.",
              "A **separate trust per beneficiary** is common, so each share is administered independently.",
              "The will **names the trustee and a successor trustee**, and may let the beneficiary serve as their own trustee and appoint or remove successors.",
              "A **survival requirement** (e.g., survive the testator by 30 days) decides whether a share funds the trust or passes to alternates.",
              "The will may **incorporate an existing trust by reference** (for example, a previously executed special needs trust).",
            ],
          },
        ],
      },
      {
        id: "distributions",
        title: "Distribution Standard & Spendthrift",
        blocks: [
          {
            type: "paragraph",
            text: "Most testamentary trusts give the trustee discretion to distribute income and principal under an **ascertainable standard** — commonly **HEMS: Health, Education, Maintenance, and Support**. Undistributed income is typically accumulated and added to principal.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Spendthrift clause",
            text: "A spendthrift provision bars a beneficiary from transferring their interest before they receive it and keeps creditors from reaching it inside the trust — a major reason clients choose trusts over outright gifts.",
          },
          { type: "heading", text: "Distribution considerations" },
          {
            type: "list",
            items: [
              "The trustee may weigh the beneficiary's **other resources**, character and habits, and ability to manage money.",
              "Trusts often let the trustee **withhold** distributions during **substance abuse or incarceration** (incentive provisions).",
              "For a **minor** beneficiary, the trustee can distribute to a custodian under the **Texas Uniform Transfers to Minors Act** or to the person caring for the child.",
            ],
          },
        ],
      },
      {
        id: "trustee-powers",
        title: "Trustee Powers & Duties",
        blocks: [
          { type: "heading", text: "Powers" },
          {
            type: "paragraph",
            text: "The trustee has all powers granted by the **Texas Trust Code**, plus the broad powers the will enumerates — to invest and reinvest, hold real property and mineral interests, run or sell businesses, lend and borrow, and **sell trust property without beneficiary consent**.",
          },
          { type: "heading", text: "Duties" },
          {
            type: "list",
            items: [
              "**Fiduciary duty** — act in good faith, loyally, and impartially among beneficiaries.",
              "**Prudent management** and investment of trust assets.",
              "**Records and accountings** — keep books and report to beneficiaries who request it.",
              "Serve **without bond** when the will so provides, and take **reasonable compensation**.",
            ],
          },
        ],
      },
      {
        id: "lifespan",
        title: "Lifespan, Termination & Special Clauses",
        blocks: [
          {
            type: "list",
            items: [
              "**Duration** — a trust often continues for the beneficiary's lifetime, or until set ages with staggered distributions.",
              "**At the beneficiary's death** — assets typically pass **per stirpes** into trusts for the beneficiary's descendants.",
              "**Limited (special) power of appointment** — a beneficiary may redirect the remaining trust at death, but **never to themselves, their estate, or their creditors**.",
              "**Rule against perpetuities savings clause** — Texas limits how long a trust can last; the will includes language ensuring it ends within the legal period.",
              "**Practical clauses** — terminating small/uneconomical trusts, merging trusts for the same beneficiary, changing the trust's situs, and dividing GST-exempt vs. non-exempt shares.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "When does a testamentary trust come into existence, and does it avoid probate?", a: "At the testator's death, when the will is probated. It does NOT avoid probate — the will must be probated to fund it." },
              { q: "What does the HEMS distribution standard stand for?", a: "Health, Education, Maintenance, and Support — the ascertainable standard the trustee uses to make discretionary distributions." },
              { q: "What does a spendthrift clause do?", a: "It prevents the beneficiary from transferring their interest before receiving it and protects the trust assets from the beneficiary's creditors." },
              { q: "Can a beneficiary with a limited power of appointment leave the trust property to their own creditors?", a: "No. A limited (special) power of appointment cannot be exercised in favor of the beneficiary, their estate, or their creditors." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "estate-lady-bird-deed",
    title: "Lady Bird Deed (Enhanced Life Estate Deed)",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "How a Texas Lady Bird deed lets an owner keep full control of real property during life and pass it at death without probate.",
    estMinutes: 12,
    updated: "January 2025",
    lessons: [
      {
        id: "what-it-is",
        title: "What a Lady Bird Deed Is",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "A general introduction for firm staff, not legal advice. The attorney drafts and reviews every deed.",
          },
          {
            type: "paragraph",
            text: "A **Lady Bird deed** — formally an **Enhanced Life Estate Deed** — is a Texas deed in which the owner (**grantor**) keeps a **life estate** in real property but also retains **enhanced powers** to sell, lease, mortgage, gift, or otherwise dispose of the property during life, and even to cancel the deed — all **without** the consent of the future owner.",
          },
          {
            type: "paragraph",
            text: "The named **grantee** holds only a **remainder interest**. If the grantor still owns the property at death, title passes automatically to the grantee — **outside probate**. If the grantor sold or revoked during life, the grantee gets nothing.",
          },
        ],
      },
      {
        id: "why-use",
        title: "Why Clients Use One",
        blocks: [
          {
            type: "list",
            items: [
              "**Avoids probate** on that specific property — title vests in the remainderman at death.",
              "**Keeps full control during life** — unlike a traditional life estate, the grantor can sell, mortgage, or change their mind freely.",
              "**Homestead & tax exemptions** are preserved during the grantor's life.",
              "Often used for a **homestead** and can support **Medicaid estate-recovery** planning — but whether it's appropriate is the attorney's call.",
            ],
          },
        ],
      },
      {
        id: "anatomy",
        title: "Anatomy of the Deed",
        blocks: [
          {
            type: "list",
            items: [
              "**Grantor** and **grantee** (with mailing addresses) and nominal **consideration** ($10 and other good and valuable consideration).",
              "The **legal description** of the property (lot/block/addition and county) — must be exact.",
              "**Reservation of the enhanced life estate** — full possession, use, rents and profits for life, plus the right to sell, lease, encumber, or dispose, and to **cancel the deed** by further conveyance.",
              "**Remainder vesting** language — title vests in the grantee at death only if not previously disposed of.",
              "Subject to existing easements, covenants, and restrictions of record.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Confidentiality notice on real-property records",
            text: "Deeds are public records. The instrument carries a notice that a natural person may strike their Social Security or driver's license number before it is filed. Don't put sensitive numbers in a recorded deed.",
          },
        ],
      },
      {
        id: "execution-recording",
        title: "Execution & Recording",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "The **grantor signs** the deed.",
              "The signature is **acknowledged before a notary**.",
              "The deed is **recorded** in the real-property records of the **county where the land is located**.",
              "After recording, the original is returned to the owner; note its location in the file.",
            ],
          },
          {
            type: "paragraph",
            text: "Our deeds note they were prepared from information furnished by the parties, with **no title search** performed unless requested.",
          },
        ],
      },
      {
        id: "cautions",
        title: "Cautions & Coordination",
        blocks: [
          {
            type: "list",
            items: [
              "A Lady Bird deed only covers the **property described in it** — it is not a substitute for a will.",
              "It must be **coordinated with the overall plan** so it doesn't conflict with the will or other transfers.",
              "Confirm the **legal description** against the prior deed; an error can cloud title.",
              "Texas also allows a **Transfer on Death Deed** as an alternative; which tool fits is the attorney's decision.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "What makes a Lady Bird deed 'enhanced' compared with a traditional life estate?", a: "The grantor keeps the power to sell, mortgage, gift, or revoke the property during life without the remainderman's consent." },
              { q: "What happens to the property if the grantor still owns it at death?", a: "Title passes automatically to the grantee (remainderman) outside of probate." },
              { q: "Where must the deed be recorded, and what protects the grantor's sensitive numbers?", a: "In the real-property records of the county where the land is located; the confidentiality notice lets a person strike their SSN or driver's license number before filing." },
            ],
          },
        ],
      },
    ],
  },
  /* ---------------------------------------------------------------- *
   * Estate Planning — ancillary documents (POAs, HIPAA, guardian
   * declarations). Same series/category as the wills modules.
   * ---------------------------------------------------------------- */
  {
    slug: "estate-medical-poa",
    title: "Medical Power of Attorney (Texas)",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "How a Texas medical power of attorney lets someone appoint an agent for health-care decisions — the agent's authority and limits, who may serve, and how it's executed.",
    estMinutes: 12,
    updated: "January 2025",
    lessons: [
      {
        id: "what-it-is",
        title: "What an MPOA Is & When It Applies",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "A general introduction for firm staff, not legal advice. Staff gather information and prepare drafts; the attorney reviews and signs off.",
          },
          {
            type: "paragraph",
            text: "A **Medical Power of Attorney (MPOA)** lets a person (the **principal**) name an **agent** to make **health-care decisions** for them. It takes effect only when the **attending physician certifies in writing** that the principal can't make their own health-care decisions, and the principal can **revoke it at any time**, even after losing capacity.",
          },
          {
            type: "paragraph",
            text: "The agent may consent to, refuse, or withdraw treatment — including life-sustaining treatment — in line with the principal's wishes.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "Limits on the agent",
            text: "By law the agent may NOT consent to: voluntary inpatient mental-health services, convulsive treatment, psychosurgery, or abortion.",
          },
        ],
      },
      {
        id: "choosing-agent",
        title: "Choosing the Agent",
        blocks: [
          {
            type: "paragraph",
            text: "The agent must be **18 or older** (or a minor whose disabilities have been removed). Capture a first choice **and at least one alternate**.",
          },
          {
            type: "list",
            items: [
              "The agent generally cannot be the principal's **health-care or residential-care provider**, or an employee of one (unless a relative).",
              "If the agent is the principal's **spouse**, the appointment is **automatically revoked** on divorce, annulment, or a void marriage — unless the document says otherwise.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Practical details to record",
            text: "Note where the **original** will be kept and **who has signed copies** (e.g., the agent and physician) — the form asks for both.",
          },
        ],
      },
      {
        id: "execution",
        title: "Texas Execution Requirements",
        blocks: [
          {
            type: "paragraph",
            text: "The principal must be a **competent adult**, must receive the required **statutory disclosure statement**, and must sign. The MPOA is **not valid unless** the principal either:",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "**Signs it before a notary** (acknowledged), **or**",
              "**Signs it in the presence of two competent adult witnesses.**",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Witness disqualifications",
            text: "If witnesses are used, at least one must NOT be the agent, a relative, someone entitled to part of the estate, the attending physician (or their employee), or an employee of the facility providing care.",
          },
          {
            type: "paragraph",
            text: "The document **cannot be changed or modified** — to make changes, the principal executes a **new** medical power of attorney.",
          },
        ],
      },
      {
        id: "vs-others",
        title: "MPOA vs. Other Documents",
        blocks: [
          {
            type: "list",
            items: [
              "**Directive to Physicians (living will)** — states end-of-life treatment wishes; the MPOA instead names a person to decide.",
              "**Financial (durable) POA** — covers money and property, not health care.",
              "**HIPAA release** — gives the agent access to the medical *information* needed to make decisions; it pairs with the MPOA.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "When does a Texas medical power of attorney become effective?", a: "Only when the attending physician certifies in writing that the principal lacks the capacity to make their own health-care decisions." },
              { q: "Name two decisions the agent may NOT make.", a: "Any two of: consenting to voluntary inpatient mental-health services, convulsive treatment, psychosurgery, or abortion." },
              { q: "What are the two ways a Texas MPOA can be validly executed?", a: "Signed and acknowledged before a notary, OR signed in the presence of two competent adult witnesses." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "estate-financial-poa",
    title: "Statutory Durable (Financial) Power of Attorney (Texas)",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "The Texas durable power of attorney for finances — the statutory powers, immediate vs. springing, the granular form choices, hot powers, and the agent's fiduciary duties.",
    estMinutes: 15,
    updated: "January 2025",
    lessons: [
      {
        id: "what-it-is",
        title: "What a Durable Financial POA Is",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "A general introduction for firm staff, not legal advice. The attorney makes the legal decisions and signs off on the document.",
          },
          {
            type: "paragraph",
            text: "A **statutory durable power of attorney** lets a person (the **principal**) appoint an **agent** (attorney-in-fact) to handle **financial and property** matters. The powers are broad and sweeping. \"**Durable**\" means it survives the principal's later incapacity.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "It does NOT cover health care",
            text: "A financial POA gives no authority over medical decisions — that's what the Medical Power of Attorney is for.",
          },
        ],
      },
      {
        id: "powers",
        title: "The Statutory Powers",
        blocks: [
          {
            type: "paragraph",
            text: "On the statutory form the principal **initials** each category of authority to grant (or initials \"(O)\" to grant them all). The categories are:",
          },
          {
            type: "list",
            items: [
              "Real property; tangible personal property; stocks and bonds; commodities and options.",
              "Banking; business operating; insurance and annuity; estate/trust/beneficiary transactions.",
              "Claims and litigation; personal and family maintenance.",
              "Government benefits (Social Security, Medicare, Medicaid); retirement plans; tax matters; digital assets.",
            ],
          },
        ],
      },
      {
        id: "immediate-springing",
        title: "Immediate vs. Springing",
        blocks: [
          {
            type: "paragraph",
            text: "The form defaults to **effective immediately** and continuing until it terminates. The principal chooses one alternative:",
          },
          {
            type: "list",
            items: [
              "**(A) Immediate** — not affected by later disability (the default if neither is crossed out).",
              "**(B) Springing** — becomes effective only upon the principal's disability/incapacity, which a physician must certify.",
            ],
          },
        ],
      },
      {
        id: "form-choices",
        title: "Execution & Form Choices",
        blocks: [
          {
            type: "list",
            items: [
              "Signed by the principal and **acknowledged before a notary** (needed to record real-estate transactions).",
              "**Co-agents** — the principal may direct that they act independently, jointly, or by majority.",
              "**Compensation** — agent gets reasonable compensation unless the principal limits it to reimbursement only.",
              "**Gifts** — choose no gift power, gifts limited to the annual gift-tax exclusion, or a broad gift power.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Home-equity caveat",
            text: "For the agent to sign home-equity loan documents, the principal must sign the POA at the lender's office, an attorney's office, or a title company.",
          },
        ],
      },
      {
        id: "hot-powers",
        title: "\"Hot\" Powers",
        blocks: [
          {
            type: "paragraph",
            text: "Certain powers can significantly change the principal's property or who inherits, so they are granted only if **specifically initialed**:",
          },
          {
            type: "list",
            items: [
              "Create, amend, revoke, or terminate an **inter vivos (living) trust**.",
              "**Make gifts** (subject to Estates Code §751.032 and any special instructions).",
              "**Create or change rights of survivorship.**",
              "**Create or change a beneficiary designation.**",
              "**Delegate** the authority to another person.",
            ],
          },
        ],
      },
      {
        id: "agent-duties",
        title: "Agent Duties & Termination",
        blocks: [
          {
            type: "paragraph",
            text: "The agent is a **fiduciary**. The form's notice to the agent requires them to:",
          },
          {
            type: "list",
            items: [
              "Act in **good faith**, only within the authority granted, and **loyally** for the principal's benefit; avoid conflicts.",
              "**Disclose** they are acting as agent (sign \"(Principal) by (Agent) as Agent\").",
              "**Keep records** of every action and provide an **accounting** if the principal asks.",
            ],
          },
          { type: "heading", text: "When authority ends" },
          {
            type: "list",
            items: [
              "Principal's **death** or **revocation**; a termination event in the document.",
              "**Divorce/annulment** if the agent is the spouse (unless stated otherwise).",
              "Appointment of a **permanent guardian** of the estate, or court **removal** of the agent.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "Is a financial POA effective immediately or on incapacity by default?", a: "Effective immediately — Alternative (A) is assumed unless the springing option is chosen." },
              { q: "Give two 'hot' powers that must be specifically initialed.", a: "Any two of: create/amend/revoke a living trust; make gifts; create/change rights of survivorship; create/change a beneficiary designation; delegate authority." },
              { q: "Name two of the agent's fiduciary duties under the statutory notice.", a: "Any two of: act in good faith; stay within the authority granted; act loyally/avoid conflicts; disclose acting as agent; keep records and account to the principal." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "estate-hipaa-release",
    title: "HIPAA Authorizations & Releases",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "What HIPAA protects, why a release matters in an estate plan, the elements of a valid authorization, and how it differs from a medical power of attorney.",
    estMinutes: 10,
    updated: "January 2025",
    lessons: [
      {
        id: "what-hipaa-protects",
        title: "What HIPAA Protects",
        blocks: [
          {
            type: "paragraph",
            text: "The federal **HIPAA** Privacy Rule restricts how health-care providers and other covered entities may share a person's **Protected Health Information (PHI)** — essentially identifiable medical information.",
          },
          {
            type: "paragraph",
            text: "Because of HIPAA, a provider may refuse to share medical information with a client's family members or agents unless the client has authorized it. A **HIPAA authorization (release)** is how the client gives that permission in advance.",
          },
        ],
      },
      {
        id: "in-estate-planning",
        title: "The HIPAA Release in Estate Planning",
        blocks: [
          {
            type: "list",
            items: [
              "Lets the people the client names — often the **medical power of attorney agent** and close family — obtain medical records and speak with providers.",
              "Supports a **springing** power of attorney by letting the named persons get the information needed to confirm incapacity.",
              "Avoids a situation where an agent has authority to act but can't get the medical facts to act on.",
            ],
          },
        ],
      },
      {
        id: "elements",
        title: "Elements of a Valid Authorization",
        blocks: [
          {
            type: "paragraph",
            text: "Under the HIPAA rules, a valid authorization generally must include:",
          },
          {
            type: "list",
            items: [
              "A description of the **information** to be disclosed.",
              "**Who may disclose** it and **who may receive** it.",
              "The **purpose** of the disclosure.",
              "An **expiration** date or event.",
              "The principal's **signature and date**, and a statement of the **right to revoke**.",
            ],
          },
        ],
      },
      {
        id: "vs-mpoa",
        title: "HIPAA Release vs. MPOA",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Information vs. decisions",
            text: "A HIPAA release grants access to medical *information*. A medical power of attorney grants authority to *make* health-care decisions. A complete plan usually includes both.",
          },
          {
            type: "paragraph",
            text: "Remember the firm's own policy: PHI is highly sensitive — handle every client's medical information confidentially and never share it with an AI tool in identifiable form.",
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "What does PHI stand for, and what is it?", a: "Protected Health Information — identifiable medical information that HIPAA restricts covered entities from sharing." },
              { q: "Why is a HIPAA release useful alongside a springing power of attorney?", a: "It lets the named persons obtain the medical information needed to confirm the principal's incapacity so the POA can spring into effect." },
              { q: "Name three required elements of a valid HIPAA authorization.", a: "Any three of: description of the information; who may disclose; who may receive; purpose; expiration; signature/date; and the right-to-revoke statement." },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "estate-declaration-of-guardian",
    title: "Declaration of Guardian (Texas)",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "Two Texas declarations that let a person choose guardians in advance — one for themselves if they're ever incapacitated, and one naming a guardian for their children.",
    estMinutes: 12,
    updated: "January 2025",
    lessons: [
      {
        id: "what-it-is",
        title: "What a Declaration of Guardian Is",
        blocks: [
          {
            type: "callout",
            tone: "info",
            title: "Internal training only",
            text: "A general introduction for firm staff, not legal advice. The attorney reviews and signs off on every document.",
          },
          {
            type: "paragraph",
            text: "A **declaration of guardian** lets a competent adult decide, in advance, **who a court should appoint as guardian** if a guardianship is ever needed. Texas recognizes two kinds:",
          },
          {
            type: "list",
            items: [
              "A **Declaration of Guardian for Yourself** — in the event of your own later incapacity.",
              "A **Declaration of Guardian for your Children** — naming who should raise/manage the estate of your minor (or incapacitated adult) children.",
            ],
          },
        ],
      },
      {
        id: "for-yourself",
        title: "Declaration of Guardian for Yourself",
        blocks: [
          {
            type: "paragraph",
            text: "This document lets a person name **who they want** to serve as guardian of their **person** and/or **estate** if they ever become incapacitated — and importantly, it can also name people they **want disqualified** from serving. Courts give these wishes strong weight.",
          },
        ],
      },
      {
        id: "for-children",
        title: "Declaration of Guardian for Children",
        blocks: [
          {
            type: "paragraph",
            text: "This lets a parent name a **guardian for their minor children** (or an adult child who is incapacitated) in case the parent dies or becomes incapacitated.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Why it complements the will",
            text: "A will names a guardian only at death. A standalone declaration also covers the parent's **incapacity** during life — a gap the will can't fill on its own. Many clients should have both.",
          },
        ],
      },
      {
        id: "execution",
        title: "Texas Execution Requirements",
        blocks: [
          {
            type: "list",
            items: [
              "**Signed by the declarant.**",
              "Either **witnessed by two witnesses (age 14+)** or made **self-proved before a notary**.",
              "A self-proving affidavit lets the declaration be accepted without the witnesses appearing later.",
            ],
          },
        ],
      },
      {
        id: "review",
        title: "Check Your Understanding",
        blocks: [
          {
            type: "questions",
            items: [
              { q: "What are the two kinds of declaration of guardian in Texas?", a: "A declaration of guardian for yourself (for your own later incapacity) and a declaration of guardian for your children." },
              { q: "Besides naming a preferred guardian, what else can a declaration for yourself do?", a: "It can name people the declarant wants disqualified from serving as guardian." },
              { q: "Why might a parent need a declaration of guardian for children in addition to a will?", a: "A will only names a guardian at death; the declaration also covers the parent's incapacity during life." },
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
