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
    summary: "How to prepare for and run a wills intake — the conflicts check, the people and assets to capture, how to ask good questions, and how to document it all.",
    estMinutes: 18,
    updated: "January 2025",
    lessons: [
      {
        id: "preparing",
        title: "Preparing for the Interview",
        blocks: [
          {
            type: "paragraph",
            text: "Good drafting starts with good information. Before you ever sit down with the client, set the stage:",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "**Run the conflicts check first.** Confirm the firm has cleared conflicts before substantive work begins — especially when a couple is being represented together.",
              "**Send the intake questionnaire ahead of time.** Ask the client to gather names, dates, and an asset list so the meeting is productive.",
              "**Set expectations.** Let the client know roughly how long it will take, what to bring (prior will, deeds, account statements, beneficiary designations), and that the attorney will make the legal decisions.",
              "**Choose a private setting.** Wills involve sensitive family and financial details — meet somewhere conversations can't be overheard.",
            ],
          },
        ],
      },
      {
        id: "family-fiduciaries",
        title: "The People: Family & Fiduciaries",
        blocks: [
          { type: "heading", text: "Personal & family information" },
          {
            type: "list",
            items: [
              "Testator's **full legal name** (and any other names used), address, and date of birth.",
              "**Marital status and history** — current spouse, prior marriages, and any divorce decrees or premarital agreements.",
              "**Children** — full names and ages, noting any who are **minors**, have special needs, or are from a prior relationship (blended families need extra care).",
              "Whether anyone is to be **intentionally left out**, so the attorney can address it deliberately.",
            ],
          },
          { type: "heading", text: "Fiduciaries — the people who will act" },
          {
            type: "list",
            items: [
              "**Executor** (and at least one **alternate**) — who will administer the estate.",
              "**Guardian** for minor children (and an alternate), if applicable.",
              "**Trustee**, if any trusts for minors or others will be created.",
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Always capture alternates",
            text: "For every fiduciary role, ask for a backup. Plans fail when the first choice can't or won't serve and no alternate was named.",
          },
        ],
      },
      {
        id: "assets",
        title: "The Assets: Building the Inventory",
        blocks: [
          {
            type: "paragraph",
            text: "Capture a working inventory of what the client owns and roughly what it's worth. You're not appraising — you're making sure nothing important is missed.",
          },
          {
            type: "list",
            items: [
              "**Real property** — homes, land, mineral interests (with addresses/legal descriptions where possible).",
              "**Financial accounts** — bank, brokerage, retirement.",
              "**Business interests** — ownership in any company or partnership.",
              "**Personal property** — vehicles, valuables, heirlooms, collections.",
              "**Digital assets** — online accounts, cryptocurrency, photos.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Watch for non-probate assets",
            text: "Some assets pass OUTSIDE the will by their own beneficiary designation or title — life insurance, retirement accounts (IRA/401(k)), payable-on-death accounts, and joint-with-survivorship property. Flag these for the attorney; a will does not override a beneficiary designation.",
          },
        ],
      },
      {
        id: "interview-technique",
        title: "How to Ask: Interview Technique",
        blocks: [
          {
            type: "list",
            items: [
              "**Ask open-ended questions** — \"Tell me about your family\" surfaces more than yes/no questions.",
              "**Work from the questionnaire**, but listen for what's missing and follow up.",
              "**Stay neutral.** Record the client's wishes; don't steer them or react to their choices.",
              "**Handle sensitive topics plainly** — disinheriting a child, unequal shares, or blended-family concerns are common; note them without judgment for the attorney.",
              "**Note your observations** about the client's clarity and that they seem to be acting freely (relevant to capacity and undue influence) — but never diagnose.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Do not give legal advice",
            text: "If the client asks \"What should I do?\" or \"Is that allowed?\", don't answer from your own knowledge. Capture the question and route it to the supervising attorney.",
          },
        ],
      },
      {
        id: "documenting",
        title: "Documenting & Handoff",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Record everything on the firm's **intake form**, spelling **names exactly** as they should appear.",
              "Organize notes clearly and attach any documents the client provided (prior will, deeds, statements).",
              "Keep all of it **confidential** and secure, consistent with the firm's confidentiality policy.",
              "**Summarize open questions** for the attorney and hand the file off for the drafting stage.",
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
              { q: "What two things should always happen before the substantive intake interview begins?", a: "Run/confirm the conflicts check, and send the client the intake questionnaire so they can gather names, dates, and an asset list in advance." },
              { q: "Why must you flag life insurance and retirement accounts specifically?", a: "They are non-probate assets that pass by beneficiary designation, outside the will — a will does not override those designations, so the attorney needs to know." },
              { q: "A client asks you whether they're allowed to leave a child out of the will. What do you do?", a: "Don't advise. Note the question and the client's wishes neutrally and route the legal question to the supervising attorney." },
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
  /* ---------------------------------------------------------------- *
   * Estate Planning — ancillary documents (POAs, HIPAA, guardian
   * declarations). Same series/category as the wills modules.
   * ---------------------------------------------------------------- */
  {
    slug: "estate-medical-poa",
    title: "Medical Power of Attorney (Texas)",
    category: "Estate Planning (Wills & Trusts)",
    audience: "Clerks & staff",
    summary: "How a Texas medical power of attorney lets someone appoint an agent to make health-care decisions, who may serve, and how it's executed.",
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
            text: "A **Medical Power of Attorney (MPOA)** lets a person (the **principal**) name an **agent** to make **health-care decisions** for them if they become unable to make those decisions themselves. It is governed by the Texas Health & Safety Code.",
          },
          {
            type: "list",
            items: [
              "It becomes effective only when the **attending physician certifies** the principal lacks the capacity to make health-care decisions.",
              "The principal can **revoke it at any time**, even after losing capacity, and regardless of how it was executed.",
              "The agent must follow the principal's known wishes and otherwise act in their best interest.",
            ],
          },
        ],
      },
      {
        id: "choosing-agent",
        title: "Choosing the Agent",
        blocks: [
          {
            type: "paragraph",
            text: "Capture the principal's first choice of agent **and at least one alternate**. Some people cannot serve as agent:",
          },
          {
            type: "list",
            items: [
              "The principal's **health-care provider** or an **employee** of that provider (unless they are a relative).",
              "A **residential care provider** serving the principal, or its employee (unless a relative).",
            ],
          },
        ],
      },
      {
        id: "execution",
        title: "Texas Execution Requirements",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "The principal must be a **competent adult**.",
              "The MPOA must be **signed by the principal**.",
              "It must be either **signed by two qualified witnesses** or **acknowledged before a notary**.",
              "The principal must receive the required **statutory disclosure statement** before signing.",
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Witness disqualifications",
            text: "If witnesses are used, at least one witness must NOT be the agent, related to the principal, entitled to part of the estate, the attending physician (or their employee), or the principal's health-care/residential provider (or their employee).",
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
              { q: "When does a Texas medical power of attorney become effective?", a: "Only when the attending physician certifies that the principal lacks the capacity to make their own health-care decisions." },
              { q: "What are the two acceptable ways to execute an MPOA besides the principal's signature?", a: "Have it signed by two qualified witnesses, or have it acknowledged before a notary." },
              { q: "How does an MPOA differ from a HIPAA release?", a: "An MPOA grants authority to make health-care decisions; a HIPAA release grants access to medical information. They work together." },
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
    summary: "The Texas durable power of attorney for finances — what 'durable' means, immediate vs. springing, the statutory form, hot powers, and the agent's duties.",
    estMinutes: 14,
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
            text: "A **durable power of attorney** lets a person (the **principal**) appoint an **agent** (also called an **attorney-in-fact**) to handle **financial and property** matters. \"**Durable**\" means it stays effective even if the principal later becomes incapacitated — the document must contain the durability language to achieve that.",
          },
        ],
      },
      {
        id: "immediate-springing",
        title: "Immediate vs. Springing",
        blocks: [
          {
            type: "list",
            items: [
              "**Immediate** — effective as soon as it is signed. Simpler and avoids fights over whether the principal is incapacitated. Often recommended.",
              "**Springing** — effective only upon a future event, usually the principal's disability, which then must be proven (commonly by a physician). More steps, more delay.",
            ],
          },
        ],
      },
      {
        id: "execution",
        title: "Execution & the Statutory Form",
        blocks: [
          {
            type: "paragraph",
            text: "Texas provides a **statutory durable power of attorney form**. Key points when preparing one:",
          },
          {
            type: "list",
            items: [
              "It must be **signed by the principal** and **acknowledged before a notary** (notarization is required, partly so it can be used for real-estate transactions).",
              "The form lists categories of authority (real property, banking, business, etc.) that the principal **grants or withholds**.",
              "A **special instructions** section lets the principal limit or customize the powers.",
            ],
          },
        ],
      },
      {
        id: "hot-powers-duties",
        title: "Hot Powers & Agent Duties",
        blocks: [
          {
            type: "callout",
            tone: "warning",
            title: "\"Hot\" powers must be expressly granted",
            text: "Certain powers don't come automatically and must be specifically initialed/granted — for example, making gifts, creating or changing rights of survivorship or beneficiary designations, delegating authority, and creating or changing a trust.",
          },
          {
            type: "list",
            items: [
              "The agent is a **fiduciary** — they must act in good faith, only within the authority granted, and in the principal's interest.",
              "The agent should keep **records** of transactions made on the principal's behalf.",
            ],
          },
        ],
      },
      {
        id: "termination",
        title: "When It Ends",
        blocks: [
          {
            type: "list",
            items: [
              "The principal's **death**.",
              "**Revocation** by the principal.",
              "If the agent is the principal's **spouse**, generally upon **divorce** or annulment.",
              "A court order, or the terms of the document itself.",
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
              { q: "What does 'durable' mean in a durable power of attorney?", a: "It remains effective even after the principal becomes incapacitated (the document must include the durability language)." },
              { q: "Why is an immediate POA often preferred over a springing one?", a: "It avoids the delay and proof required to establish that the principal has become incapacitated before the agent can act." },
              { q: "Give two examples of 'hot' powers that must be expressly granted.", a: "Any two of: making gifts; creating/changing survivorship rights or beneficiary designations; delegating authority; creating or amending a trust." },
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
