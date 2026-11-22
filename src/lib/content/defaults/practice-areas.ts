/**
 * Default copy for the practice areas, grouped under positioning headers.
 * Written in the Section 2 voice: short, declarative, trial-first. Every area
 * lands on some version of "we prepare every matter as if it is going to
 * trial." This is the seed/fallback content; all of it is editable in the admin
 * Practice Areas tab once the database is live.
 *
 * ORDER MATTERS. The public site renders groups in the order declared in
 * PRACTICE_GROUPS and areas within a group by `sort`, so this file alone sets
 * the priority a visitor sees on the home page, the practice-areas index, and
 * the header menu.
 *
 * THE FIVE SECTIONS (Nov. 2026). The firm presents five kinds of work and no
 * others: personal injury and wrongful death; civil and commercial
 * litigation; probate and estate planning; business transactional work; and
 * the defense of credit card and debt-buyer lawsuits. Garnishments,
 * receiverships, foreclosures and commercial debt collection were withdrawn
 * from the site (see ../retired.ts) because they drew post-judgment and
 * small-dollar callers. A page outside the five sections (criminal defense)
 * stays reachable from the full practice-areas index but is not in the header
 * menu, the home page, or the summaries written for search engines and AI.
 */

export type PracticeGroup =
  | "injury"
  | "litigation"
  | "probate"
  | "business"
  | "creditcard"
  | "other";

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
    id: "injury",
    label: "Personal Injury & Wrongful Death",
    blurb: "When someone is badly hurt or killed, and an insurer is keeping score.",
  },
  {
    id: "litigation",
    label: "Civil & Commercial Litigation",
    blurb: "Business, partnership, land and appellate fights with real money at stake.",
  },
  {
    id: "probate",
    label: "Probate & Estate Planning",
    blurb: "Built by a trial firm, so the plan holds up when it is tested.",
  },
  {
    id: "business",
    label: "Business & Transactional",
    blurb: "Entities, agreements and deals, structured by a firm that has seen them litigated.",
  },
  {
    id: "creditcard",
    label: "Credit Card Defense",
    blurb: "For people sued by a credit card company or a debt buyer.",
  },
];

/**
 * The section each page belongs to, by slug. Decided here rather than read
 * from the database row, so the five sections are right the moment this
 * deploys — a row provisioned under the older grouping ("counsel", "appeals",
 * "defense") is filed correctly without anyone running a content refresh.
 */
export const PRACTICE_GROUP_OF: Record<string, PracticeGroup> = {
  "personal-injury": "injury",
  "wrongful-death": "injury",
  "civil-commercial-litigation": "litigation",
  "plaintiffs-litigation": "litigation",
  "data-center-easements": "litigation",
  "appellate-law": "litigation",
  "probate": "probate",
  "estate-succession-planning": "probate",
  "business-formations-transactions": "business",
  "business-related-matters": "business",
  "attorney-succession-planning": "business",
  "consumer-debt-defense": "creditcard",
  "criminal-defense": "other",
};
/** The order of pages inside the sections, by slug (same reason as above). */
export const PRACTICE_SORT_OF: Record<string, number> = {
  "personal-injury": 1,
  "wrongful-death": 2,
  "civil-commercial-litigation": 3,
  "plaintiffs-litigation": 4,
  "data-center-easements": 5,
  "appellate-law": 6,
  "probate": 7,
  "estate-succession-planning": 8,
  "business-formations-transactions": 9,
  "business-related-matters": 10,
  "attorney-succession-planning": 11,
  "consumer-debt-defense": 12,
  "criminal-defense": 13,
};
const FIVE = new Set<string>(["injury", "litigation", "probate", "business", "creditcard"]);
/** Section for a page: the slug's own section; else the row's, when it is one of the five; else the trailing catch-all. */
export function practiceGroupFor(slug: string, rowGroup: string | null | undefined): PracticeGroup {
  return PRACTICE_GROUP_OF[slug] ?? (rowGroup && FIVE.has(rowGroup) ? (rowGroup as PracticeGroup) : "other");
}

