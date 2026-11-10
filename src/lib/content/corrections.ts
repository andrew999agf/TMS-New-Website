/**
 * Legal-accuracy corrections to published posts, each checked against the
 * current statute text on the Texas Legislature's site (November 2026).
 *
 * Every entry swaps ONE sentence (or pair) for a corrected one. Applied two
 * ways so the public site is right wherever the text lives:
 *   - the seed posts in defaults/posts.ts already carry the corrected text;
 *   - ensureBlogCorrections() rewrites the same sentence inside the database
 *     row, once, and only where the old sentence is still there — a post the
 *     firm has edited in the admin is left exactly as edited.
 *
 * No case law is cited anywhere; statutes only.
 */
export type PostCorrection = {
  slug: string;
  field: "body" | "excerpt";
  find: string;
  replace: string;
  /** Why, and the statute it was checked against. */
  basis: string;
};

export const POST_CORRECTIONS: PostCorrection[] = [
  {
    slug: "summary-judgment-explained", field: "body",
    find: "The moving party must show there is nothing for a jury to decide.",
    replace: "In a traditional motion, the moving party must show there is nothing for a jury to decide.",
    basis: "A no-evidence motion needs no evidence from the movant; the sentence was true only of a traditional motion (Tex. R. Civ. P. 166a(c), (i)).",
  },
  {
    slug: "no-evidence-motions-in-texas", field: "body",
    find: "Texas gives defendants a powerful tool: the no-evidence motion for summary judgment.",
    replace: "Texas gives the party that does not carry the burden of proof — usually the defendant — a powerful tool: the no-evidence motion for summary judgment.",
    basis: "The motion belongs to any party without the burden of proof, not only defendants (Tex. R. Civ. P. 166a(i)).",
  },
  {
    slug: "no-evidence-motions-in-texas", field: "body",
    find: "If it cannot, the court dismisses the claim.",
    replace: "If it cannot, the court must grant the motion and the claim is over.",
    basis: "Summary judgment is rendered, not a dismissal; the rule says the court must grant the motion (Tex. R. Civ. P. 166a(i)).",
  },
  {
    slug: "breach-of-contract-what-you-can-recover", field: "body",
    find: "Some contracts shift attorney's fees; many do not.",
    replace: "Attorney's fees are a separate question. In Texas, a party who wins a claim on an oral or written contract can generally recover reasonable attorney's fees by statute, even when the contract says nothing about fees (Civil Practice and Remedies Code § 38.001). The contract itself can also shift fees, including to a defendant who wins.",
    basis: "CPRC § 38.001(b)(8): fees recoverable on a claim for an oral or written contract. The old sentence implied fees depend on the contract.",
  },
  {
    slug: "what-a-supersedeas-bond-does", field: "body",
    find: "When you appeal a money judgment, the winner can normally try to collect immediately.",
    replace: "Filing an appeal does not, by itself, stop the winner from collecting on a money judgment.",
    basis: "Collection is not immediate on judgment; the accurate point is that an appeal alone does not suspend enforcement.",
  },
  {
    slug: "what-a-supersedeas-bond-does", field: "body",
    find: "If you win the appeal, the bond comes back.",
    replace: "The amount is set by statute: the compensatory damages awarded, interest for the estimated length of the appeal, and costs — capped at the lesser of half the judgment debtor's net worth or $25 million (Civil Practice and Remedies Code § 52.006). If you win the appeal, the bond is released.",
    basis: "CPRC § 52.006(a)–(b). A bond is released, not returned.",
  },
  {
    slug: "proving-fraud-in-texas", field: "body",
    find: "Fraud requires a knowing misrepresentation of a material fact, intended to be relied on, that causes harm. A mere unkept promise is usually not enough.",
    replace: "Fraud requires a false statement of material fact, made knowing it was false or recklessly without knowing whether it was true, intended to be relied on, that the other side actually and justifiably relied on to its harm. A mere unkept promise is usually not enough — unless the person never intended to keep it when it was made.",
    basis: "The old sentence left out recklessness and the plaintiff's own justifiable reliance, both required elements.",
  },
  {
    slug: "partnership-disputes-and-fiduciary-duty", field: "body",
    find: "Partners and certain co-owners owe one another fiduciary duties — loyalty, candor, and fair dealing. Self-dealing breaches those duties.",
    replace: "By statute, a partner owes the partnership and the other partners a duty of loyalty and a duty of care, and must carry them out in good faith (Business Organizations Code §§ 152.204–152.206). Self-dealing and competing with the partnership breach the duty of loyalty.",
    basis: "BOC §§ 152.204–.206 name the duties as loyalty and care, discharged in good faith. 'Certain co-owners' was vague and 'candor, and fair dealing' is not the statutory list.",
  },
  {
    slug: "non-competes-in-texas", field: "body",
    find: "Texas will enforce a non-compete that is reasonable in time, area, and scope and tied to a legitimate interest. Overbroad agreements get narrowed or struck.",
    replace: "Texas will enforce a non-compete that is part of an otherwise enforceable agreement and reasonable in time, geographic area, and scope of activity — no broader than needed to protect goodwill or another business interest (Business & Commerce Code § 15.50). An overbroad covenant is not thrown out: the court must rewrite it to a reasonable scope and enforce it as rewritten, though no damages can be awarded for conduct before the rewrite (§ 15.51(c)).",
    basis: "Bus. & Com. Code § 15.50(a) (ancillary to an otherwise enforceable agreement) and § 15.51(c) (court shall reform; it does not strike).",
  },
  {
    slug: "why-your-operating-agreement-matters", field: "body",
    find: "An operating agreement governs who decides what, how profits split, and what happens when an owner wants out.",
    replace: "Texas law calls an LLC's operating agreement a “company agreement” (Business Organizations Code § 101.052). It governs who decides what, how profits split, and what happens when an owner wants out.",
    basis: "'Operating agreement' is the national term; the Texas statute uses 'company agreement' (BOC § 101.052).",
  },
  {
    slug: "powers-of-attorney-and-directives", field: "body",
    find: "A durable power of attorney and a medical directive decide who manages your affairs and your care if you are incapacitated.",
    replace: "Three documents do the work. A durable power of attorney names who manages your finances and property. A medical power of attorney names who makes health-care decisions when you cannot. A directive to physicians — the “living will” — states your wishes about life-sustaining treatment.",
    basis: "A directive does not appoint anyone; the medical power of attorney does (Health & Safety Code §§ 166.031, 166.152; Estates Code § 751.0021).",
  },
  {
    slug: "the-texas-foreclosure-timeline", field: "body",
    find: "Most Texas foreclosures are non-judicial: notice of default, notice of sale, then a sale on the first Tuesday of the month. It can happen in a matter of weeks.",
    replace: "Most Texas foreclosures are non-judicial. For a home, the servicer must send a notice of default giving at least 20 days to cure, then a notice of sale at least 21 days before the sale, and the sale is held at the courthouse on the first Tuesday of the month (Property Code § 51.002). From the first notice to the auction can be as little as about six weeks.",
    basis: "Property Code § 51.002(a), (b), (d): 20 days to cure on a residence, 21 days' notice of sale, first Tuesday.",
  },
  {
    slug: "how-a-criminal-case-proceeds", field: "body",
    find: "The State carries the burden at every step.",
    replace: "At trial the State carries the burden of proving every element beyond a reasonable doubt (Penal Code § 2.01).",
    basis: "The State's burden of proof is at trial; it does not carry the burden at every pretrial step (Penal Code § 2.01).",
  },
  {
    slug: "tros-and-temporary-injunctions", field: "body",
    find: "a likely-to-prevail claim, real harm, and no adequate remedy in money alone.",
    replace: "a valid cause of action, a probable right to the relief sought, and a probable, imminent injury that money cannot adequately repair.",
    basis: "'Likely to prevail' is the federal phrasing; Texas courts ask for a probable right to relief and probable, imminent, irreparable injury.",
  },
  {
    slug: "interlocutory-appeals-in-texas", field: "body",
    find: "but Texas allows interlocutory appeals of specific rulings — temporary injunctions, certain dismissals, and more.",
    replace: "but a statute lists specific rulings that can be appealed right away — among them orders granting or refusing a temporary injunction, appointing a receiver, ruling on a special appearance, or denying a motion to dismiss under the Texas Citizens Participation Act (Civil Practice and Remedies Code § 51.014).",
    basis: "CPRC § 51.014(a)(1), (4), (7), (12). 'Certain dismissals' was wrong: a dismissal is usually final, and the statute reaches denials of motions to dismiss.",
  },
  {
    slug: "comparative-fault-in-texas", field: "excerpt",
    find: "but cross fifty-one percent and it does.",
    replace: "but be found more than fifty percent responsible and it does.",
    basis: "CPRC § 33.001: barred if the percentage of responsibility is greater than 50 percent. At 51 percent the claim is already barred.",
  },
  {
    slug: "comparative-fault-in-texas", field: "body",
    find: "Texas uses modified comparative fault. Your recovery is reduced by your share of responsibility, and barred entirely if you are more than fifty percent at fault.",
    replace: "Texas calls it proportionate responsibility. Your recovery is reduced by your percentage of responsibility, and barred entirely if that percentage is greater than fifty (Civil Practice and Remedies Code §§ 33.001, 33.012).",
    basis: "Chapter 33's own term is 'proportionate responsibility' (CPRC §§ 33.001, 33.012(a)).",
  },
  {
    slug: "piercing-the-corporate-veil", field: "body",
    find: "Texas sets a high bar to pierce the corporate veil, generally requiring actual fraud for direct personal benefit.",
    replace: "Texas sets a high bar to pierce the corporate veil. To hold an owner liable on a company's contract debt, a creditor must show the owner used the company to commit an actual fraud on the creditor, primarily for the owner's direct personal benefit (Business Organizations Code § 21.223; § 101.002 applies the same rule to LLCs).",
    basis: "BOC § 21.223(a)(2), (b) is limited to contractual obligations and matters arising from them; § 101.002 extends it to LLCs.",
  },
  {
    slug: "series-llcs-in-texas", field: "body",
    find: "The protection depends on strict separateness in records and operations.",
    replace: "The protection is conditional: each series must keep records that account for its assets separately, and both the company agreement and the certificate of formation must state the limitation (Business Organizations Code § 101.602).",
    basis: "BOC § 101.602(b)(1)–(3): three conditions, two of which the old sentence omitted.",
  },
  {
    slug: "independent-vs-dependent-administration", field: "body",
    find: "A well-drafted will requests independent administration. Without one, the estate may be stuck in the costlier process.",
    replace: "A well-drafted will provides for independent administration. Without that language — or without a will at all — it is still available if every distributee agrees and the court approves (Estates Code §§ 401.002–401.003). If they cannot agree, the estate may be stuck in the costlier process.",
    basis: "Estates Code §§ 401.002–.003: independent administration by agreement of all distributees, with or without a will.",
  },
  {
    slug: "the-fair-debt-collection-practices-act", field: "body",
    find: "Violations can entitle you to statutory damages and fees.",
    replace: "Violations can entitle you to statutory damages and fees. The federal act generally covers third-party collectors and debt buyers, not the original creditor collecting its own account; the Texas Debt Collection Act (Finance Code chapter 392) reaches creditors too.",
    basis: "Without this a reader sued by the original card issuer would assume the federal act applies. Finance Code § 392.001(6) defines 'debt collector' to include anyone who engages in debt collection.",
  },
  {
    slug: "statute-of-limitations-on-texas-debt", field: "body",
    find: "Most Texas debt claims must be brought within four years of default.",
    replace: "Most Texas debt claims must be brought within four years after the claim accrues, usually the default (Civil Practice and Remedies Code § 16.004).",
    basis: "CPRC § 16.004(a)(3): four years after the day the cause of action accrues.",
  },
  {
    slug: "statute-of-limitations-on-texas-debt", field: "body",
    find: "Be careful: certain actions can restart the clock. Before you pay or promise anything on an old debt, know where the deadline stands.",
    replace: "Be careful what you sign. A written, signed acknowledgment of an old debt can take away the limitations defense (Civil Practice and Remedies Code § 16.065). A debt buyer, though, may not sue on a time-barred consumer debt at all, and a payment or new promise does not revive it (Finance Code § 392.307). Before you pay or sign anything on an old debt, know where the deadline stands.",
    basis: "In Texas only a signed writing defeats limitations (CPRC § 16.065), and Finance Code § 392.307(c)–(d) bars debt-buyer suits on time-barred consumer debt and says payment does not revive it. 'Certain actions can restart the clock' was generic national advice.",
  },
];

