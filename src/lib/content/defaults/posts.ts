/**
 * Blog / Insights seed content.
 *
 * Two kinds of posts:
 *  - Firm-news posts drawn ONLY from verified results (Section 6.4). Seeded
 *    HIDDEN so Max reviews and flips them on.
 *  - Educational posts (general legal knowledge, zero invented firm cases).
 *    10 backdated as Published (Jan–Mar 2026); the rest Scheduled across 2026
 *    with irregular gaps; auto-published by Vercel Cron.
 *
 * Bodies are HTML. Internal links to practice areas and related posts are woven
 * in per the spec. This seed set is expanded over time via the admin Blog tab.
 */

export type PostStatus = "draft" | "hidden" | "scheduled" | "published";

export type BlogPostSeed = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  bannerImage?: string;
  bannerFocal?: string;
  category?: string;
  tags?: string[];
  author?: string;
  isFirmNews?: boolean;
  status: PostStatus;
  publishAt?: string; // ISO
  seoTitle?: string;
  seoDescription?: string;
  relatedPractices?: string[];
  relatedPosts?: string[];
};

const AUTHOR = "T. Maxwell Smith";

/** Build an HTML body from paragraphs/headings for compact authoring. */
function html(blocks: ([("p" | "h2"), string])[]): string {
  return blocks.map(([tag, text]) => `<${tag}>${text}</${tag}>`).join("");
}

function paLink(slug: string, label: string) {
  return `<a href="/practice-areas/${slug}">${label}</a>`;
}

/* ============================ FIRM NEWS (HIDDEN) ========================== */

const firmNews: BlogPostSeed[] = [
  {
    slug: "summary-judgment-dismissal-11-2m",
    title: "Client Dismissed from $11.2M Litigation on Summary Judgment",
    excerpt:
      "Brought in roughly sixty days before trial, we won summary judgment dismissing every claim against our client. The following month, an $11.2M judgment was entered against other parties.",
    isFirmNews: true,
    status: "hidden",
    category: "civil-commercial-litigation",
    relatedPractices: ["civil-commercial-litigation"],
    body: html([
      ["p", "We were retained as defense counsel for a third-party defendant roughly sixty days before the jury-trial setting. That is not much time. It was enough."],
      ["p", "We filed and won both traditional and no-evidence summary judgment, dismissing every claim against our client — fraud, conversion, fraudulent transfer, and conspiracy — with prejudice. The following month, the court entered judgment of $11,219,000 against other parties in the same case. Our client owed nothing."],
      ["p", `The case is a clean illustration of why ${paLink("civil-commercial-litigation", "trial readiness")} matters even when you never reach a jury. A motion that ends the case is only possible when the file is built to win one.`],
      ["p", "Star Café, LLC v. Johnny's Beer Garden LLC, Cause No. 141-350557-24, 141st Judicial District Court, Tarrant County, Texas."],
    ]),
  },
  {
    slug: "two-affirmances-supersedeas-bond-recovered",
    title: "Two Appellate Affirmances, Both Judgments Upheld",
    excerpt:
      "We defended a property owner through two separate appeals, secured affirmances in both, and saw a petition for review dismissed by the Supreme Court of Texas.",
    isFirmNews: true,
    status: "hidden",
    category: "appellate-law",
    relatedPractices: ["appellate-law"],
    body: html([
      ["p", "Post-foreclosure litigation has a way of generating appeals. We defended a property owner, as appellee, through two of them in the Fifth Court of Appeals at Dallas."],
      ["p", "Both judgments were affirmed. A petition for review was dismissed by the Supreme Court of Texas."],
      ["p", `Good ${paLink("appellate-law", "appellate work")} starts at trial, with a record built to hold up. These results came from exactly that discipline.`],
    ]),
  },
  {
    slug: "garnishment-dissolved-bill-of-review",
    title: "Garnishment Dissolved, Old Judgment Vacated, Funds Returned",
    excerpt:
      "We got a writ of garnishment dissolved, the underlying 2006 judgment vacated by bill of review, and the garnished funds released to our client. The creditor's appeal was dismissed as moot.",
    isFirmNews: true,
    status: "hidden",
    category: "garnishments",
    relatedPractices: ["garnishments"],
    body: html([
      ["p", "Our client's funds were frozen on a writ of garnishment built on a judgment from 2006. We attacked it from every direction."],
      ["p", `The writ was dissolved. A ${paLink("garnishments", "bill of review")} was granted, vacating the underlying judgment. The court ordered the garnished funds released to our client. When the creditor appealed, the appeal was dismissed as moot.`],
      ["p", "Second Court of Appeals, Fort Worth, No. 02-23-00138-CV (Dec. 19, 2024)."],
    ]),
  },
  {
    slug: "oral-argument-seventh-court-of-appeals",
    title: "Oral Argument Before the Seventh Court of Appeals",
    excerpt:
      "Watch Max argue a civil appeal before the Seventh Court of Appeals in Amarillo. The full argument is available on the court's public recording.",
    isFirmNews: true,
    status: "hidden",
    category: "appellate-law",
    relatedPractices: ["appellate-law"],
    body: html([
      ["p", "Appellate advocacy is its own craft. The full recording of Max's argument before the Seventh Court of Appeals is available to watch."],
      ["p", `See the ${paLink("appellate-law", "Appellate Law")} page for the embedded video. Jeremy Scot Nelson v. The City of Lubbock, No. 07-23-00209-CV (argued 2024).`],
    ]),
  },
  {
    slug: "appeal-prosecuted-against-national-bank",
    title: "Appeal Prosecuted to Resolution Against a National Bank",
    excerpt:
      "We served as appellate counsel for the appellant in a dispute with JPMorgan Chase Bank, N.A., prosecuting the appeal until the matter was resolved.",
    isFirmNews: true,
    status: "hidden",
    category: "appellate-law",
    relatedPractices: ["appellate-law", "consumer-debt-defense"],
    body: html([
      ["p", "We took the appeal for the appellant in a dispute with JPMorgan Chase Bank, N.A., and prosecuted it until the matter was resolved."],
      ["p", "Fifth Court of Appeals, No. 05-25-00712-CV (2025)."],
    ]),
  },
  {
    slug: "six-figure-partnership-fraud-settlement",
    title: "Six-Figure Settlement in a Partnership Fraud Dispute",
    excerpt:
      "A partnership built on a lie is still a partnership until someone proves the lie. We did, and the matter resolved for a six-figure settlement.",
    isFirmNews: true,
    status: "hidden",
    category: "civil-commercial-litigation",
    relatedPractices: ["civil-commercial-litigation", "plaintiffs-litigation"],
    body: html([
      ["p", "Partnership disputes are personal, and the worst ones start with fraud. This one resolved for a six-figure settlement."],
      ["p", `When you are owed money, you have to be willing to ${paLink("plaintiffs-litigation", "sue for it")}. That willingness is what produces a settlement worth taking.`],
    ]),
  },
  {
    slug: "six-figure-uim-recovery",
    title: "Six-Figure Recovery on an Underinsured Motorist Claim",
    excerpt:
      "The at-fault driver did not carry enough insurance. Our client's own UM/UIM coverage made up the difference, resulting in a six-figure recovery.",
    isFirmNews: true,
    status: "hidden",
    category: "personal-injury",
    relatedPractices: ["personal-injury"],
    body: html([
      ["p", "The driver who caused the wreck carried far too little insurance to cover the harm. That is what UM/UIM coverage is for."],
      ["p", `We pursued our client's own ${paLink("personal-injury", "underinsured motorist coverage")} and recovered six figures.`],
    ]),
  },
  {
    slug: "defamation-settlement",
    title: "Defamation Matter Resolved",
    excerpt: "A defamation matter resolved by settlement.",
    isFirmNews: true,
    status: "hidden",
    category: "civil-commercial-litigation",
    relatedPractices: ["civil-commercial-litigation"],
    body: html([
      ["p", "Words can do real damage, and the law provides a remedy. This defamation matter resolved by settlement."],
    ]),
  },
  {
    slug: "criminal-jury-trial-acquittal",
    title: "Acquittal at Jury Trial",
    excerpt:
      "The State has the burden. In this assault case, tried to a jury, we held them to it and the jury returned an acquittal.",
    isFirmNews: true,
    status: "hidden",
    category: "criminal-defense",
    relatedPractices: ["criminal-defense"],
    body: html([
      ["p", "An accusation is not proof. We tried this assault–bodily injury case to a jury as lead counsel, made the State prove every element, and the jury returned an acquittal."],
      ["p", `This is what ${paLink("criminal-defense", "criminal defense")} is supposed to look like: the burden stays where it belongs.`],
    ]),
  },
];

