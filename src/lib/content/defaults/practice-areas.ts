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
 * the header menu. The order is deliberate: injury and death work first,
 * general civil litigation next, counsel work after that, and the debt and
 * creditor pages last. Every area stays fully reachable — nothing is hidden,
 * they are simply not what a first-time visitor lands on first.
 */

export type PracticeGroup =
  | "injury"
  | "litigation"
  | "counsel"
  | "appeals"
  | "defense";

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
    label: "Injury & Wrongful Death",
    blurb: "When someone is badly hurt or killed, and an insurer is keeping score.",
  },
  {
    id: "litigation",
    label: "Civil & Commercial Litigation",
    blurb: "The spine of the practice. Every other area is built on it.",
  },
  {
    id: "counsel",
    label: "Probate, Estates & Business",
    blurb: "Built by a trial firm, so the plan holds up when it is tested.",
  },
  {
    id: "appeals",
    label: "Appeals & Criminal Defense",
    blurb: "The record going in, and the record coming out.",
  },
  {
    id: "defense",
    label: "Debt, Collections & Creditor Matters",
    blurb: "When the papers land on your desk, the clock is already running.",
  },
];

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
    sort: 4,
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
    slug: "dtpa",
    title: "Deceptive Trade Practices Act (DTPA)",
    group: "litigation",
    sort: 5,
    tagline: "When a business lied to you, Texas law has teeth.",
    body: [
      "The Texas Deceptive Trade Practices Act exists because ordinary consumers cannot out-lawyer a company on their own. Used right, it shifts the leverage — and it can multiply damages and shift fees.",
      "We bring DTPA claims for buyers who were deceived, sold defective goods, or strung along by businesses that counted on them giving up. We also defend businesses against DTPA claims that overreach.",
      "These cases turn on notice, intent, and proof. We handle each step precisely, because a procedural slip can cost the statute's best remedies.",
      "One limit, stated plainly so nobody wastes their time: we do not take DTPA claims against vehicle dealerships. That includes car lots, truck dealers, trailer lots, and RV dealers, new or used. It is a large share of the DTPA calls we get and it is not work this firm does — if that is your matter, we will tell you on the first call rather than let you lose weeks.",
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
      "Texas DTPA attorney. Consumer deception, defective goods, and misrepresentation claims and defense prepared for trial. We do not handle claims against vehicle dealerships.",
  },
  {
    slug: "probate",
    title: "Probate & Estate Administration",
    group: "counsel",
    sort: 6,
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
    group: "counsel",
    sort: 7,
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
    slug: "business-formations-transactions",
    title: "Business Formations & Transactions",
    group: "counsel",
    sort: 8,
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
    title: "Business-Related Matters",
    group: "counsel",
    sort: 9,
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
    slug: "appellate-law",
    title: "Appellate Law",
    group: "appeals",
    sort: 10,
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
    group: "appeals",
    sort: 11,
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
    title: "Consumer Debt Defense",
    group: "defense",
    sort: 12,
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
    sort: 13,
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
    slug: "garnishments",
    title: "Garnishments",
    group: "defense",
    sort: 14,
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
    sort: 15,
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
    slug: "foreclosures",
    title: "Foreclosures",
    group: "defense",
    sort: 16,
    tagline: "A posted sale date is a deadline, not a verdict.",
    body: [
      "Most Texas foreclosures never see a courtroom. A deed of trust gives the lender a power of sale, and the statute lets them use it on a schedule measured in weeks: on a home, written notice of default with at least twenty days to cure, then notice of the sale at least twenty-one days before it happens, then a sale on the first Tuesday of the month at the county courthouse. The speed is the point. It is also the weakness — each of those steps has requirements, and lenders and servicers do not always meet them.",
      "Some foreclosures cannot proceed that way at all. A Texas home equity loan, a reverse mortgage, a transferred property tax lien, and a homeowners association assessment lien all require a court order before a sale, obtained through an expedited proceeding under Rule 736. That proceeding has its own answer deadline, and letting it pass uncontested hands the lienholder the order.",
      "The sale is not always the end of the exposure either. A lender who sells the property for less than the balance can sue for the deficiency, and Texas gives a two-year window to do it — along with a right to have the property's fair market value determined and offset against the claim, which is often worth far more than the number in the demand letter. After a sale, possession is decided separately, in a forcible detainer suit that turns on the deed of trust rather than on who owns the property.",
      "We represent homeowners and property owners facing a sale, borrowers defending a deficiency, and lienholders who need a foreclosure done correctly the first time. Where the sale was wrongful — no real default, defective notice, a sale conducted outside the statute — that is a claim, and it is litigated like one.",
      "Call before the sale date if you possibly can. Options narrow sharply once the property is sold, and the calendar in these matters is unforgiving.",
    ],
    approach:
      "We work a foreclosure on two tracks at once: the calendar, because every date in the statute is a deadline that can be used or lost, and the paper, because a power of sale is only as good as the notices and the assignments behind it. Both tracks are built to be provable in court, not just argued to a servicer.",
    keywords: [
      "foreclosure",
      "foreclose",
      "sale date",
      "notice of default",
      "notice of sale",
      "save my house",
      "deed of trust",
      "deficiency",
      "home equity",
      "hoa foreclosure",
      "wrongful foreclosure",
      "eviction after foreclosure",
    ],
    seoTitle: "Foreclosure Attorney | Texas Notice, Sale & Deficiency Defense",
    seoDescription:
      "Texas foreclosure attorney. Notice and sale requirements, Rule 736 home equity and HOA foreclosures, deficiency defense, and wrongful foreclosure claims.",
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
): { id: string; label: string; blurb: string; areas: T[] }[] {
  const bySort = (a: T, b: T) => a.sort - b.sort;
  const known = new Set<string>(PRACTICE_GROUPS.map((g) => g.id));

  const groups = PRACTICE_GROUPS.map((g) => ({
    id: g.id as string,
    label: g.label,
    blurb: g.blurb,
    areas: areas.filter((a) => a.group === g.id).sort(bySort),
  })).filter((g) => g.areas.length > 0);

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
export const PRACTICE_AREA_REDIRECTS: Record<string, string> = {
  "personal-injury-wrongful-death": "personal-injury",
};