/** The same treatment for glossary definitions — these pop up as tooltips
 *  inside the posts, so a wrong definition is a wrong statement in the post. */
export type GlossaryCorrection = { slug: string; find: string; replace: string; basis: string };

export const GLOSSARY_CORRECTIONS: GlossaryCorrection[] = [
  {
    slug: "beyond-reasonable-doubt",
    find: "The high standard of proof required to convict in a criminal case — enough certainty that a reasonable person would not hesitate to rely on it in their most important affairs.",
    replace: "The standard of proof required to convict in a criminal case, and the highest in the law: every element of the offense must be proved beyond a reasonable doubt (Penal Code § 2.01). Texas does not give jurors a definition of the phrase; each juror decides what it means.",
    basis: "The 'would not hesitate in their most important affairs' wording is a jury definition Texas courts stopped giving decades ago. Penal Code § 2.01 and Code of Criminal Procedure art. 38.03 state the standard without defining it.",
  },
  {
    slug: "turnover-order",
    find: "A post-judgment order requiring a debtor to turn over non-exempt property that cannot be reached by ordinary means, sometimes through a receiver.",
    replace: "A post-judgment order requiring a debtor to turn over non-exempt property to satisfy the judgment, sometimes through a court-appointed receiver (Civil Practice and Remedies Code § 31.002).",
    basis: "The 'cannot be reached by ordinary means' requirement is no longer in CPRC § 31.002(a); the current text asks only that the property not be exempt.",
  },
  {
    slug: "punitive-damages",
    find: "Also called exemplary damages — money awarded not to compensate but to punish especially reckless or malicious conduct and deter it. Texas caps them in most cases.",
    replace: "Called exemplary damages in Texas — money awarded not to compensate but to punish and deter. They require clear and convincing proof of fraud, malice, or gross negligence, and the amount is capped in most cases (Civil Practice and Remedies Code §§ 41.003, 41.008).",
    basis: "CPRC § 41.003(a): fraud, malice, or gross negligence by clear and convincing evidence. 'Reckless' is not the statutory standard. Cap: § 41.008(b).",
  },
  {
    slug: "fraud",
    find: "A knowing misrepresentation of a material fact, made to induce reliance, that causes harm to the person who reasonably relies on it.",
    replace: "A false statement of material fact, made knowingly or recklessly to induce reliance, that causes harm to the person who justifiably relies on it.",
    basis: "Recklessness also satisfies the intent element; kept consistent with the corrected post.",
  },
  {
    slug: "fiduciary",
    find: "like a partner, trustee, or executor",
    replace: "like a trustee, executor, or agent under a power of attorney",
    basis: "A partner is expressly not held to a trustee's standard (Business Organizations Code § 152.204(d)), so 'the highest legal duty' should not list partners first. An agent under a durable power of attorney is a fiduciary by statute (Estates Code § 751.101).",
  },
  {
    slug: "will",
    find: "A signed, witnessed document directing how your property is distributed after death and naming an executor and guardians.",
    replace: "A signed document, attested by two witnesses unless it is written entirely in your own handwriting, directing how your property is distributed after death and naming an executor and guardians (Estates Code §§ 251.051–251.052).",
    basis: "Estates Code § 251.051 (two witnesses) and § 251.052 (a holographic will needs none).",
  },
];

/** Text as a rich-text editor may have re-encoded it. */
export function encodedVariants(s: string): string[] {
  const out = new Set<string>([s]);
  const swaps: [RegExp, string][][] = [
    [[/'/g, "&#39;"]], [[/'/g, "&apos;"]], [[/'/g, "’"]],
    [[/—/g, "&mdash;"]], [[/&(?!amp;|#|[a-z]+;)/g, "&amp;"]],
    [[/'/g, "&#39;"], [/—/g, "&mdash;"]], [[/'/g, "’"], [/—/g, "&mdash;"]],
    [[/§/g, "&sect;"]], [[/“/g, "&ldquo;"], [/”/g, "&rdquo;"]],
  ];
  for (const group of swaps) { let v = s; for (const [re, to] of group) v = v.replace(re, to); out.add(v); }
  return [...out];
}