/* ============================ EDUCATIONAL ================================ */

type EduInput = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  related: string[];
  relatedPosts?: string[];
  body: ([("p" | "h2"), string])[];
};

const eduRaw: EduInput[] = [
  // ---- Civil / commercial litigation (8) ----
  {
    slug: "anatomy-of-a-texas-lawsuit",
    title: "The Anatomy of a Texas Lawsuit",
    excerpt:
      "From the petition to the verdict, here is how a civil case actually moves through a Texas court — and where it is really won.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "plaintiffs-litigation"],
    relatedPosts: ["what-discovery-really-is", "summary-judgment-explained"],
    body: [
      ["p", "Most people picture a lawsuit as a dramatic trial. In reality, the trial is the last act, and most cases never reach it. Understanding the steps in between tells you where a case is actually won."],
      ["h2", "Pleadings"],
      ["p", "A suit begins with a petition stating the claims, followed by an answer. The answer is what stops a default; filing one, on time, keeps you in the fight."],
      ["h2", "Discovery"],
      ["p", "Then comes discovery — the exchange of documents, written questions, and depositions. This is the long middle of a case and, more often than not, where it is decided."],
      ["h2", "Motions and trial"],
      ["p", "Dispositive motions can end a case before trial. If the case survives, it goes to a jury or a judge. A party that prepared as if trial were inevitable holds the leverage at every earlier stage."],
    ],
  },
  {
    slug: "summary-judgment-explained",
    title: "Summary Judgment, Explained",
    excerpt:
      "How a court can decide a case — or part of one — without a trial, and why a well-built motion can end litigation early.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "appellate-law"],
    relatedPosts: ["no-evidence-motions-in-texas", "anatomy-of-a-texas-lawsuit"],
    body: [
      ["p", "Summary judgment lets a court resolve a claim without a trial when the material facts are not genuinely disputed and the law dictates the result."],
      ["h2", "Why it matters"],
      ["p", "A granted motion can dismiss claims entirely. We have used it to remove a client from multi-million-dollar litigation. But these motions are won on the record built long before they are filed."],
      ["h2", "What it takes"],
      ["p", "The moving party must show there is nothing for a jury to decide. That requires evidence, not argument — which is why discovery and motion practice are inseparable."],
    ],
  },
  {
    slug: "no-evidence-motions-in-texas",
    title: "The No-Evidence Motion: A Texas Specialty",
    excerpt:
      "After enough time for discovery, you can force the other side to produce proof on every element of its claim — or lose it.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation"],
    body: [
      ["p", "Texas gives defendants a powerful tool: the no-evidence motion for summary judgment. It says, in effect, 'you have had time to find your proof; show it or the claim is gone.'"],
      ["p", "The claimant must then point to actual evidence on each challenged element. If it cannot, the court dismisses the claim. This is why a plaintiff who files without proof, hoping to find it later, takes a serious risk."],
    ],
  },
  {
    slug: "what-discovery-really-is",
    title: "What Discovery Really Is",
    excerpt:
      "Depositions, document requests, and interrogatories are not paperwork. They are how a case gets built.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "personal-injury"],
    body: [
      ["p", "Discovery is the formal exchange of evidence before trial. Done well, it wins cases. Done lazily, it loses them."],
      ["p", "A deposition locks a witness into a story. A document request can surface the email that decides everything. We treat discovery as the main event it usually is."],
    ],
  },
  {
    slug: "why-trial-readiness-drives-settlements",
    title: "Why Trial Readiness Drives Settlements",
    excerpt:
      "The number a defendant will pay to settle is a measure of what they think you can take from them at trial.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "plaintiffs-litigation"],
    body: [
      ["p", "Settlement value is not abstract. It is the other side's estimate of the trial outcome, discounted by their confidence that you will not get there."],
      ["p", "A firm known to try cases changes that estimate. That is why we prepare every matter for trial — it pays whether or not we ever pick a jury."],
    ],
  },
  {
    slug: "the-seamless-web-of-the-law",
    title: "The Seamless Web: Why One Matter Bleeds Into Another",
    excerpt:
      "A contract problem becomes a lawsuit, which becomes a judgment, which becomes a collection fight, which becomes an appeal. A lawyer needs the whole map.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "appellate-law", "commercial-debt-collection-defense"],
    body: [
      ["p", "Legal problems do not respect practice-area boundaries. The law is a seamless web, and a matter that starts in one corner of it often ends in another."],
      ["p", "A lawyer without the full baseline misses things — the collection consequence of a judgment, the appellate issue buried in a trial ruling. We practice across the web because the matters do too."],
    ],
  },
  {
    slug: "breach-of-contract-what-you-can-recover",
    title: "Breach of Contract: What You Can Actually Recover",
    excerpt:
      "Winning a breach claim is one thing. Understanding the damages — and the limits — is another.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "business-related-matters"],
    body: [
      ["p", "When someone breaks a contract, the law aims to put you where performance would have. That usually means the benefit of the bargain, not punishment."],
      ["p", "Some contracts shift attorney's fees; many do not. Knowing the real recovery before you sue keeps expectations — and strategy — grounded."],
    ],
  },
  {
    slug: "business-divorce-when-partners-split",
    title: "Business Divorce: When Partners Split",
    excerpt:
      "The end of a partnership is rarely clean. Good documents and a trial-ready posture keep it from becoming a disaster.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "business-formations-transactions"],
    body: [
      ["p", "When co-owners fall out, the fight is over control, money, and trust — usually all three. The governing documents decide how bad it gets."],
      ["p", "A clear buy-sell provision can prevent litigation. When it cannot, the dispute becomes ordinary litigation, and we prepare it for trial like any other."],
    ],
  },
  // ---- Appeals (5) ----
  {
    slug: "preserving-error-at-trial",
    title: "Preserving Error: Why Appeals Are Won at Trial",
    excerpt:
      "An appellate court will not fix a mistake nobody objected to. Preservation is the price of admission.",
    category: "appellate-law",
    related: ["appellate-law", "civil-commercial-litigation"],
    body: [
      ["p", "To raise an issue on appeal, you generally had to raise it at trial — with a timely, specific objection or request. Otherwise it is waived."],
      ["p", "This is why appellate thinking belongs in the courtroom from the start. We protect the record while the trial is still happening, so the issues survive."],
    ],
  },
  {
    slug: "what-a-supersedeas-bond-does",
    title: "What a Supersedeas Bond Does",
    excerpt:
      "Losing a money judgment does not mean the winner can empty your accounts tomorrow. A supersedeas bond buys time to appeal.",
    category: "appellate-law",
    related: ["appellate-law"],
    body: [
      ["p", "When you appeal a money judgment, the winner can normally try to collect immediately. A supersedeas bond suspends that, protecting both sides during the appeal."],
      ["p", "If you win the appeal, the bond comes back. Getting the amount and the security right at the outset is part of the work."],
    ],
  },
  {
    slug: "standards-of-review-explained",
    title: "Standards of Review, Explained",
    excerpt:
      "Not every appellate issue gets a fresh look. The standard of review often decides the appeal before the briefing starts.",
    category: "appellate-law",
    related: ["appellate-law"],
    body: [
      ["p", "Appellate courts review some questions fresh and defer heavily on others. A pure legal question gets a clean look; a discretionary call stands unless the judge clearly abused discretion."],
      ["p", "Knowing the standard tells you which arguments are worth making and which are nearly hopeless. It shapes the whole appeal."],
    ],
  },
  {
    slug: "the-appellate-timeline",
    title: "The Appellate Timeline in Texas",
    excerpt:
      "Deadlines drive appeals, and they come fast. Missing one can end your appeal before it begins.",
    category: "appellate-law",
    related: ["appellate-law"],
    body: [
      ["p", "The notice of appeal, the record, the briefs, oral argument, the opinion — each has its own deadline, and the first ones come quickly after judgment."],
      ["p", "If your judgment is recent, the clock is already running. The sooner appellate counsel is involved, the more options remain."],
    ],
  },
  {
    slug: "an-appeal-is-not-a-second-trial",
    title: "An Appeal Is Not a Second Trial",
    excerpt:
      "You do not get to re-argue the facts to a new jury. You argue the law and the record to judges.",
    category: "appellate-law",
    related: ["appellate-law", "civil-commercial-litigation"],
    body: [
      ["p", "People often expect an appeal to be a do-over. It is not. There are no witnesses and no new evidence — only the record made below and the law applied to it."],
      ["p", "That makes appellate work a distinct craft, and it makes the trial record the foundation of everything that follows."],
    ],
  },
  // ---- Personal injury (5) ----
  {
    slug: "serious-injury-claims-what-changes",
    title: "Serious-Injury Claims: What Changes",
    excerpt:
      "A catastrophic injury is not a bigger fender-bender claim. The proof, the stakes, and the insurer's behavior all change.",
    category: "personal-injury",
    related: ["personal-injury"],
    body: [
      ["p", "When injuries are severe, the case is no longer about a repair estimate. It is about a life that changed, and insurers fight those cases hard."],
      ["p", "That calls for a firm willing to document the full loss and try the case. The first offer reflects how ready they think you are."],
    ],
  },
  {
    slug: "understanding-um-uim-coverage",
    title: "Understanding UM/UIM Coverage",
    excerpt:
      "The most important coverage on your policy may be the one protecting you from other drivers' failures.",
    category: "personal-injury",
    related: ["personal-injury"],
    body: [
      ["p", "Uninsured and underinsured motorist coverage pays when the at-fault driver has no insurance or not enough. Many Texans carry it without knowing what it does."],
      ["p", "When the other driver's policy runs out, your own UM/UIM coverage can be the difference. We have recovered six figures on exactly that coverage."],
    ],
  },
  {
    slug: "trucking-cases-are-different",
    title: "Why Trucking Cases Are Different",
    excerpt:
      "An 18-wheeler case involves federal rules, corporate defendants, and evidence that disappears fast.",
    category: "personal-injury",
    related: ["personal-injury", "civil-commercial-litigation"],
    body: [
      ["p", "Commercial trucking is governed by federal safety regulations, and the defendant is usually a company with a legal team on speed dial."],
      ["p", "Key evidence — logs, telematics, the truck itself — can vanish without prompt legal action. Moving quickly to preserve it is often decisive."],
    ],
  },
  {
    slug: "dealing-with-insurance-adjusters",
    title: "Dealing With Insurance Adjusters",
    excerpt:
      "The adjuster is friendly, and the adjuster is not on your side. Both things are true.",
    category: "personal-injury",
    related: ["personal-injury"],
    body: [
      ["p", "An adjuster's job is to resolve claims for as little as possible. A recorded statement or a quick lowball offer can quietly undercut your case."],
      ["p", "Before you talk to the other side's insurer, understand what you are giving up. Often, the answer is to let a lawyer do the talking."],
    ],
  },
  {
    slug: "wrongful-death-who-can-recover",
    title: "Wrongful Death in Texas: Who Can Recover",
    excerpt:
      "Texas law limits who may bring a wrongful-death claim and what they can recover. Here is the framework.",
    category: "wrongful-death",
    related: ["wrongful-death", "personal-injury"],
    body: [
      ["p", "Texas allows a spouse, children, and parents to bring a wrongful-death claim for the loss of a family member. There is also a separate survival claim belonging to the estate."],
      ["p", "These are among the hardest cases there are, factually and emotionally. They demand careful, trial-ready handling."],
    ],
  },
  // ---- Fraud / partnership / business disputes (4) ----
  {
    slug: "proving-fraud-in-texas",
    title: "Proving Fraud in Texas",
    excerpt:
      "Fraud is more than a broken promise. Here are the elements you actually have to prove.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "plaintiffs-litigation"],
    body: [
      ["p", "Fraud requires a knowing misrepresentation of a material fact, intended to be relied on, that causes harm. A mere unkept promise is usually not enough."],
      ["p", "Because the bar is high, fraud cases live or die on evidence of intent — which is exactly what disciplined discovery is built to find."],
    ],
  },
  {
    slug: "partnership-disputes-and-fiduciary-duty",
    title: "Partnership Disputes and the Fiduciary Duty",
    excerpt:
      "Partners owe each other more than ordinary fair dealing. When that duty is broken, the law responds.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "business-related-matters"],
    body: [
      ["p", "Partners and certain co-owners owe one another fiduciary duties — loyalty, candor, and fair dealing. Self-dealing breaches those duties."],
      ["p", "Where a partner has lined his own pockets at the venture's expense, the remedies can be significant, including disgorgement."],
    ],
  },
  {
    slug: "fraudulent-transfers-chasing-hidden-assets",
    title: "Fraudulent Transfers: Chasing Hidden Assets",
    excerpt:
      "A debtor who hides assets has not made them disappear. Texas law lets a creditor undo the transfer.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "commercial-debt-collection-defense"],
    body: [
      ["p", "When someone facing a judgment moves property to an insider for little or nothing, that can be a fraudulent transfer — and courts can unwind it."],
      ["p", "Collecting a judgment sometimes means litigating the transfer that was designed to defeat it. We pursue both."],
    ],
  },
  {
    slug: "non-competes-in-texas",
    title: "Are Non-Competes Enforceable in Texas?",
    excerpt:
      "Texas enforces reasonable non-competes — but 'reasonable' does a lot of work in that sentence.",
    category: "business-related-matters",
    related: ["business-related-matters", "civil-commercial-litigation"],
    body: [
      ["p", "Texas will enforce a non-compete that is reasonable in time, area, and scope and tied to a legitimate interest. Overbroad agreements get narrowed or struck."],
      ["p", "Whether you are enforcing one or fighting one, the analysis is fact-specific and worth getting right before the dispute escalates."],
    ],
  },
  // ---- Business formation & succession (4) ----
  {
    slug: "choosing-a-business-entity",
    title: "Choosing the Right Business Entity",
    excerpt:
      "LLC, corporation, partnership — the choice shapes your taxes, your liability, and your next fight.",
    category: "business-formations-transactions",
    related: ["business-formations-transactions", "business-related-matters"],
    body: [
      ["p", "The entity you choose affects liability protection, taxes, and how ownership works. There is no single right answer — only the right answer for your situation."],
      ["p", "We choose deliberately, with an eye on the disputes that entity structures tend to produce down the road."],
    ],
  },
  {
    slug: "why-your-operating-agreement-matters",
    title: "Why Your Operating Agreement Matters",
    excerpt:
      "The operating agreement is the rulebook for your company — and the script for any future fight among owners.",
    category: "business-formations-transactions",
    related: ["business-formations-transactions", "civil-commercial-litigation"],
    body: [
      ["p", "An operating agreement governs who decides what, how profits split, and what happens when an owner wants out. Skipping it means defaulting to statutes that may not fit."],
      ["p", "We draft these documents as a litigator reads them — looking for the ambiguity a future opponent would exploit, and closing it."],
    ],
  },
  {
    slug: "business-succession-planning-for-owners",
    title: "Succession Planning for Business Owners",
    excerpt:
      "What happens to your company when you step away — or cannot? Plan it before the question is forced.",
    category: "business-formations-transactions",
    related: ["business-formations-transactions", "estate-succession-planning"],
    body: [
      ["p", "A business is often an owner's largest asset and least liquid one. Without a succession plan, a death or departure can paralyze it."],
      ["p", "Buy-sell agreements, funding mechanisms, and clear transfer rules keep the business running and the family out of court."],
    ],
  },
  {
    slug: "buy-sell-agreements-explained",
    title: "Buy-Sell Agreements, Explained",
    excerpt:
      "A buy-sell provision decides what happens to an owner's share when life happens. Write it before you need it.",
    category: "business-formations-transactions",
    related: ["business-formations-transactions"],
    body: [
      ["p", "A buy-sell agreement sets the terms for transferring an owner's interest on death, disability, divorce, or departure — including how it is valued and paid for."],
      ["p", "Written well, it is the provision you never have to argue about. Written poorly or not at all, it is the source of the next lawsuit."],
    ],
  },
  // ---- Estate planning (3) ----
  {
    slug: "wills-vs-trusts",
    title: "Wills vs. Trusts: Which Do You Need?",
    excerpt:
      "Both move your property to the people you choose. They do it very differently.",
    category: "estate-succession-planning",
    related: ["estate-succession-planning", "probate"],
    body: [
      ["p", "A will directs who gets what and takes effect through probate. A trust can avoid probate and control how and when assets pass over time."],
      ["p", "Many families need both. The right mix depends on your assets, your family, and how much control you want after you are gone."],
    ],
  },
  {
    slug: "planning-for-land-and-farm-owners",
    title: "Estate Planning for Land and Farm Owners",
    excerpt:
      "Land does not divide neatly among heirs. Planning keeps the family operation from being split apart in probate.",
    category: "estate-succession-planning",
    related: ["estate-succession-planning", "probate"],
    body: [
      ["p", "Family land and a working operation are hard to divide. Left to default rules, they can be fractured among heirs or forced into a sale nobody wanted."],
      ["p", "We plan for these assets deliberately — keeping the operation intact and the family out of a courtroom. We help run a family operation ourselves; we understand the stakes."],
    ],
  },
  {
    slug: "powers-of-attorney-and-directives",
    title: "Powers of Attorney and Medical Directives",
    excerpt:
      "Estate planning is not only about death. It is about who speaks for you if you cannot.",
    category: "estate-succession-planning",
    related: ["estate-succession-planning"],
    body: [
      ["p", "A durable power of attorney and a medical directive decide who manages your affairs and your care if you are incapacitated. Without them, your family may need a court."],
      ["p", "These documents are simple to sign and invaluable when needed. They belong in every plan."],
    ],
  },
  // ---- Probate (3) ----
  {
    slug: "what-to-expect-in-probate",
    title: "What to Expect in Probate",
    excerpt:
      "Probate sounds ominous. For most families with a valid will, it is an orderly process.",
    category: "probate",
    related: ["probate", "estate-succession-planning"],
    body: [
      ["p", "Probate is the court process of proving a will, paying debts, and distributing an estate. With a valid will and an agreeable family, it is usually straightforward."],
      ["p", "An executor inventories the estate, settles its debts, and distributes what remains. Good planning makes the whole thing faster and cheaper."],
    ],
  },
  {
    slug: "dying-without-a-will-in-texas",
    title: "Dying Without a Will in Texas",
    excerpt:
      "If you die intestate, the State's rules — not your wishes — decide who inherits.",
    category: "probate",
    related: ["probate", "estate-succession-planning"],
    body: [
      ["p", "When someone dies without a will, Texas intestacy statutes determine who inherits and in what shares. The result often surprises the surviving family."],
      ["p", "An heirship proceeding may be needed to establish who the legal heirs are. A will avoids all of it."],
    ],
  },
  {
    slug: "inheritance-disputes-among-heirs",
    title: "When Heirs Fight: Inheritance Disputes",
    excerpt:
      "Grief and money are a volatile mix. When heirs cannot agree, probate becomes litigation.",
    category: "probate",
    related: ["probate", "civil-commercial-litigation"],
    body: [
      ["p", "Will contests, claims of undue influence, and fights over a fiduciary's conduct turn probate into litigation among grieving family members."],
      ["p", "When that happens, you want a lawyer who tries cases. A contested estate is litigation, and we prepare it for trial like any other."],
    ],
  },
  // ---- Debt defense & creditor (4) ----
  {
    slug: "what-to-do-when-youre-served",
    title: "What to Do When You're Served With a Lawsuit",
    excerpt:
      "The worst response to a lawsuit is no response. Here is what to do first.",
    category: "consumer-debt-defense",
    related: ["consumer-debt-defense", "civil-commercial-litigation"],
    body: [
      ["p", "Being served starts a clock. Miss the deadline to answer and you can lose by default, without anyone ever testing the claim."],
      ["p", "The first move is simple: do not ignore it. File an answer on time, then make the other side prove its case."],
    ],
  },
  {
    slug: "sued-by-a-debt-buyer",
    title: "Sued by a Debt Buyer? Make Them Prove It",
    excerpt:
      "Debt buyers file in volume and count on silence. Showing up changes the math.",
    category: "consumer-debt-defense",
    related: ["consumer-debt-defense"],
    body: [
      ["p", "Companies that buy old debt for pennies sue in bulk, betting most people will not answer. A default judgment is their easiest money."],
      ["p", "Often they cannot produce the documents the law requires, or the debt is time-barred, or it is not even yours. Answer, demand proof, and be ready to try it."],
    ],
  },
  {
    slug: "your-rights-when-an-account-is-garnished",
    title: "Your Rights When an Account Is Garnished",
    excerpt:
      "A frozen account is not the end of the story. Texas law gives you ways to fight back.",
    category: "garnishments",
    related: ["garnishments", "consumer-debt-defense"],
    body: [
      ["p", "A writ of garnishment can freeze your bank account based on a judgment you may not have known about. But certain funds are exempt, and improper writs can be dissolved."],
      ["p", "Speed matters. The sooner you act, the better your odds of getting the money back. We have done exactly that."],
    ],
  },
  {
    slug: "the-texas-foreclosure-timeline",
    title: "The Texas Foreclosure Timeline",
    excerpt:
      "Texas foreclosures move fast and largely outside the courtroom. Knowing the steps tells you how much time you have.",
    category: "foreclosures",
    related: ["foreclosures"],
    body: [
      ["p", "Most Texas foreclosures are non-judicial: notice of default, notice of sale, then a sale on the first Tuesday of the month. It can happen in a matter of weeks."],
      ["p", "By the time many people call a lawyer, the sale is close. The earlier you act, the more options remain — including litigation that can reach an appeal."],
    ],
  },
  // ---- DTPA (2) ----
  {
    slug: "dtpa-basics-for-consumers",
    title: "DTPA Basics: When a Business Deceives You",
    excerpt:
      "The Texas Deceptive Trade Practices Act gives consumers real leverage against businesses that lie.",
    category: "dtpa",
    related: ["dtpa"],
    body: [
      ["p", "The DTPA protects consumers from false, misleading, and deceptive practices. Used correctly, it can allow recovery beyond your actual loss and shift attorney's fees."],
      ["p", "The statute has strict notice and proof requirements. Handled precisely, it shifts the leverage to the consumer."],
    ],
  },
  {
    slug: "dtpa-notice-letter",
    title: "The DTPA Notice Letter: A Required First Step",
    excerpt:
      "Before most DTPA suits, the law requires written notice. Done right, it can produce a settlement before filing.",
    category: "dtpa",
    related: ["dtpa", "civil-commercial-litigation"],
    body: [
      ["p", "The DTPA generally requires a pre-suit notice letter giving the business a chance to make things right. Skipping it can cost you remedies."],
      ["p", "A credible notice letter — from a firm prepared to try the case — often resolves the matter before a lawsuit is ever filed."],
    ],
  },
  // ---- Criminal defense (2) ----
  {
    slug: "your-rights-during-a-police-encounter",
    title: "Your Rights During a Police Encounter",
    excerpt:
      "What you say and sign in the first hour can matter more than anything that happens at trial.",
    category: "criminal-defense",
    related: ["criminal-defense"],
    body: [
      ["p", "You have the right to remain silent and the right to a lawyer. Exercising them politely is not an admission of guilt — it is basic self-protection."],
      ["p", "The early decisions — what you say, what you consent to — often shape the entire case. When in doubt, ask for a lawyer and stop talking."],
    ],
  },
  {
    slug: "how-a-criminal-case-proceeds",
    title: "How a Criminal Case Proceeds in Texas",
    excerpt:
      "From arrest to trial, here is the path a criminal case follows — and where defense work matters most.",
    category: "criminal-defense",
    related: ["criminal-defense"],
    body: [
      ["p", "A criminal case moves from arrest and bond through charging, pretrial hearings, and, if it does not resolve, trial. The State carries the burden at every step."],
      ["p", "A case prepared for a jury is evaluated very differently by a prosecutor than one expected to fold. Preparation is leverage."],
    ],
  },
];