export const PRACTICE_AREAS: PracticeAreaSeed[] = [
  {
    slug: "personal-injury",
    title: "Personal Injury",
    group: "injury",
    sort: 1,
    tagline: "Serious injuries deserve a lawyer the insurer already respects.",
    body: [
      "Insurance companies settle for what they think your lawyer can take from them at trial. They keep score. They know which firms try cases and which ones take the first offer.",
      "We handle vehicle wrecks, 18-wheeler and commercial-truck collisions, motorcycle and pedestrian cases, and premises injuries. We work the medical record, the liability proof, and the full measure of what was lost — not just the bills, but the life that changed.",
      "The early weeks matter more than most people realize. Vehicles get repaired, video gets overwritten, witnesses move, and the adjuster is building their file the whole time. We start preserving evidence while it still exists.",
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
      "motorcycle",
      "premises",
      "slip and fall",
      "insurance",
      "adjuster",
      "uninsured",
      "underinsured",
    ],
    seoTitle: "Personal Injury Attorney | Fort Worth, Texas",
    seoDescription:
      "Fort Worth personal injury attorney. Vehicle wrecks, 18-wheeler collisions, and premises cases prepared for trial. No recovery, no fee.",
  },
  {
    slug: "wrongful-death",
    title: "Wrongful Death",
    group: "injury",
    sort: 2,
    tagline: "Texas gives the family a claim. The law decides who, and how long.",
    body: [
      "A Texas wrongful death claim belongs to a defined group of people: the surviving spouse, the children, and the parents of the person who died. The Wrongful Death Act does not extend the claim to siblings, and it does not extend it to anyone else, however close they were. Any one of those family members may file, and they may file on behalf of all of them.",
      "There is a second claim that people often do not know about. A survival action belongs to the estate rather than the family, and it carries what the person who died would have been entitled to recover themselves — the conscious pain and suffering, the medical expenses, the funeral costs. The two claims are usually brought together, and they are proved differently.",
      "What can be recovered is broader than a bill. Texas allows the family to recover for lost earning capacity and financial support, lost inheritance, lost care, counsel, and household services, and for the mental anguish and loss of companionship and society that comes with losing a spouse, a parent, or a child. Where the death was caused by a willful act or omission or by gross negligence, Texas law also permits exemplary damages. If more than one family member recovers, the jury apportions the award among them.",
      "The deadlines are short and they are not all the same. The general limitations period for a death claim is two years from the date of death. That period is measured differently for a child, and it can be cut dramatically when the defendant is a governmental entity — a city, a county, a school district, a state agency — because the Texas Tort Claims Act requires formal written notice within months of the incident, and many city charters demand it sooner still. Miss that notice and the claim can be gone before the two years ever runs.",
      "Certain defendants bring their own rulebook. A death caused by medical care is a health care liability claim: pre-suit notice with an authorization form, an expert report served on a strict schedule, and statutory limits on noneconomic damages. A death on a job site raises workers' compensation questions and, often, claims against parties other than the employer. A death involving a commercial vehicle brings federal motor-carrier regulations into the proof. Which category the case falls into changes what must be done in the first month.",
      "Two more things shape the outcome from the start. Texas apportions responsibility among everyone involved, and a claimant found more than fifty percent responsible recovers nothing — which is why the defense invests early in blaming the person who died. And where a minor child is among the beneficiaries, any settlement is subject to court approval, usually with a guardian ad litem appointed to speak for the child's share.",
      "We will explain all of this plainly, in one sitting, before you decide anything. There is no obligation and no fee for that conversation.",
    ],
    approach:
      "A death case is built backward from what a jury will be asked to decide: who is entitled to bring it, what the family lost, and why the defendant is responsible for it. We identify the beneficiaries and the estate's claim at the outset, calendar every notice deadline the defendant's identity triggers, and preserve the proof before it is gone — because in these cases the first month is often the one that decides the case.",
    keywords: [
      "wrongful death",
      "died",
      "killed",
      "fatal",
      "fatality",
      "loved one died",
      "survival action",
      "beneficiary",
      "estate claim",
      "fatal crash",
      "fatal accident",
    ],
    seoTitle: "Wrongful Death Attorney | Texas Wrongful Death Act Claims",
    seoDescription:
      "Texas wrongful death attorney. Who may bring a claim, what the Wrongful Death and survival statutes allow, and the deadlines that decide these cases.",
  },
  {
    slug: "civil-commercial-litigation",
    title: "Civil & Commercial Litigation",
    group: "litigation",
    sort: 3,
    tagline: "Business disputes, tried like they will be tried.",
    body: [
      "Most lawsuits settle. They settle on the terms of the side that was ready to try them. We build every commercial case from the verdict backward — what a jury needs to hear, what the record has to prove, what the other side cannot survive.",
      "We handle contract breaches, business divorces, fraud, fiduciary disputes, and the tangled fights that come when money and trust both run out. The facts are usually complicated. Our job is to make them simple enough for twelve people to decide in your favor.",
      "We also represent Texas landowners and ranches against industrial neighbors. When a compressor station, pump station, pipeline facility, or similar operation moves in next to a working ranch — the noise, the lights, the emissions, the traffic — Texas private-nuisance law gives the landowner a claim, and we know how to try it. These cases are about the use and enjoyment of land that has often been in a family for generations, and we treat them that way.",
      "Discovery is where cases are won or lost long before trial. We treat it that way — depositions taken to lock in testimony, documents pursued until the story is complete, motions filed to narrow the fight to the ground we want.",
    ],
    approach:
      "We prepare every matter as if it is going to trial, because that is how you win whether you ever pick a jury or not. A defendant who knows you will try the case pays more to settle it. A defendant who thinks you will fold pays nothing.",
    keywords: [
      "commercial litigation",
      "business litigation",
      "breach of contract",
      "business dispute",
      "business divorce",
      "partnership dispute",
      "fiduciary dispute",
      "fraud",
      "non-compete",
      "private nuisance",
      "nuisance lawsuit",
      "compressor station",
      "pump station",
      "ranch",
    ],
    seoTitle: "Civil & Commercial Litigation Attorney | Fort Worth, Texas",
    seoDescription:
      "Texas civil and commercial litigation attorney. Contract, fraud, partnership, and business disputes — plus private-nuisance suits for ranches and landowners against compressor stations, pump stations, and pipeline facilities. Prepared for trial from day one.",
  },
  {
    slug: "plaintiffs-litigation",
    title: "Business & Plaintiff's Litigation",
    group: "litigation",
    sort: 4,
    tagline: "High-stakes claims, prepared so the other side has to take the number seriously.",
    body: [
      "Being right is not the same as being paid. The law gives you a claim; collecting on it takes pressure, and pressure comes from a credible threat of trial.",
      "We bring claims for people and businesses who were wronged and want a result, not a lecture. We tell you early what your case is worth, what it will take, and where the weak points are — yours and theirs.",
      "The high-stakes end of this work is where we live: fraud claims against banks and financial institutions, partnership disputes — including large multi-partner and family-partnership breakups where the business itself is the prize — and business torts where the damages justify a real fight.",
      "We do not file cases we are not prepared to finish. That is what makes our demand letters land.",
    ],
    approach:
      "A plaintiff is only as strong as their willingness to put the case in front of a jury. We prepare to do exactly that, every time, so the other side has to take the number seriously.",
    keywords: [
      "bank fraud",
      "sue a bank",
      "fraud claim against a financial institution",
      "partnership dispute",
      "family partnership dispute",
      "business partner dispute",
      "business tort",
      "high-stakes business claim",
    ],
    seoTitle: "Business & Plaintiff's Litigation Attorney | Texas",
    seoDescription:
      "Texas plaintiff's litigation attorney. Bank fraud, partnership disputes, and high-stakes business claims prepared for trial so the other side has to take your number seriously.",
  },
  {
    slug: "data-center-easements",
    title: "Data Center & Utility Easements",
    group: "litigation",
    sort: 5,
    tagline: "They need your land. That is leverage — if you use it before you sign.",
    body: [
      "Data centers are being built across Texas, and every one of them needs more than a building site. They need water, power, gas, and fiber — and those lines have to cross somebody's land. If a data center developer, a water supplier, or a pipeline or transmission company has contacted you about a waterline easement or any other utility easement, understand what is actually happening: they have a route problem, and your property is the solution. That is a negotiation, not a formality.",
      "The first offer that arrives with the friendly letter is rarely the market. An easement is a permanent burden on your land — it affects what you can build, where you can fence, what a future buyer will pay, and what happens every time a crew wants access. We represent landowners statewide in negotiating these agreements: the price, but also the terms that matter for the next fifty years — the width and route of the corridor, surface use and access rules, damage and restoration obligations, fencing and gates, depth of bury, abandonment and termination, insurance and indemnity, and whether the easement can be assigned or widened later without paying you again.",
      "When a data center goes in, whole neighborhoods get letters at once. If your neighbors are being approached for the same waterline or transmission corridor, that changes the leverage — a route is only as cheap as its most expensive parcel. We advise individual owners and groups of neighboring owners, and we structure terms so early signers aren't left worse off than the holdouts.",
      "One question controls the posture of every one of these negotiations: can they take the easement if you say no? Some water suppliers, pipelines, and electric utilities hold condemnation power; a private data center developer generally does not. Which case you are in determines whether the fight is about maximizing compensation in a condemnation framework or simply saying no until the number and the terms are right. We tell you which one you are in before you make a single decision.",
      "We negotiate from a trial firm's posture. The other side's land agents make a living on landowners who sign the first draft. Ours make a living on the ones who don't.",
    ],
    approach:
      "We prepare every negotiation as if it ends in a courtroom — because the ones that are prepared that way rarely need to. A developer on a construction schedule pays for certainty; our job is to make your signature the expensive part of their route.",
    keywords: [
      "easement",
      "waterline",
      "water line",
      "data center",
      "utility easement",
      "pipeline",
      "right of way",
      "transmission line",
      "land agent",
      "eminent domain",
      "condemnation",
    ],
    seoTitle: "Data Center Easement Lawyer | Waterline & Utility Easements | Texas Statewide",
    seoDescription:
      "Texas lawyer for landowners approached by data centers, water suppliers, and utilities for waterline, electric, gas, and pipeline easements. We negotiate price and terms — statewide, for individual owners and groups of neighbors.",
  },
  {
    slug: "probate",
    title: "Probate & Estate Administration",
    group: "probate",
    sort: 7,
    tagline: "Settle the estate. Or fight for your share of it.",
    body: [
      "Probate is the court process of settling what someone left behind. Done right it is orderly. Done wrong, or contested, it becomes litigation among the people who are grieving.",
      "We guide executors and families through administration in Bosque, Johnson, Tarrant, and Dallas counties — the application, the letters, the inventory, the notices to creditors and beneficiaries, and the closing — and we litigate will contests, heirship disputes, and fiduciary fights when they arise.",
      "When the family cannot agree, you want a lawyer who tries cases. We are that lawyer.",
    ],
    approach:
      "An uncontested probate is administered cleanly; a contested one is litigation, and we prepare it for trial like any other. Either way, we are ready for the version that ends up in front of a judge.",
    keywords: [
      "probate",
      "estate administration",
      "inheritance",
      "estate",
      "executor",
      "administrator",
      "letters testamentary",
      "will contest",
      "heirship",
      "heir",
      "died",
      "passed away",
      "fiduciary",
    ],
    seoTitle: "Probate Attorney | Estate Administration & Will Contests in Texas",
    seoDescription:
      "Texas probate attorney. Estate administration and will-contest litigation in Bosque, Johnson, Tarrant, and Dallas counties.",
  },
  {
    slug: "estate-succession-planning",
    title: "Estate & Succession Planning",
    group: "probate",
    sort: 8,
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
    slug: "attorney-succession-planning",
    title: "Attorney Succession Planning",
    group: "business",
    sort: 11,
    tagline: "Succession plan consulting for solo and small-firm attorneys.",
    body: [
      "Very few firms do this work. We do — because we have done it the hard way.",
      "Our firm assisted in winding down the practice of a solo attorney who died suddenly, leaving an active practice of more than 200 open cases. He had no succession plan and no will. His wife — not an attorney — was left facing active litigation with live deadlines, dispositive-motion deadlines and trial settings among them, and no way to know what had to be done. We helped bring that practice to an orderly end.",
      "We consult with solo and small-firm attorneys on planning the succession of their practice before it is ever needed — and when there was no plan, we help the family wind the practice down.",
    ],
    approach:
      "Identify what is live, what is owed, and what cannot wait — then move on the deadlines first.",
    keywords: [
      "attorney succession",
      "law firm succession plan",
      "succession plan",
      "deceased attorney",
      "attorney died",
      "wind down law firm",
      "winding down",
      "cessation of practice",
      "custodian attorney",
      "law practice",
      "solo attorney",
    ],
    seoTitle: "Attorney Succession Plan Consulting | Solo & Small-Firm | Texas",
    seoDescription:
      "Succession plan consulting for solo and small-firm Texas attorneys — and help winding down a practice when there was no plan. We assisted in winding down a suddenly deceased solo attorney's 200+ case practice.",
  },
  {
    slug: "business-formations-transactions",
    title: "Business Formations & Transactions",
    group: "business",
    sort: 9,
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
    slug: "business-related-matters",
    title: "Business Counsel for Owners",
    group: "business",
    sort: 10,
    tagline: "Counsel from a lawyer who knows where it ends up.",
    body: [
      "Most business advice is given by people who have never had to defend it in court. We have. That changes the advice.",
      "We help owners with the day-to-day legal questions that come with running a company — contracts, disputes with vendors and customers, employment issues, and the problems that show up without warning.",
      "Nobody ever wants to need a lawyer, but when you do, you want one who is going to get you the answers you need — not one who is going to pass the buck.",
    ],
    approach:
      "We give counsel with the courtroom in mind. The agreement we draft is the agreement we would want to defend, and the position we advise is one we are prepared to back at trial.",
    keywords: [
      "business attorney",
      "counsel for business owners",
      "outside general counsel",
      "business contracts",
      "company owner",
    ],
    seoTitle: "Business Attorney | Texas Counsel for Owners",
    seoDescription:
      "Texas business attorney. Practical counsel from a trial lawyer — contracts, disputes, and the problems that show up without warning.",
  },
  {
    slug: "appellate-law",
    title: "Appellate Law",
    group: "litigation",
    sort: 6,
    tagline: "If you sue and lose, you have to be able to appeal.",
    body: [
      "An appeal is not a second trial. It is a different craft — built on the record, the standard of review, and error that was preserved while the trial was still happening.",
      "We handle appeals on both sides, with affirmances on the record. We have argued before the Court of Appeals and briefed matters through the Supreme Court of Texas and into the Fifth Circuit.",
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
      "Texas appellate attorney. Civil appeals, supersedeas bonds, and oral argument. Affirmances on the record.",
  },
  {
    slug: "criminal-defense",
    title: "Criminal Defense",
    group: "other",
    sort: 13,
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
    slug: "consumer-debt-defense",
    title: "Credit Card & Debt-Buyer Lawsuit Defense",
    group: "creditcard",
    sort: 12,
    tagline: "A lawsuit is not a judgment. We make the card company or the debt buyer prove it.",
    body: [
      "Debt buyers file lawsuits in volume and count on people not answering. A default judgment is the easiest money they make. Showing up changes the math.",
      "We have defended clients against the biggest names — Discover, Capital One, Bank of America, Chase, Barclays, LVNV, Midland — and we know what they can actually prove and what they are bluffing.",
      "Often the plaintiff cannot produce the documents the law requires. Sometimes the debt is time-barred. Sometimes it is not even yours. We make them prove every element before a dollar changes hands.",
    ],
    approach:
      "We answer, we demand proof, and we are prepared to try it. Debt buyers price their cases on how much resistance they expect. We make ourselves expensive to sue.",
    keywords: [
      "sued by a credit card company",
      "credit card lawsuit",
      "debt buyer lawsuit",
      "consumer debt attorney",
      "served with a credit card lawsuit",
      "default judgment",
      "Discover",
      "Capital One",
      "Bank of America",
      "Chase",
      "Barclays",
      "LVNV Funding",
      "Midland Credit Management",
    ],
    seoTitle: "Credit Card Lawsuit Defense | Texas Consumer Debt Attorney",
    seoDescription:
      "Texas consumer debt attorney for people sued by a credit card company or a debt buyer — Discover, Capital One, LVNV, Midland. Make them prove it. We defend and try these cases.",
  },
];

export function getPracticeAreaSeed(slug: string) {
  return PRACTICE_AREAS.find((p) => p.slug === slug);
}

/**
 * Bucket practice areas into the display groups, in priority order.
 *
 * Used by the home page, the practice-areas index, and the header menu so all
 * three present the same sequence from one definition. Two deliberate
 * guarantees: a group with nothing in it is dropped rather than rendered as an
 * empty heading, and an area whose group is not recognised still appears (under
 * a trailing catch-all) instead of silently vanishing — which matters because
 * the live rows come from the database and may lag a deploy until the content
 * refresh is run.
 */
export function groupPracticeAreas<T extends { group: string; sort: number }>(
  areas: T[],
  opts: { fiveOnly?: boolean } = {},
): { id: string; label: string; blurb: string; areas: T[] }[] {
  const bySort = (a: T, b: T) => a.sort - b.sort;
  const known = new Set<string>(PRACTICE_GROUPS.map((g) => g.id));

  const groups = PRACTICE_GROUPS.map((g) => ({
    id: g.id as string,
    label: g.label,
    blurb: g.blurb,
    areas: areas.filter((a) => a.group === g.id).sort(bySort),
  })).filter((g) => g.areas.length > 0);

  // The header menu, the home page and the summaries for search engines show the five sections and nothing else.
  if (opts.fiveOnly) return groups;
  const orphans = areas.filter((a) => !known.has(a.group)).sort(bySort);
  if (orphans.length) {
    groups.push({
      id: "other",
      label: "Additional Practice Areas",
      blurb: "",
      areas: orphans,
    });
  }
  return groups;
}

/**
 * Practice areas whose URL changed, mapped to the slug that replaces them.
 * Kept so old links, bookmarks, and indexed search results keep working — the
 * app redirects these rather than 404ing. The combined personal-injury and
 * wrongful-death page was split into two; its URL points at personal injury,
 * which is where its case results now live.
 */
/** The pages inside the five sections, in menu order: what the firm presents as its practice. */
export function fivePracticeAreas<T extends { group: string; sort: number }>(areas: T[]): T[] {
  return groupPracticeAreas(areas, { fiveOnly: true }).flatMap((g) => g.areas);
}

export const PRACTICE_AREA_REDIRECTS: Record<string, string> = {
  "personal-injury-wrongful-death": "personal-injury",
  // Withdrawn subject (see src/lib/content/retired.ts); its traffic goes to civil litigation.
  "dtpa": "civil-commercial-litigation",
};
