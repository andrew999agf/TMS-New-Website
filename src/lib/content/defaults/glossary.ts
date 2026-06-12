/**
 * Glossary / index of terms. Original definitions and law-school-flashcard
 * hypotheticals. Terms surface as accent-highlighted tooltips in post bodies
 * and on the auto-generated Glossary index page.
 */

export type GlossaryTermSeed = {
  slug: string;
  term: string;
  definition: string;
  hypothetical: string;
  relatedPractices: string[];
  aliases?: string[];
};

export const GLOSSARY_TERMS: GlossaryTermSeed[] = [
  {
    slug: "summary-judgment",
    term: "Summary Judgment",
    definition:
      "A pretrial ruling that decides a claim without a trial because the key facts are not genuinely disputed and the law dictates the outcome. It lets a court end a case, or part of one, as a matter of law.",
    hypothetical:
      "A contractor sues for a bill, but the signed contract plainly says no payment is due until the city issues a permit, and the permit was never issued. Because no reasonable jury could find the bill due, the court can grant summary judgment without a trial.",
    relatedPractices: ["civil-commercial-litigation", "appellate-law"],
  },
  {
    slug: "no-evidence-motion",
    term: "No-Evidence Motion",
    definition:
      "A Texas motion for summary judgment arguing that, after adequate time for discovery, the other side has no evidence on one or more essential elements of its claim. It forces the claimant to produce proof or lose.",
    hypothetical:
      "A plaintiff alleges fraud but, after a year of discovery, has produced nothing showing the defendant made a false statement. The defendant files a no-evidence motion; the plaintiff cannot point to any proof of falsity, so the claim is dismissed.",
    relatedPractices: ["civil-commercial-litigation"],
  },
  {
    slug: "supersedeas-bond",
    term: "Supersedeas Bond",
    definition:
      "Security a losing party posts to suspend enforcement of a money judgment while it appeals, protecting the winner if the judgment is affirmed. If the appeal fails, the bond can satisfy the judgment; if it succeeds, the bond is released.",
    hypothetical:
      "A business loses a $200,000 judgment and appeals. To stop the winner from seizing its accounts during the appeal, it posts a supersedeas bond. When the appeal is later won, the court releases the bond back to the business.",
    relatedPractices: ["appellate-law", "foreclosures"],
    aliases: ["supersedeas", "appeal bond"],
  },
  {
    slug: "writ-of-garnishment",
    term: "Writ of Garnishment",
    definition:
      "A court order directing a third party holding the debtor's property — usually a bank — to freeze and turn over funds to satisfy a judgment. It reaches assets the creditor cannot grab directly.",
    hypothetical:
      "After winning a judgment, a creditor serves the debtor's bank with a writ of garnishment. The bank freezes the account and, unless the debtor successfully objects, pays the balance toward the judgment.",
    relatedPractices: ["garnishments", "commercial-debt-collection-defense"],
    aliases: ["garnishment"],
  },
  {
    slug: "bill-of-review",
    term: "Bill of Review",
    definition:
      "An equitable lawsuit to set aside a final judgment that can no longer be challenged by ordinary appeal, available when a party was prevented from defending through no fault of its own. It is a narrow, last-resort remedy.",
    hypothetical:
      "A man learns years later that a default judgment was taken against him at an address where he never lived, so he never got notice. He files a bill of review and, proving he was never served, gets the old judgment vacated.",
    relatedPractices: ["garnishments", "civil-commercial-litigation"],
  },
  {
    slug: "voir-dire",
    term: "Voir Dire",
    definition:
      "Jury selection — the questioning of prospective jurors to uncover bias and decide who will sit on the jury. It is the first, and sometimes the most important, part of a trial.",
    hypothetical:
      "In a DWI trial, defense counsel asks the panel who has had a family member hurt by a drunk driver. Several jurors raise their hands, revealing a bias that lets counsel seek their removal before the trial begins.",
    relatedPractices: ["criminal-defense", "civil-commercial-litigation"],
    aliases: ["jury selection"],
  },
  {
    slug: "forcible-detainer",
    term: "Forcible Detainer",
    definition:
      "The Texas eviction action used to recover possession of property from someone who refuses to leave, often after a foreclosure sale. It decides possession only, not who owns the property.",
    hypothetical:
      "After a home is sold at foreclosure, the former owner stays put. The buyer files a forcible detainer suit in justice court to obtain possession, even though any dispute over title must be fought in a separate case.",
    relatedPractices: ["foreclosures"],
    aliases: ["eviction"],
  },
  {
    slug: "tenant-at-sufferance",
    term: "Tenant at Sufferance",
    definition:
      "Someone who remains in possession of property after their legal right to be there has ended — for example, a former owner who stays after a foreclosure. They can be removed through eviction.",
    hypothetical:
      "A deed of trust says that after foreclosure the prior owner becomes a tenant at sufferance. When she refuses to leave, the new owner can evict her on that basis without a separate lease.",
    relatedPractices: ["foreclosures"],
  },
  {
    slug: "um-uim",
    term: "UM/UIM Coverage",
    definition:
      "Uninsured/underinsured motorist coverage on your own auto policy that pays for your injuries when the at-fault driver has no insurance or not enough. It steps in where the other driver's coverage runs out.",
    hypothetical:
      "A driver is badly hurt by someone carrying only the state-minimum policy, which does not cover her hospital bills. She turns to her own UM/UIM coverage to make up the difference.",
    relatedPractices: ["personal-injury-wrongful-death"],
    aliases: ["uninsured motorist", "underinsured motorist"],
  },
  {
    slug: "dtpa",
    term: "DTPA",
    definition:
      "The Texas Deceptive Trade Practices–Consumer Protection Act, which protects consumers from false, misleading, or deceptive business practices and can allow recovery of additional damages and attorney's fees.",
    hypothetical:
      "A dealer sells a truck as 'never wrecked' when it had major collision damage. The buyer sues under the DTPA, which may let him recover more than his actual loss because the misrepresentation was knowing.",
    relatedPractices: ["dtpa"],
  },
  {
    slug: "receivership",
    term: "Receivership",
    definition:
      "A court's appointment of a neutral person — a receiver — to take control of property or a business to preserve it during a dispute or to satisfy a judgment. The receiver answers to the court.",
    hypothetical:
      "Two partners deadlock and the company's cash is disappearing. A court appoints a receiver to run the business and protect its assets until the lawsuit between the partners is resolved.",
    relatedPractices: ["receivership-matters"],
  },
  {
    slug: "probate",
    term: "Probate",
    definition:
      "The court-supervised process of settling a deceased person's estate — proving the will, paying debts, and distributing what remains to the rightful heirs or beneficiaries.",
    hypothetical:
      "A widow's late husband left a will naming her as executor. She opens probate to have the will recognized, pay the final bills, and transfer the house and accounts into her name.",
    relatedPractices: ["probate"],
  },
  {
    slug: "intestate",
    term: "Intestate",
    definition:
      "Dying without a valid will. When that happens, Texas statutes — not the deceased's wishes — decide who inherits.",
    hypothetical:
      "A man dies suddenly with no will. Because he died intestate, the Texas rules of descent and distribution determine how his property splits among his spouse and children, regardless of what he may have intended.",
    relatedPractices: ["probate", "estate-succession-planning"],
  },
  {
    slug: "fiduciary",
    term: "Fiduciary Duty",
    definition:
      "The highest legal duty of trust, requiring a person who acts on another's behalf — like a partner, trustee, or executor — to act with loyalty and in the other's best interest, not their own.",
    hypothetical:
      "An executor quietly sells estate land to himself at a discount. Because he owes a fiduciary duty to the beneficiaries, that self-dealing breaches his duty and can be undone.",
    relatedPractices: ["probate", "civil-commercial-litigation", "business-related-matters"],
  },
  {
    slug: "discovery",
    term: "Discovery",
    definition:
      "The formal pretrial exchange of evidence — documents, written questions, and testimony — through which each side learns the facts the other will use. It is where most cases are actually built.",
    hypothetical:
      "In a contract suit, one party sends requests for the other's emails and a deposition notice. Through this discovery, it obtains a message admitting the deal was never finalized.",
    relatedPractices: ["civil-commercial-litigation"],
  },
  {
    slug: "deposition",
    term: "Deposition",
    definition:
      "Sworn, out-of-court testimony taken before trial, recorded by a court reporter, used to learn what a witness knows and to lock in their story for later use.",
    hypothetical:
      "Before trial, a lawyer deposes the opposing party, who swears the light was green. At trial, when he claims it was red, the deposition transcript is used to impeach him.",
    relatedPractices: ["civil-commercial-litigation", "personal-injury-wrongful-death"],
  },
  {
    slug: "preserving-error",
    term: "Preserving Error",
    definition:
      "Making a timely, specific objection or request at trial so that, if the judge rules wrongly, the issue can be raised on appeal. An error not preserved is usually waived.",
    hypothetical:
      "Damaging hearsay is offered and the lawyer says nothing. Because she failed to object and preserve error, the appellate court will not consider whether admitting it was wrong.",
    relatedPractices: ["appellate-law"],
    aliases: ["error preservation"],
  },
  {
    slug: "standard-of-review",
    term: "Standard of Review",
    definition:
      "The level of deference an appellate court gives a trial court's decision. Some rulings are reviewed fresh; others stand unless the trial judge clearly abused discretion.",
    hypothetical:
      "A party appeals a discovery ruling. Because that decision is reviewed for abuse of discretion, the appeals court will not reverse merely because it might have ruled differently.",
    relatedPractices: ["appellate-law"],
  },
  {
    slug: "default-judgment",
    term: "Default Judgment",
    definition:
      "A judgment entered against a party who fails to answer or appear after being properly served. It can hand the other side a win without any fight on the merits.",
    hypothetical:
      "A debt buyer sues and the defendant ignores the citation. After the deadline passes with no answer, the court grants a default judgment for the full amount claimed.",
    relatedPractices: ["consumer-debt-defense", "commercial-debt-collection-defense"],
  },
  {
    slug: "statute-of-limitations",
    term: "Statute of Limitations",
    definition:
      "The legal deadline for filing a lawsuit. Once it passes, the claim is barred no matter how strong it is.",
    hypothetical:
      "An injured person waits three years to sue over a car wreck, but the limitations period was two. The claim is time-barred, and the case is dismissed even though the other driver was clearly at fault.",
    relatedPractices: ["personal-injury-wrongful-death", "consumer-debt-defense"],
    aliases: ["limitations", "time-barred"],
  },
  {
    slug: "burden-of-proof",
    term: "Burden of Proof",
    definition:
      "The obligation to prove a disputed fact. In civil cases it is usually a preponderance of the evidence; in criminal cases the State must prove guilt beyond a reasonable doubt.",
    hypothetical:
      "A prosecutor's evidence leaves the jury genuinely unsure whether the defendant was the driver. Because the State bears the burden beyond a reasonable doubt, that doubt requires an acquittal.",
    relatedPractices: ["criminal-defense", "civil-commercial-litigation"],
  },
  {
    slug: "preponderance",
    term: "Preponderance of the Evidence",
    definition:
      "The civil standard of proof: more likely than not. The party with this burden wins if the evidence tips even slightly in its favor.",
    hypothetical:
      "In a contract dispute the evidence is close, but the jury finds it just a bit more likely the defendant broke the deal. That tip past fifty percent satisfies the preponderance standard.",
    relatedPractices: ["civil-commercial-litigation"],
  },
  {
    slug: "beyond-reasonable-doubt",
    term: "Beyond a Reasonable Doubt",
    definition:
      "The high standard of proof required to convict in a criminal case — enough certainty that a reasonable person would not hesitate to rely on it in their most important affairs.",
    hypothetical:
      "The jury thinks the defendant probably did it, but has a real, reasoned doubt. Because 'probably' is not 'beyond a reasonable doubt,' they must acquit.",
    relatedPractices: ["criminal-defense"],
  },
  {
    slug: "negligence",
    term: "Negligence",
    definition:
      "The failure to use ordinary care, causing harm to another. Proving it requires a duty, a breach of that duty, causation, and damages.",
    hypothetical:
      "A driver runs a red light and hits a pedestrian in the crosswalk. He owed a duty to drive carefully, breached it, and caused real injuries — the elements of negligence.",
    relatedPractices: ["personal-injury-wrongful-death"],
  },
  {
    slug: "wrongful-death",
    term: "Wrongful Death",
    definition:
      "A claim brought by certain surviving family members when a person dies because of another's wrongful conduct, to recover for their loss.",
    hypothetical:
      "A trucking company's driver causes a fatal crash. The deceased's spouse and children bring a wrongful-death claim for the loss of their husband and father.",
    relatedPractices: ["personal-injury-wrongful-death"],
  },
  {
    slug: "damages",
    term: "Damages",
    definition:
      "The money a court awards to compensate for a loss. They can cover economic harm like bills and lost wages, non-economic harm like pain, and sometimes punitive amounts for egregious conduct.",
    hypothetical:
      "A jury finds for an injured plaintiff and awards her medical bills, lost income, and an amount for pain and suffering — the categories of damages that together make her whole.",
    relatedPractices: ["personal-injury-wrongful-death", "civil-commercial-litigation"],
  },
  {
    slug: "punitive-damages",
    term: "Punitive Damages",
    definition:
      "Also called exemplary damages — money awarded not to compensate but to punish especially reckless or malicious conduct and deter it. Texas caps them in most cases.",
    hypothetical:
      "A company knowingly sells a dangerous product to cut costs. Beyond compensating the injured buyer, the jury awards punitive damages to punish the deliberate disregard for safety.",
    relatedPractices: ["personal-injury-wrongful-death", "dtpa"],
    aliases: ["exemplary damages"],
  },
  {
    slug: "breach-of-contract",
    term: "Breach of Contract",
    definition:
      "Failing to perform a binding promise without a legal excuse. The injured party can sue for the losses the breach caused.",
    hypothetical:
      "A supplier signs a contract to deliver steel by March, then never ships it, forcing the buyer to pay more elsewhere. The supplier's failure is a breach, and the buyer can recover the extra cost.",
    relatedPractices: ["civil-commercial-litigation", "business-related-matters"],
  },
  {
    slug: "fraud",
    term: "Fraud",
    definition:
      "A knowing misrepresentation of a material fact, made to induce reliance, that causes harm to the person who reasonably relies on it.",
    hypothetical:
      "An investor is told a company is profitable when the promoter knows it is broke. Relying on the lie, the investor buys in and loses everything — the makings of a fraud claim.",
    relatedPractices: ["civil-commercial-litigation", "plaintiffs-litigation"],
  },
  {
    slug: "fraudulent-transfer",
    term: "Fraudulent Transfer",
    definition:
      "Moving assets to put them out of a creditor's reach, often by 'selling' them to an insider for little or nothing. Courts can undo such transfers.",
    hypothetical:
      "Facing a judgment, a man deeds his ranch to his brother for ten dollars. A court can find the deal a fraudulent transfer and make the land available to satisfy the creditor.",
    relatedPractices: ["civil-commercial-litigation", "commercial-debt-collection-defense"],
  },
  {
    slug: "conversion",
    term: "Conversion",
    definition:
      "The wrongful exercise of control over someone else's personal property, inconsistent with the owner's rights — the civil cousin of theft.",
    hypothetical:
      "A storage company sells a customer's equipment without authority and keeps the money. Taking and disposing of property that was not theirs is conversion.",
    relatedPractices: ["civil-commercial-litigation"],
  },
  {
    slug: "abstract-of-judgment",
    term: "Abstract of Judgment",
    definition:
      "A recorded summary of a money judgment that creates a lien on the debtor's real property in the county where it is filed, clouding title until the judgment is paid.",
    hypothetical:
      "A creditor records an abstract of judgment in the county where the debtor owns land. When the debtor later tries to sell, the lien must be paid before clear title can pass.",
    relatedPractices: ["commercial-debt-collection-defense"],
  },
  {
    slug: "turnover-order",
    term: "Turnover Order",
    definition:
      "A post-judgment order requiring a debtor to turn over non-exempt property that cannot be reached by ordinary means, sometimes through a receiver.",
    hypothetical:
      "A judgment debtor hides income in hard-to-reach business interests. The creditor obtains a turnover order forcing those assets to be delivered toward the debt.",
    relatedPractices: ["commercial-debt-collection-defense", "receivership-matters"],
  },
  {
    slug: "deed-of-trust",
    term: "Deed of Trust",
    definition:
      "The instrument that secures a Texas home loan, giving a trustee the power to sell the property at foreclosure if the borrower defaults.",
    hypothetical:
      "A homeowner stops paying the mortgage. The deed of trust she signed at closing gives the lender's trustee the authority to post and conduct a foreclosure sale.",
    relatedPractices: ["foreclosures"],
  },
  {
    slug: "wrongful-foreclosure",
    term: "Wrongful Foreclosure",
    definition:
      "A claim that a foreclosure sale was conducted improperly — for example, without proper notice or an actual default — causing the owner to lose the property or its value.",
    hypothetical:
      "A bank forecloses while the owner is current on a court-approved payment plan. Because there was no real default, the owner may have a wrongful-foreclosure claim.",
    relatedPractices: ["foreclosures"],
  },
  {
    slug: "exempt-property",
    term: "Exempt Property",
    definition:
      "Property the law shields from creditors, such as a Texas homestead, certain wages, and specified personal property. Exempt assets generally cannot be seized to pay a judgment.",
    hypothetical:
      "A creditor tries to grab a debtor's home to satisfy a judgment, but the Texas homestead exemption protects it. The creditor cannot force its sale for that debt.",
    relatedPractices: ["garnishments", "consumer-debt-defense"],
    aliases: ["exemption", "homestead exemption"],
  },
  {
    slug: "service-of-process",
    term: "Service of Process",
    definition:
      "The formal delivery of a lawsuit's citation to a defendant, which gives the court power over them and starts the clock to answer. Defective service can void a judgment.",
    hypothetical:
      "Papers are left with a stranger at the wrong house and the defendant never sees them. Because service of process was defective, a default judgment based on it can later be set aside.",
    relatedPractices: ["consumer-debt-defense", "civil-commercial-litigation"],
    aliases: ["served", "citation"],
  },
  {
    slug: "answer",
    term: "Answer",
    definition:
      "The defendant's formal written response to a lawsuit, due by a set deadline, that prevents a default and raises defenses. Filing one keeps you in the fight.",
    hypothetical:
      "Served with a debt suit, a defendant files a simple answer before the deadline. That filing alone stops a default judgment and forces the plaintiff to prove its case.",
    relatedPractices: ["consumer-debt-defense", "civil-commercial-litigation"],
  },
  {
    slug: "counterclaim",
    term: "Counterclaim",
    definition:
      "A claim a defendant asserts back against the plaintiff in the same lawsuit. It can turn a defense into an offense.",
    hypothetical:
      "A contractor sues a homeowner for the balance due, but the work was defective. The homeowner files a counterclaim for the cost to fix it, seeking her own recovery in the same case.",
    relatedPractices: ["civil-commercial-litigation", "commercial-debt-collection-defense"],
  },
  {
    slug: "power-of-attorney",
    term: "Power of Attorney",
    definition:
      "A document authorizing someone to act on your behalf in financial or medical matters. A durable power of attorney stays effective even if you become incapacitated.",
    hypothetical:
      "Before surgery, a woman signs a durable power of attorney naming her son. When complications leave her unable to manage her affairs, he can pay her bills and handle her finances.",
    relatedPractices: ["estate-succession-planning"],
    aliases: ["poa"],
  },
  {
    slug: "executor",
    term: "Executor",
    definition:
      "The person named in a will to carry out its terms — gathering assets, paying debts, and distributing the estate. A court-appointed equivalent without a will is an administrator.",
    hypothetical:
      "A father's will names his eldest daughter executor. After his death, she is responsible for inventorying the estate, settling its debts, and distributing what remains as the will directs.",
    relatedPractices: ["probate"],
    aliases: ["administrator", "personal representative"],
  },
  {
    slug: "trust",
    term: "Trust",
    definition:
      "A legal arrangement in which a trustee holds and manages property for the benefit of others under terms the creator sets. Trusts can avoid probate and control how and when assets pass.",
    hypothetical:
      "Parents place their land in a trust that pays income to their children but keeps the property intact until grandchildren come of age — directing the legacy long after they are gone.",
    relatedPractices: ["estate-succession-planning"],
  },
  {
    slug: "will",
    term: "Will",
    definition:
      "A signed, witnessed document directing how your property is distributed after death and naming an executor and guardians. Without one, the state's intestacy rules decide.",
    hypothetical:
      "A young couple signs wills naming guardians for their children and leaving everything to each other. If something happens, their wishes — not a court guessing — control.",
    relatedPractices: ["estate-succession-planning", "probate"],
  },
  {
    slug: "heirship",
    term: "Determination of Heirship",
    definition:
      "A court proceeding that identifies the legal heirs of someone who died without a will, so property can be transferred to the right people.",
    hypothetical:
      "A man dies intestate owning mineral interests. Because no will says who inherits, the family brings a heirship proceeding to have the court declare the rightful heirs.",
    relatedPractices: ["probate"],
  },
  {
    slug: "venue",
    term: "Venue",
    definition:
      "The proper county or court location for a lawsuit. The right venue depends on where the parties are, where the events happened, or where property sits.",
    hypothetical:
      "A defendant sued far from home argues the wreck and both parties are in another county. He moves to transfer venue to the county where the events actually occurred.",
    relatedPractices: ["civil-commercial-litigation"],
  },
  {
    slug: "mediation",
    term: "Mediation",
    definition:
      "A settlement process in which a neutral mediator helps the parties negotiate a resolution. It is non-binding unless and until the parties sign an agreement.",
    hypothetical:
      "Before trial, a judge orders the parties to mediation. With the mediator shuttling offers between rooms, they reach a settlement that both can live with and put it in writing.",
    relatedPractices: ["civil-commercial-litigation", "personal-injury-wrongful-death"],
  },
];