/**
 * Date assignment:
 *  - First 10 educational posts: Published, backdated across Jan–Mar 2026.
 *  - Remaining: Scheduled with irregular gaps (3–20 days) from mid-June 2026.
 */
const PUBLISHED_DATES = [
  "2026-01-08", "2026-01-15", "2026-01-27", "2026-02-03", "2026-02-12",
  "2026-02-19", "2026-02-26", "2026-03-05", "2026-03-17", "2026-03-26",
];

function buildScheduledDate(index: number): string {
  // Irregular gaps starting mid-June 2026.
  const gaps = [4, 11, 6, 18, 8, 3, 14, 20, 9, 5, 16, 7, 12, 19, 6, 13, 8, 17, 4, 15, 10, 6, 18, 9, 14, 7, 20, 11, 5, 16];
  let day = new Date("2026-06-16T15:00:00Z").getTime();
  for (let i = 0; i <= index; i++) {
    day += (gaps[i % gaps.length] ?? 10) * 24 * 60 * 60 * 1000;
  }
  return new Date(day).toISOString();
}

const educational: BlogPostSeed[] = eduRaw.map((e, i) => {
  const isPublished = i < PUBLISHED_DATES.length;
  return {
    slug: e.slug,
    title: e.title,
    excerpt: e.excerpt,
    body: html(e.body),
    category: e.category,
    author: AUTHOR,
    isFirmNews: false,
    status: isPublished ? "published" : "scheduled",
    publishAt: isPublished
      ? new Date(`${PUBLISHED_DATES[i]}T14:00:00Z`).toISOString()
      : buildScheduledDate(i - PUBLISHED_DATES.length),
    relatedPractices: e.related,
    relatedPosts: e.relatedPosts,
    seoTitle: `${e.title} | T. Maxwell Smith, PLLC`,
    seoDescription: e.excerpt,
    tags: [e.category],
  };
});

