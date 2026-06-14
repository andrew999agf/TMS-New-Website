/**
 * Default copy for the 15 practice areas, grouped under the three positioning
 * headers. Written in the Section 2 voice: short, declarative, trial-first.
 * Every area lands on some version of "we prepare every matter as if it is
 * going to trial." This is the seed/fallback content; all of it is editable in
 * the admin Practice Areas tab once the database is live.
 */

export type PracticeGroup = "litigation" | "defense" | "counsel";

export type PracticeAreaSeed = {
  slug: string;
  title: string;
  group: PracticeGroup;
  sort: number;
  tagline: string;
  body: string[];
  approach: string;
  keywords: string[];
  seoTitle: string;
  seoDescription: string;
};

export const PRACTICE_GROUPS: { id: PracticeGroup; label: string; blurb: string }[] = [
  {
    id: "litigation",
    label: "Litigation & Trials",
    blurb: "The spine of the practice. Every other area is built on it.",
  },
  {
    id: "defense",
    label: "Defense & Creditor Matters",
    blurb: "When the papers land on your desk, the clock is already running.",
  },
  {
    id: "counsel",
    label: "Counsel & Planning",
    blurb: "Built by a trial firm, so the plan holds up when it is tested.",
  },
];

export const PRACTICE_AREAS: PracticeAreaSeed[] = [
  {
    slug: "civil-commercial-litigation",
    title: "Civil & Commercial Litigation",
    group: "litigation",
    sort: 1,
    tagline: "Business disputes, tried like they will be tried.",
    body: [
      "Most lawsuits settle. They settle on the terms of the side that was ready to try them. We build every commercial case from the verdict backward — what a jury needs to hear, what the record has to prove, what the other side cannot survive.",
      "We handle contract breaches, business divorces, fraud, fiduciary disputes, and the tangled fights that come when money and trust both run out. The facts are usually complicated. Our job is to make them simple enough for twelve people to decide in your favor.",
      "Discovery is where cases are won or lost long before trial. We treat it that way — depositions taken to lock in testimony, documents pursued until the story is complete, motions filed to narrow the fight to the ground we want.",
    ],
    approach:
      "We prepare every matter as if it is going to trial, because that is how you win whether you ever pick a jury or not. A defendant who knows you will try the case pays more to settle it. A defendant who thinks you will fold pays nothing.",
    keywords: [
      "sued",
      "lawsuit",
      "breach of contract",
      "business dispute",
      "partner dispute",
      "owed money",
      "fraud",
      "non-compete",
      "litigation",
    ],
    seoTitle: "Civil & Commercial Litigation Attorney | Fort Worth, Texas",
    seoDescription:
      "Fort Worth civil and commercial litigation attorney. Contract, fraud, and business disputes prepared for trial from day one.",
  },
  {
    slug: "plaintiffs-litigation",
    title: "Plaintiff's Litigation",
    group: "litigation",
    sort: 2,
    tagline: "If you want what you are owed, you have to be willing to sue.",
    body: [
      "Being right is not the same as being paid. The law gives you a claim; collecting on it takes pressure, and pressure comes from a credible threat of trial.",
      "We bring claims for people and businesses who were wronged and want a result, not a lecture. We tell you early what your case is worth, what it will take, and where the weak points are — yours and theirs.",
      "We do not file cases we are not prepared to finish. That is what makes our demand letters land.",
    ],
    approach:
      "A plaintiff is only as strong as their willingness to put the case in front of a jury. We prepare to do exactly that, every time, so the other side has to take the number seriously.",
    keywords: [
      "sue someone",
      "owed money",
      "plaintiff",
      "wronged",
      "claim",
      "damages",
      "recover",
    ],
    seoTitle: "Plaintiff's Litigation Attorney | T. Maxwell Smith, PLLC",
    seoDescription:
      "Texas plaintiff's litigation attorney. We bring claims prepared for trial so the other side has to take your number seriously.",
  },
  {
    slug: "personal-injury-wrongful-death",
    title: "Personal Injury & Wrongful Death",
    group: "litigation",
    sort: 3,
    tagline: "Serious injuries deserve a lawyer the insurer already respects.",
    body: [
      "Insurance companies settle for what they think your lawyer can take from them at trial. They keep score. They know which firms try cases and which ones take the first offer.",
      "We handle vehicle wrecks, 18-wheeler collisions, premises cases, and wrongful death. We work the medical record, the liability proof, and the full measure of what was lost — not just the bills, but the life that changed.",
      "You pay nothing unless we recover. The first conversation costs you nothing either.",
    ],
    approach:
      "We prepare injury cases for trial from the first week — evidence preserved, witnesses pinned down, damages documented — because the adjuster's first offer is a measure of how ready they think you are.",
    keywords: [
      "injured",
      "car wreck",
      "crash",
      "accident",
      "18-wheeler",
      "truck",
      "wrongful death",
      "died",
      "premises",
      "slip and fall",
      "insurance",
    ],
    seoTitle: "Personal Injury & Wrongful Death Attorney | Fort Worth, Texas",
    seoDescription:
      "Fort Worth personal injury and wrongful death attorney. Serious-injury and fatal-crash cases prepared for trial. No recovery, no fee.",
  },
  {
    slug: "dtpa",
    title: "Deceptive Trade Practices Act (DTPA)",
    group: "litigation",
    sort: 4,
    tagline: "When a business lied to you, Texas law has teeth.",
    body: [
      "The Texas Deceptive Trade Practices Act exists because ordinary consumers cannot out-lawyer a company on their own. Used right, it shifts the leverage — and it can multiply damages and shift fees.",
      "We bring DTPA claims for buyers who were deceived, sold defective goods, or strung along by businesses that counted on them giving up. We also defend businesses against DTPA claims that overreach.",
      "These cases turn on notice, intent, and proof. We handle each step precisely, because a procedural slip can cost the statute's best remedies.",
    ],
    approach:
      "The DTPA's leverage only matters if the defendant believes you will try the case to a verdict. We build the notice letter and the file to do exactly that.",
    keywords: [
      "deceptive",
      "dtpa",
      "consumer",
      "ripped off",
      "scammed",
      "defective",
      "false advertising",
      "misrepresentation",
    ],
    seoTitle: "DTPA Attorney | Texas Deceptive Trade Practices Act Claims",
    seoDescription:
      "Texas DTPA attorney. Consumer deception, defective goods, and misrepresentation claims and defense prepared for trial.",
  },
  {
    slug: "criminal-defense",
    title: "Criminal Defense",
    group: "litigation",
    sort: 5,
    tagline: "A charge is an accusation. Make the State prove it.",
    body: [
      "The State has the burden. Our job is to hold them to it — to make every assumption earn its place and every piece of evidence survive scrutiny.",
      "We have tried criminal cases to verdict in Tarrant County, as second chair and as lead counsel, including DWI and assault cases. We know how these trials actually run, not just how they read in an outline.",
      "From the first call, we protect your rights: what you say, what you sign, what the police are entitled to. The early decisions often matter more than the trial.",
    ],
    approach:
      "We prepare every case for a jury. A prosecutor who knows the file is trial-ready evaluates the plea very differently than one who expects you to cave at the courthouse door.",
    keywords: [
      "arrested",
      "charged",
      "criminal",
      "dwi",
      "dui",
      "assault",
      "jail",
      "bond",
      "police",
      "investigation",
      "warrant",
    ],
    seoTitle: "Criminal Defense Attorney | Tarrant County, Texas",
    seoDescription:
      "Fort Worth criminal defense attorney with jury-trial experience in Tarrant County. We make the State prove its case.",
  },
  {
    slug: "appellate-law",
    title: "Appellate Law",
    group: "litigation",
    sort: 6,
    tagline: "If you sue and lose, you have to be able to appeal.",
    body: [
      "An appeal is not a second trial. It is a different craft — built on the record, the standard of review, and error that was preserved while the trial was still happening.",
      "We handle appeals on both sides, and we have the affirmances and the bond recovery to show for it. We have argued before the Court of Appeals and briefed matters through the Supreme Court of Texas and into the Fifth Circuit.",
      "The best appellate work starts at trial. We think about the record before there is anything to appeal, so the issues are preserved when they matter.",
    ],
    approach:
      "Trial readiness and appellate readiness are the same discipline seen from two ends. We protect the record going in so the judgment holds up coming out.",
    keywords: [
      "appeal",
      "appellate",
      "lost at trial",
      "judgment",
      "court of appeals",
      "supersedeas",
      "bond",
      "reverse",
    ],
    seoTitle: "Appellate Attorney | Texas Courts of Appeals & Fifth Circuit",
    seoDescription:
      "Texas appellate attorney. Civil appeals, supersedeas bonds, and oral argument. Affirmances and bond recovery on the record.",
  },
  {
    slug: "consumer-debt-defense",
    title: "Consumer Debt Defense",
    group: "defense",
    sort: 7,
    tagline: "Being sued by a debt buyer is not the same as owing it.",
    body: [
      "Debt buyers file lawsuits in volume and count on people not answering. A default judgment is the easiest money they make. Showing up changes the math.",
      "We have defended clients against the biggest names — Discover, Capital One, Bank of America, Chase, Barclays, LVNV, Midland — and we know what they can actually prove and what they are bluffing.",
      "Often the plaintiff cannot produce the documents the law requires. Sometimes the debt is time-barred. Sometimes it is not even yours. We make them prove every element before a dollar changes hands.",
    ],
    approach:
      "We answer, we demand proof, and we are prepared to try it. Debt buyers price their cases on how much resistance they expect. We make ourselves expensive to sue.",
    keywords: [
      "being sued",
      "debt",
      "credit card",
      "collection",
      "debt buyer",
      "discover",
      "capital one",
      "lvnv",
      "midland",
      "served papers",
      "default judgment",
    ],
    seoTitle: "Consumer Debt Defense Attorney | Sued by a Debt Buyer in Texas",
    seoDescription:
      "Texas consumer debt defense attorney. Sued by Discover, Capital One, LVNV, or Midland? Make them prove it. We defend and try these cases.",
  },
  {
    slug: "commercial-debt-collection-defense",
    title: "Commercial Debt Collection & Defense",
    group: "defense",
    sort: 8,
    tagline: "Collect what you are owed. Defend what you do not.",
    body: [
      "Business debt runs both directions. We pursue collection for companies owed money on contracts, invoices, and guaranties — and we defend businesses against collection claims that are inflated, disputed, or simply wrong.",
      "Collection is litigation. The leverage is the judgment and what you can do with it: garnishment, turnover, abstracts. We pursue all of it.",
      "On defense, we look for the counterclaim. Often the company chasing your account broke the deal first.",
    ],
    approach:
      "Whether collecting or defending, we build the file for trial. A creditor who will actually try the case collects more; a debtor who will actually try it pays less.",
    keywords: [
      "business debt",
      "collection",
      "invoice",
      "guaranty",
      "owed money",
      "commercial",
      "judgment",
    ],
    seoTitle: "Commercial Debt Collection & Defense Attorney | Texas",
    seoDescription:
      "Texas commercial debt attorney. Collection for businesses owed money and defense against overreaching collection claims.",
  },
  {
    slug: "foreclosures",
    title: "Foreclosures",
    group: "defense",
    sort: 9,
    tagline: "A posted sale date is a deadline, not a verdict.",
    body: [
      "Texas foreclosures move fast and largely outside the courtroom. By the time most people call a lawyer, the sale is weeks away. The earlier you act, the more options remain.",
      "We represent property owners facing foreclosure and parties in the litigation that follows — wrongful foreclosure, title disputes, and the eviction fight that comes after a sale.",
      "We also handle the appellate side of post-foreclosure litigation. We have defended owners through multiple appeals and recovered a supersedeas bond for a client.",
    ],
    approach:
      "We treat a foreclosure as the opening move in litigation that may run all the way to an appeal — and we prepare it that way from the first notice.",
    keywords: [
      "foreclosure",
      "foreclose",
      "house",
      "sale date",
      "notice of sale",
      "eviction",
      "mortgage",
      "deed of trust",
    ],
    seoTitle: "Foreclosure Attorney | Texas Property Owner Defense",
    seoDescription:
      "Texas foreclosure attorney. Property-owner defense, wrongful foreclosure, post-sale litigation, and appeals.",
  },
  {
    slug: "garnishments",
    title: "Garnishments",
    group: "defense",
    sort: 10,
    tagline: "A frozen account is not the end of the story.",
    body: [
      "A writ of garnishment can freeze your bank account on the strength of a judgment you may not even have known about. Texas law also gives you ways to fight back.",
      "We move to dissolve improper writs, claim exemptions, and attack the underlying judgment when it was wrongly obtained. We have had a writ dissolved, the underlying judgment vacated by bill of review, and the garnished funds released to our client.",
      "Speed matters. The sooner we act, the better the odds of getting your money back.",
    ],
    approach:
      "We attack a garnishment on every front at once — the writ, the exemptions, and the judgment behind it — and we are ready to litigate each to conclusion.",
    keywords: [
      "garnishment",
      "garnished",
      "frozen account",
      "bank account",
      "writ",
      "judgment",
      "levy",
    ],
    seoTitle: "Garnishment Attorney | Frozen Bank Account in Texas",
    seoDescription:
      "Texas garnishment attorney. Dissolve improper writs, claim exemptions, and recover garnished funds.",
  },
  {
    slug: "receivership-matters",
    title: "Receivership Matters",
    group: "defense",
    sort: 11,
    tagline: "When a court puts assets under a receiver, every move counts.",
    body: [
      "Receiverships arise in collection, partnership breakups, and disputes where a court decides someone neutral must control the property. The stakes are high and the rules are unforgiving.",
      "We represent creditors seeking the appointment of a receiver and parties whose assets are threatened by one. Both require precision and speed.",
      "These are litigation matters at their core, and we handle them as such — with the record, the hearings, and the appeal in view.",
    ],
    approach:
      "We approach receivership work as high-stakes litigation, prepared to make and meet the proof a court needs before it takes the extraordinary step of appointing a receiver.",
    keywords: [
      "receiver",
      "receivership",
      "assets frozen",
      "turnover",
      "court-appointed",
    ],
    seoTitle: "Receivership Attorney | Texas Asset & Turnover Disputes",
    seoDescription:
      "Texas receivership attorney. Representing creditors seeking receivers and parties whose assets are at risk.",
  },
  {
    slug: "business-related-matters",
    title: "Business-Related Matters",
    group: "counsel",
    sort: 12,
    tagline: "Counsel from a lawyer who knows where it ends up.",
    body: [
      "Most business advice is given by people who have never had to defend it in court. We have. That changes the advice.",
      "We help owners with the day-to-day legal questions that come with running a company — contracts, disputes with vendors and customers, employment issues, and the problems that show up without warning.",
      "Nobody ever wants to need a lawyer, but when you do, you want one who is going to get you the answers you need — not one who is going to pass the buck.",
    ],
    approach:
      "We give counsel with the courtroom in mind. The agreement we draft is the agreement we would want to defend, and the position we advise is one we are prepared to back at trial.",
    keywords: [
      "business",
      "company",
      "contract",
      "vendor",
      "employee",
      "advice",
      "counsel",
    ],
    seoTitle: "Business Attorney | Texas Counsel for Owners",
    seoDescription:
      "Texas business attorney. Practical counsel from a trial lawyer — contracts, disputes, and the problems that show up without warning.",
  },
  {
    slug: "business-formations-transactions",
    title: "Business Formations & Transactions",
    group: "counsel",
    sort: 13,
    tagline: "Set it up right so it holds up later.",
    body: [
      "The choices you make when you start — entity type, ownership, who decides what — are the choices that get litigated when things go wrong. We make them deliberately.",
      "We form LLCs, corporations, and partnerships; paper the deals; and draft the agreements that govern how owners work together and how they part ways.",
      "A buy-sell provision written well is one you never have to argue about. We write the documents to prevent the fight, and to win it if it comes anyway.",
    ],
    approach:
      "We draft formation and deal documents as a litigator reads them — looking for the ambiguity a future opponent would exploit, and closing it before it can be used.",
    keywords: [
      "form a business",
      "llc",
      "corporation",
      "partnership",
      "buy-sell",
      "operating agreement",
      "transaction",
      "deal",
    ],
    seoTitle: "Business Formation & Transactions Attorney | Texas LLCs & Deals",
    seoDescription:
      "Texas business formation attorney. Entity setup, operating agreements, and transactions drafted by a litigator to hold up later.",
  },
  {
    slug: "estate-succession-planning",
    title: "Estate & Succession Planning",
    group: "counsel",
    sort: 14,
    tagline: "Plan the land, the business, and the family — once, correctly.",
    body: [
      "A good estate plan keeps your family out of the courtroom. We have seen what happens when there is no plan, or a bad one, and we plan to avoid it.",
      "We draft wills, trusts, powers of attorney, and the directives that carry your wishes when you cannot speak for them. For owners of land, a farm, or a business, we plan for the assets that do not divide neatly.",
      "Texas roots run deep here. We understand family land and family operations because we help run one.",
    ],
    approach:
      "We plan estates the way we would defend them — anticipating the dispute among heirs, the ambiguous clause, the missing signature — so the plan holds when it is finally read.",
    keywords: [
      "will",
      "trust",
      "estate",
      "power of attorney",
      "inheritance",
      "succession",
      "farm",
      "land",
      "guardian",
      "directive",
    ],
    seoTitle: "Estate & Succession Planning Attorney | Wills & Trusts in Texas",
    seoDescription:
      "Texas estate planning attorney. Wills, trusts, and succession planning for families, landowners, and business owners.",
  },
  {
    slug: "probate",
    title: "Probate",
    group: "counsel",
    sort: 15,
    tagline: "Settle the estate. Or fight for your share of it.",
    body: [
      "Probate is the court process of settling what someone left behind. Done right it is orderly. Done wrong, or contested, it becomes litigation among the people who are grieving.",
      "We guide executors and families through probate in Bosque, Johnson, Tarrant, and Dallas counties, and we litigate will contests, heirship disputes, and fiduciary fights when they arise.",
      "When the family cannot agree, you want a lawyer who tries cases. We are that lawyer.",
    ],
    approach:
      "An uncontested probate is administered cleanly; a contested one is litigation, and we prepare it for trial like any other. Either way, we are ready for the version that ends up in front of a judge.",
    keywords: [
      "probate",
      "inheritance",
      "estate",
      "executor",
      "will contest",
      "heir",
      "died",
      "passed away",
      "fiduciary",
    ],
    seoTitle: "Probate Attorney | Estate Administration & Will Contests in Texas",
    seoDescription:
      "Texas probate attorney. Estate administration and will-contest litigation in Bosque, Johnson, Tarrant, and Dallas counties.",
  },
];

export function getPracticeAreaSeed(slug: string) {
  return PRACTICE_AREAS.find((p) => p.slug === slug);
}