/* ===================== EDUCATIONAL — EARLY 2027 ========================== */
/* 20 additional posts, scheduled across Jan–Mar 2027 (irregular gaps). */

const eduRaw2027: EduInput[] = [
  // Litigation strategy
  {
    slug: "tros-and-temporary-injunctions",
    title: "TROs and Temporary Injunctions: Stopping Harm Fast",
    excerpt:
      "Sometimes you cannot wait for a trial. Texas lets a court freeze the situation while the case plays out.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "plaintiffs-litigation"],
    body: [
      ["p", "When conduct threatens immediate, irreparable harm, a temporary restraining order can stop it within days, followed by a temporary injunction that holds through trial."],
      ["p", "These remedies demand proof on a short fuse — a likely-to-prevail claim, real harm, and no adequate remedy in money alone. We build that record fast."],
      ["p", `Injunctive relief is litigation at speed. We treat it like the opening of a case we are ${paLink("civil-commercial-litigation", "prepared to try")}.`],
    ],
  },
  {
    slug: "what-a-petition-must-say",
    title: "What a Petition Must Actually Say",
    excerpt:
      "A lawsuit starts with a petition. What goes in it — and what is left out — shapes the entire case.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation"],
    relatedPosts: ["anatomy-of-a-texas-lawsuit"],
    body: [
      ["p", "Texas uses fair-notice pleading: the petition must give the other side fair notice of the claims and the relief sought. Vague pleadings invite special exceptions; overbroad ones give away strategy."],
      ["p", "We draft pleadings to preserve every theory we may need and to set up the proof we intend to put on — no more, no less."],
    ],
  },
  {
    slug: "sanctions-and-bad-faith-litigation",
    title: "Sanctions: When the Other Side Plays Dirty",
    excerpt:
      "Courts have tools to punish frivolous filings and discovery abuse. Knowing them changes the leverage.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation"],
    body: [
      ["p", "Groundless pleadings, discovery stonewalling, and bad-faith tactics can draw sanctions — from fee awards to striking claims entirely."],
      ["p", "We document abuse as it happens and pursue sanctions when warranted. A party that weaponizes delay should pay for it."],
    ],
  },
  {
    slug: "expert-witnesses-and-daubert",
    title: "Expert Witnesses and the Battle of Opinions",
    excerpt:
      "Many cases turn on experts. So does the fight over whether the jury ever hears them.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "personal-injury"],
    body: [
      ["p", "Expert testimony must be reliable and relevant, and Texas courts act as gatekeepers. A successful challenge can exclude the opinion that holds up the other side's case."],
      ["p", "We prepare our experts to withstand challenge and scrutinize theirs to keep junk science away from the jury."],
    ],
  },
  // Appeals
  {
    slug: "motions-for-new-trial",
    title: "Motions for New Trial: The Bridge to Appeal",
    excerpt:
      "After a verdict, the motion for new trial can fix errors — and it preserves issues you will need on appeal.",
    category: "appellate-law",
    related: ["appellate-law", "civil-commercial-litigation"],
    relatedPosts: ["preserving-error-at-trial"],
    body: [
      ["p", "A motion for new trial asks the trial court to correct its own errors before an appeal, and it is the only way to preserve certain complaints — like factual sufficiency or jury misconduct."],
      ["p", "The deadline is short and the stakes are high. We treat the post-verdict window as the first move of the appeal."],
    ],
  },
  {
    slug: "interlocutory-appeals-in-texas",
    title: "Interlocutory Appeals: Appealing Before the End",
    excerpt:
      "Some rulings can be appealed mid-case. Knowing which ones can change the course of the litigation.",
    category: "appellate-law",
    related: ["appellate-law"],
    body: [
      ["p", "Most orders are not appealable until final judgment, but Texas allows interlocutory appeals of specific rulings — temporary injunctions, certain dismissals, and more."],
      ["p", "Recognizing an appealable order, and the tight deadline that comes with it, can be decisive. We watch for them throughout a case."],
    ],
  },
  // Personal injury
  {
    slug: "comparative-fault-in-texas",
    title: "Comparative Fault: How Blame Is Divided",
    excerpt:
      "In Texas, being partly at fault does not always end your claim — but cross fifty-one percent and it does.",
    category: "personal-injury",
    related: ["personal-injury"],
    body: [
      ["p", "Texas uses modified comparative fault. Your recovery is reduced by your share of responsibility, and barred entirely if you are more than fifty percent at fault."],
      ["p", "That makes the fight over percentages central. We build the liability case to keep fault where it belongs — on the other side."],
    ],
  },
  {
    slug: "eggshell-plaintiff-and-pre-existing-conditions",
    title: "Pre-Existing Conditions and the Eggshell Plaintiff",
    excerpt:
      "Insurers love to blame your old injuries. The law says they take you as they find you.",
    category: "personal-injury",
    related: ["personal-injury"],
    body: [
      ["p", "Defendants often argue your harm came from a pre-existing condition. But under the eggshell-plaintiff rule, a wrongdoer is liable for the full extent of the harm caused, even to a vulnerable person."],
      ["p", "The key is distinguishing what the crash caused from what came before. We use the medical record to draw that line clearly."],
    ],
  },
  {
    slug: "medical-liens-and-your-settlement",
    title: "Medical Liens and What's Left of Your Settlement",
    excerpt:
      "A settlement number is not what you take home. Liens and subrogation claims come first — unless they are reduced.",
    category: "personal-injury",
    related: ["personal-injury"],
    body: [
      ["p", "Hospitals, health insurers, and government payers may assert liens or subrogation rights against your recovery. Ignoring them can be costly."],
      ["p", "We identify, challenge, and negotiate these claims down so more of the settlement ends up where it belongs — with the client."],
    ],
  },
  // Business
  {
    slug: "piercing-the-corporate-veil",
    title: "Piercing the Corporate Veil in Texas",
    excerpt:
      "An entity usually shields its owners. Sometimes the law looks behind it to reach the people in charge.",
    category: "business-related-matters",
    related: ["business-related-matters", "civil-commercial-litigation"],
    body: [
      ["p", "Texas sets a high bar to pierce the corporate veil, generally requiring actual fraud for direct personal benefit. But the bar is not unreachable."],
      ["p", "Whether you are protecting owners or pursuing them, the analysis turns on how the entity was actually run. We litigate both sides."],
    ],
  },
  {
    slug: "series-llcs-in-texas",
    title: "Series LLCs: One Entity, Many Compartments",
    excerpt:
      "Texas allows a single LLC to hold separated 'series.' Used right, it isolates risk; used wrong, it invites trouble.",
    category: "business-formations-transactions",
    related: ["business-formations-transactions", "business-related-matters"],
    body: [
      ["p", "A series LLC can wall off the assets and liabilities of each series from the others — attractive for owners holding multiple properties or ventures."],
      ["p", "The protection depends on strict separateness in records and operations. We set them up to actually hold up if tested."],
    ],
  },
  {
    slug: "trade-secrets-and-tutsa",
    title: "Trade Secrets and the Texas Uniform Trade Secrets Act",
    excerpt:
      "Your formulas, lists, and processes can be protected — if you treat them like secrets.",
    category: "civil-commercial-litigation",
    related: ["civil-commercial-litigation", "business-related-matters"],
    body: [
      ["p", "TUTSA protects information that derives value from being secret and is subject to reasonable efforts to keep it so. Misappropriation can support injunctions and damages."],
      ["p", "Protection starts before any dispute — with the safeguards you put in place. When a secret walks out the door, we move fast to get it back."],
    ],
  },
  // Estate / probate
  {
    slug: "independent-vs-dependent-administration",
    title: "Independent vs. Dependent Administration",
    excerpt:
      "Texas offers a streamlined way to settle an estate — and a slower, court-supervised one. The difference is real money.",
    category: "probate",
    related: ["probate", "estate-succession-planning"],
    relatedPosts: ["what-to-expect-in-probate"],
    body: [
      ["p", "Independent administration lets an executor settle the estate with minimal court involvement — faster and cheaper. Dependent administration requires court approval at most steps."],
      ["p", "A well-drafted will requests independent administration. Without one, the estate may be stuck in the costlier process."],
    ],
  },
  {
    slug: "lady-bird-deeds-in-texas",
    title: "Lady Bird Deeds: Passing Property Without Probate",
    excerpt:
      "A Texas enhanced life-estate deed can move real property at death while keeping full control during life.",
    category: "estate-succession-planning",
    related: ["estate-succession-planning", "probate"],
    body: [
      ["p", "A Lady Bird deed lets you keep the right to sell, mortgage, or change your mind during life, while the property passes automatically at death — outside probate."],
      ["p", "For the right family and the right property, it is a simple, powerful tool. We make sure it fits the larger plan before using it."],
    ],
  },
  {
    slug: "muniment-of-title",
    title: "Muniment of Title: Probate's Shortcut",
    excerpt:
      "When the only issue is transferring title under a valid will, Texas offers a faster path.",
    category: "probate",
    related: ["probate"],
    body: [
      ["p", "If a person dies with a valid will and no unpaid debts other than those secured by real estate, the will can be probated as a muniment of title — without a full administration."],
      ["p", "It is one of the most efficient probate procedures available. We use it whenever the estate qualifies."],
    ],
  },
  // Debt / creditor
  {
    slug: "the-fair-debt-collection-practices-act",
    title: "The FDCPA: Limits on Debt Collectors",
    excerpt:
      "Federal law restricts how collectors can treat you — and gives you a claim when they cross the line.",
    category: "consumer-debt-defense",
    related: ["consumer-debt-defense"],
    relatedPosts: ["sued-by-a-debt-buyer"],
    body: [
      ["p", "The Fair Debt Collection Practices Act bars harassment, false statements, and unfair practices by debt collectors. Violations can entitle you to statutory damages and fees."],
      ["p", "A collector who breaks the rules hands you leverage. We use FDCPA violations both as a shield and, where appropriate, a sword."],
    ],
  },
  {
    slug: "statute-of-limitations-on-texas-debt",
    title: "How Long Can They Sue You on a Debt?",
    excerpt:
      "Texas debt claims have a deadline. After it passes, an old debt may be unenforceable in court.",
    category: "consumer-debt-defense",
    related: ["consumer-debt-defense"],
    body: [
      ["p", "Most Texas debt claims must be brought within four years of default. Suit filed after that is time-barred — a complete defense if raised."],
      ["p", "Be careful: certain actions can restart the clock. Before you pay or promise anything on an old debt, know where the deadline stands."],
    ],
  },
  {
    slug: "post-judgment-collection-tools",
    title: "After the Judgment: How Creditors Collect",
    excerpt:
      "Winning a judgment is step one. Turning it into money takes a different set of tools.",
    category: "commercial-debt-collection-defense",
    related: ["commercial-debt-collection-defense", "garnishments"],
    body: [
      ["p", "A judgment unlocks abstracts of judgment, writs of garnishment, turnover orders, and more. Each reaches different assets in different ways."],
      ["p", "Whether collecting or defending, we know the post-judgment toolkit and how to deploy — or blunt — it."],
    ],
  },
  // DTPA / criminal
  {
    slug: "dtpa-laundry-list-violations",
    title: "The DTPA 'Laundry List': What Counts as Deceptive",
    excerpt:
      "The DTPA spells out specific deceptive acts. Knowing the list tells you whether you have a claim.",
    category: "dtpa",
    related: ["dtpa", "civil-commercial-litigation"],
    relatedPosts: ["dtpa-basics-for-consumers"],
    body: [
      ["p", "The DTPA's so-called laundry list enumerates deceptive practices — passing off goods, misrepresenting quality or sponsorship, and many more. A claim usually starts by matching the conduct to a listed item."],
      ["p", "We map the facts to the statute precisely, because the right citation is what makes the demand credible."],
    ],
  },
  {
    slug: "expunctions-and-nondisclosure",
    title: "Clearing Your Record: Expunctions and Nondisclosure",
    excerpt:
      "A dismissed or old charge can still haunt you. Texas offers ways to seal or erase it.",
    category: "criminal-defense",
    related: ["criminal-defense"],
    relatedPosts: ["how-a-criminal-case-proceeds"],
    body: [
      ["p", "An expunction can erase certain arrests and charges as if they never happened; an order of nondisclosure can seal records from public view. Eligibility depends on the outcome and the offense."],
      ["p", "If you qualify, clearing your record is worth doing. We assess eligibility and handle the petition."],
    ],
  },
];

const EARLY_2027_DATES = [
  "2027-01-05", "2027-01-08", "2027-01-13", "2027-01-19", "2027-01-22",
  "2027-01-28", "2027-02-02", "2027-02-08", "2027-02-11", "2027-02-17",
  "2027-02-23", "2027-02-26", "2027-03-04", "2027-03-09", "2027-03-12",
  "2027-03-18", "2027-03-23", "2027-03-26", "2027-03-30", "2027-04-02",
];

const educational2027: BlogPostSeed[] = eduRaw2027.map((e, i) => ({
  slug: e.slug,
  title: e.title,
  excerpt: e.excerpt,
  body: html(e.body),
  category: e.category,
  author: AUTHOR,
  isFirmNews: false,
  status: "scheduled",
  publishAt: new Date(`${EARLY_2027_DATES[i] ?? "2027-04-05"}T14:00:00Z`).toISOString(),
  relatedPractices: e.related,
  relatedPosts: e.relatedPosts,
  seoTitle: `${e.title} | T. Maxwell Smith, PLLC`,
  seoDescription: e.excerpt,
  tags: [e.category],
}));

export const BLOG_POSTS: BlogPostSeed[] = [...firmNews, ...educational, ...educational2027];

export const EDUCATIONAL_COUNT = educational.length + educational2027.length;
export const FIRM_NEWS_COUNT = firmNews.length;
export const SCHEDULED_2027_COUNT = educational2027.length;
