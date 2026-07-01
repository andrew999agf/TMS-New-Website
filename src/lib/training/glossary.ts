/**
 * Hover-glossary for training modules. Bold terms in lesson content are matched
 * against this list (case-insensitive, with simple plural handling); a match
 * renders a navy hover popup with a definition and a short "law-school
 * flashcard" hypothetical. The same data drives the full Glossary page at
 * /admin/training/glossary. Add a term by appending to RAW — content needs no
 * changes as long as the term is written in **bold** somewhere.
 */

export type GlossaryCategory = "Estate Planning" | "Criminal Defense" | "Ethics & Practice";

/** Section order on the Glossary page. */
export const GLOSSARY_CATEGORIES: GlossaryCategory[] = ["Estate Planning", "Criminal Defense", "Ethics & Practice"];

export type GlossaryEntry = {
  term: string;
  /** Alternate names/phrasings that match the same entry. */
  also: string[];
  definition: string;
  hypothetical: string;
  category: GlossaryCategory;
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const RAW: { terms: string[]; definition: string; hypothetical: string; category: GlossaryCategory }[] = [
  /* ------------------------------ Estate Planning ------------------------------ */
  { category: "Estate Planning", terms: ["testator"], definition: "The person who makes a will.", hypothetical: "Maria signs a will leaving her house to her son — Maria is the testator." },
  { category: "Estate Planning", terms: ["executor"], definition: "The person named in a will to gather assets, pay debts, and distribute the estate.", hypothetical: "John's will names his sister as executor; she files the will for probate and pays his final bills." },
  { category: "Estate Planning", terms: ["independent executor"], definition: "A Texas executor who administers the estate with minimal court supervision.", hypothetical: "Because the will named an independent executor serving without bond, she settled the estate without court approval for each step." },
  { category: "Estate Planning", terms: ["beneficiary"], definition: "A person or organization that receives property under a will or trust.", hypothetical: "A will leaves $10,000 to a church — the church is a beneficiary." },
  { category: "Estate Planning", terms: ["devise", "bequest"], definition: "A gift of property made in a will.", hypothetical: "\"I give my watch to my nephew\" is a bequest." },
  { category: "Estate Planning", terms: ["residuary estate", "residuary", "residue"], definition: "Everything left in an estate after specific gifts and debts are paid.", hypothetical: "After giving away her car and jewelry, the rest of Ann's property — the residuary estate — passes to her children." },
  { category: "Estate Planning", terms: ["probate"], definition: "The court process that proves a will is valid and oversees administration of the estate.", hypothetical: "After Dad died, the family took his will to the county court to probate it." },
  { category: "Estate Planning", terms: ["intestate"], definition: "Dying without a valid will, so state law decides who inherits.", hypothetical: "Carlos died with no will, so his estate passes by Texas intestacy law." },
  { category: "Estate Planning", terms: ["codicil"], definition: "A formal amendment to an existing will.", hypothetical: "Rather than rewrite her will, Beth added a codicil naming a new executor." },
  { category: "Estate Planning", terms: ["guardian"], definition: "A person appointed to care for a minor child (or an incapacitated person) or their property.", hypothetical: "The will names Aunt Rosa as guardian for the couple's young children." },
  { category: "Estate Planning", terms: ["trustee"], definition: "The person or institution that manages trust property for the beneficiaries.", hypothetical: "The trust names the client's brother as trustee to manage funds for her kids until age 25." },
  { category: "Estate Planning", terms: ["settlor", "trustor", "grantor"], definition: "The person who creates (and usually funds) a trust; in a deed, the person transferring property.", hypothetical: "When Pat signs a living trust and moves assets into it, Pat is the settlor." },
  { category: "Estate Planning", terms: ["testamentary trust"], definition: "A trust created by a will that comes into existence at the person's death.", hypothetical: "The will says a child's share is held in a testamentary trust until age 30 instead of paid outright." },
  { category: "Estate Planning", terms: ["living trust", "revocable living trust", "inter vivos"], definition: "A trust created and funded during life that can avoid probate.", hypothetical: "Sam moves his home and accounts into a living trust so they pass to his daughter without probate." },
  { category: "Estate Planning", terms: ["revocable"], definition: "Able to be changed or canceled by the person who made it.", hypothetical: "A revocable living trust lets the settlor amend or revoke it anytime during life." },
  { category: "Estate Planning", terms: ["irrevocable"], definition: "Unable to be changed or revoked.", hypothetical: "At the settlor's death, the living trust becomes irrevocable and its terms are locked in." },
  { category: "Estate Planning", terms: ["spendthrift"], definition: "A trust provision that keeps a beneficiary from assigning their interest and shields it from creditors.", hypothetical: "Thanks to the spendthrift clause, a beneficiary's creditors can't reach the trust funds before they're paid out." },
  { category: "Estate Planning", terms: ["hems"], definition: "A distribution standard letting a trustee pay for a beneficiary's Health, Education, Maintenance, and Support.", hypothetical: "Under HEMS, the trustee pays the beneficiary's tuition and medical bills but not a luxury vacation." },
  { category: "Estate Planning", terms: ["per stirpes"], definition: "Dividing a share so a deceased beneficiary's portion passes to their descendants.", hypothetical: "Gifts pass to the children per stirpes, so a predeceased child's share goes to that child's kids." },
  { category: "Estate Planning", terms: ["per capita"], definition: "Dividing property equally among the surviving members of a generation.", hypothetical: "Per capita, the surviving grandchildren split the share equally, head by head." },
  { category: "Estate Planning", terms: ["holographic will"], definition: "A will written entirely in the testator's own handwriting and signed; no witnesses needed in Texas.", hypothetical: "Grandpa's handwritten, signed note leaving his truck to a grandson can be a holographic will." },
  { category: "Estate Planning", terms: ["attested will"], definition: "A typed will signed by the testator and witnessed by two people.", hypothetical: "The will the firm prepares, signed before two witnesses, is an attested will." },
  { category: "Estate Planning", terms: ["self-proving affidavit"], definition: "A notarized statement attached to a will so it can be probated without the witnesses testifying.", hypothetical: "Because the will had a self-proving affidavit, the witnesses didn't have to appear in court years later." },
  { category: "Estate Planning", terms: ["power of attorney", "poa"], definition: "A document authorizing an agent to act for the person who signs it.", hypothetical: "Lee signs a power of attorney so his daughter can manage his bank accounts." },
  { category: "Estate Planning", terms: ["durable"], definition: "A power of attorney that stays effective even if the principal becomes incapacitated.", hypothetical: "Because it's durable, the POA still works after the principal develops dementia." },
  { category: "Estate Planning", terms: ["springing"], definition: "A power of attorney that takes effect only on a future event, usually the principal's incapacity.", hypothetical: "The springing POA gives the agent authority only once a doctor certifies the principal can't manage finances." },
  { category: "Estate Planning", terms: ["principal"], definition: "The person who grants authority to an agent in a power of attorney.", hypothetical: "In a financial POA, the person being represented is the principal." },
  { category: "Estate Planning", terms: ["agent", "attorney-in-fact"], definition: "The person authorized to act for the principal under a power of attorney.", hypothetical: "The daughter named in the POA is the agent (attorney-in-fact)." },
  { category: "Estate Planning", terms: ["hipaa"], definition: "A federal law restricting how health providers share a person's medical information.", hypothetical: "Because of HIPAA, the hospital won't share records with the daughter until she has a signed authorization." },
  { category: "Estate Planning", terms: ["protected health information", "phi"], definition: "Identifiable medical information protected under HIPAA.", hypothetical: "A patient's diagnosis and treatment records are protected health information (PHI)." },
  { category: "Estate Planning", terms: ["directive to physicians", "living will"], definition: "A document stating end-of-life treatment wishes.", hypothetical: "Her directive to physicians says she doesn't want artificial life support if she's terminally ill." },
  { category: "Estate Planning", terms: ["declaration of guardian"], definition: "A document naming who should — and should not — serve as your guardian if one is ever needed.", hypothetical: "His declaration of guardian names his sister and expressly excludes his estranged brother." },
  { category: "Estate Planning", terms: ["lady bird deed", "enhanced life estate deed"], definition: "A Texas deed that keeps full control of property during life and passes it at death without probate.", hypothetical: "Through a lady bird deed, Mom keeps her home and can sell it anytime, but at her death it goes to her son automatically." },
  { category: "Estate Planning", terms: ["remainder", "remainderman"], definition: "The future interest that takes effect after a life estate ends — and the person who holds it.", hypothetical: "Under the lady bird deed, the son is the remainderman who receives the house at his mother's death." },
  { category: "Estate Planning", terms: ["grantee"], definition: "The person receiving property in a deed.", hypothetical: "The relative named to receive the home on the deed is the grantee." },
  { category: "Estate Planning", terms: ["testamentary capacity"], definition: "Being of sound mind to make a will: knowing your property and heirs and that you're making a will.", hypothetical: "If the client understands what she owns and who her family is, she likely has testamentary capacity." },
  { category: "Estate Planning", terms: ["pour-over will"], definition: "A will that sends any leftover assets into the person's living trust at death.", hypothetical: "Assets Sam forgot to retitle into his trust are caught by his pour-over will." },

  /* ------------------------------ Criminal Defense ------------------------------ */
  { category: "Criminal Defense", terms: ["felony"], definition: "The serious tier of Texas crime, punishable by state prison or state-jail time; generally must be charged by grand jury indictment.", hypothetical: "An aggravated assault charge is a felony, so it is indicted and heard at the district-court level." },
  { category: "Criminal Defense", terms: ["misdemeanor"], definition: "The lesser tier of crime — up to a year in county jail and/or a fine (or fine only for Class C); charged by information, no grand jury.", hypothetical: "A first DWI is a misdemeanor, so it's filed by information and heard in a county-level court." },
  { category: "Criminal Defense", terms: ["class a", "class a misdemeanor"], definition: "The highest misdemeanor: up to 1 year in county jail and/or a fine up to $4,000.", hypothetical: "Assault causing bodily injury is a Class A — a conviction could mean up to a year in the county jail." },
  { category: "Criminal Defense", terms: ["class b", "class b misdemeanor"], definition: "A mid-level misdemeanor: up to 180 days in county jail and/or a fine up to $2,000.", hypothetical: "A first DWI is a Class B, so the max jail exposure is 180 days." },
  { category: "Criminal Defense", terms: ["class c", "class c misdemeanor"], definition: "The lowest offense level: fine only, up to $500, with no jail — handled in justice or municipal court.", hypothetical: "An assault by offensive contact is a Class C: a ticket and a fine, resolved in municipal court." },
  { category: "Criminal Defense", terms: ["state jail felony"], definition: "The lowest felony: 180 days to 2 years in a state jail facility, served essentially day-for-day, plus up to a $10,000 fine.", hypothetical: "Theft of a $3,000 trailer is a state jail felony — prison-level consequences without the usual good-time credit." },
  { category: "Criminal Defense", terms: ["third-degree felony", "third degree"], definition: "A felony punishable by 2 to 10 years in prison and up to a $10,000 fine.", hypothetical: "A third DWI is a third-degree felony — 2 to 10 years of exposure even though each earlier DWI was a misdemeanor." },
  { category: "Criminal Defense", terms: ["second-degree felony", "second degree"], definition: "A felony punishable by 2 to 20 years in prison and up to a $10,000 fine.", hypothetical: "Robbery is a second-degree felony, so the range runs from 2 to 20 years." },
  { category: "Criminal Defense", terms: ["first-degree felony", "first degree"], definition: "A felony punishable by 5 to 99 years or life in prison and up to a $10,000 fine.", hypothetical: "Aggravated robbery with a firearm is a first-degree felony — the top of the ordinary range." },
  { category: "Criminal Defense", terms: ["capital felony"], definition: "The highest offense: punishable by life without parole, or the death penalty where the State seeks it.", hypothetical: "Capital murder is a capital felony; if the State waives death, the sentence is automatic life without parole." },
  { category: "Criminal Defense", terms: ["grand jury"], definition: "A citizen panel that decides whether there is probable cause to charge a felony — a \"true bill\" indicts; a \"no bill\" declines.", hypothetical: "The grand jury heard the detective's summary and returned a true bill, so the felony case moved forward." },
  { category: "Criminal Defense", terms: ["indictment", "grand jury indictment", "indict"], definition: "The formal felony charging document issued by a grand jury.", hypothetical: "Until the indictment came back, the DA couldn't take the burglary case to district court." },
  { category: "Criminal Defense", terms: ["information"], definition: "The prosecutor's charging document for a misdemeanor — no grand jury required.", hypothetical: "The DWI was filed by information, so there was no grand jury step before arraignment." },
  { category: "Criminal Defense", terms: ["magistration"], definition: "The first appearance after arrest, where a magistrate reads the accused their rights and sets bail.", hypothetical: "Within hours of the arrest, Dan was magistrated and bail was set at $5,000." },
  { category: "Criminal Defense", terms: ["arraignment"], definition: "The hearing where the defendant is formally told the charge and enters a plea.", hypothetical: "At arraignment, the client pleaded not guilty and the court set the first pretrial date." },
  { category: "Criminal Defense", terms: ["bail"], definition: "The security (money or promise) that gets a defendant released and guarantees their appearance in court.", hypothetical: "With bail set at $10,000, the family weighed paying cash or hiring a bondsman." },
  { category: "Criminal Defense", terms: ["cash bond"], definition: "The full bail amount posted with the court, refundable at the end of the case if conditions are met.", hypothetical: "Mom posted the full $2,500 cash bond and will get it back when the case ends." },
  { category: "Criminal Defense", terms: ["surety bond"], definition: "A bond posted by a bail bondsman for a non-refundable fee, typically a percentage of the bail.", hypothetical: "The bondsman posted the $20,000 bond for a $2,000 fee the family will never get back." },
  { category: "Criminal Defense", terms: ["personal bond", "pr bond", "personal pr bond", "personal recognizance"], definition: "Release on a written promise to appear — no money down — at the court's discretion.", hypothetical: "As a first-time offender with local ties, Kim was released on a personal (PR) bond." },
  { category: "Criminal Defense", terms: ["plea bargain", "plea bargains"], definition: "An agreement between the defense and the State on the charge and/or punishment, subject to the judge's approval.", hypothetical: "The plea bargain reduced the charge to a Class A with probation — but the judge still had to accept it." },
  { category: "Criminal Defense", terms: ["nolo contendere", "no contest", "nolo contendere no contest"], definition: "A plea that doesn't contest the charge — punished like a guilty plea, but not usable as an admission the same way in a related civil suit.", hypothetical: "After the crash, Ray pleaded no contest so his plea couldn't be used as an admission in the injury lawsuit." },
  { category: "Criminal Defense", terms: ["admonish", "admonishments", "admonition"], definition: "The warnings a judge must give before accepting a guilty or no-contest plea — the punishment range, that the plea deal isn't binding, and immigration consequences.", hypothetical: "Before taking the plea, the judge admonished Leo that deportation was possible because he wasn't a citizen." },
  { category: "Criminal Defense", terms: ["deferred adjudication", "deferred", "deferred adjudication community supervision"], definition: "A plea with no finding of guilt: the judge defers the case during supervision, and successful completion ends in dismissal — but a violation exposes the full punishment range.", hypothetical: "Tia finished her 18 months of deferred and the case was dismissed with no conviction; had she violated, the judge could have sentenced her anywhere in the range." },
  { category: "Criminal Defense", terms: ["community supervision", "probation", "regular community supervision"], definition: "A conviction with the jail or prison sentence suspended while the person completes supervised conditions; violating can trigger the original sentence.", hypothetical: "Mark was convicted but his 2-year sentence was probated for 4 years — if he violates, the court can impose the 2 years." },
  { category: "Criminal Defense", terms: ["parole"], definition: "Supervised early release from prison, decided by the Board of Pardons and Paroles — not by the court, and not the same as probation.", hypothetical: "After serving part of his 10-year sentence, Gil was released on parole under a state supervision officer." },
  { category: "Criminal Defense", terms: ["restitution"], definition: "Money a defendant is ordered to pay a victim for the victim's loss — separate from any fine or court costs.", hypothetical: "As a probation condition, Jo pays $150 a month in restitution for the windshield she broke." },
  { category: "Criminal Defense", terms: ["enhancement", "enhancements", "enhance"], definition: "A prior conviction or special fact that raises the punishment range — often by a full offense level.", hypothetical: "Because of his prior felony, Al's third-degree case was enhanced and punished as a second-degree." },
  { category: "Criminal Defense", terms: ["habitual", "habitual offender"], definition: "A defendant with the required sequence of prior felony convictions, facing a greatly elevated range — up to 25 to 99 years or life.", hypothetical: "With two prior sequential prison trips, Ed's new felony carried a habitual range starting at 25 years." },
  { category: "Criminal Defense", terms: ["expunction"], definition: "Complete erasure of an arrest and case record — generally after an acquittal, dismissal, or an arrest that never led to conviction.", hypothetical: "After her case was dismissed and the waiting period ran, Dana's arrest was expunged as if it never happened." },
  { category: "Criminal Defense", terms: ["order of nondisclosure", "nondisclosure"], definition: "A court order sealing a criminal record from public view — police and certain agencies can still see it. Often available after completing deferred adjudication.", hypothetical: "With his deferred completed, Sean got an order of nondisclosure so employers running background checks won't see the case." },
  { category: "Criminal Defense", terms: ["intoxicated", "intoxication"], definition: "Under Texas law: not having the normal use of mental or physical faculties from alcohol or drugs, OR having an alcohol concentration of 0.08 or more.", hypothetical: "Even at 0.06, a driver swerving and slurring can be \"intoxicated\" under the loss-of-faculties definition." },
  { category: "Criminal Defense", terms: ["dwi", "driving while intoxicated"], definition: "Operating a motor vehicle in a public place while intoxicated — starting as a Class B misdemeanor and escalating with priors, high BAC, or a child passenger.", hypothetical: "A first DWI is a Class B; the same stop with a 7-year-old in the back seat is a state jail felony." },
  { category: "Criminal Defense", terms: ["per se"], definition: "The intoxication theory proved by the number alone: an alcohol concentration of 0.08 or more.", hypothetical: "The 0.09 blood result let the State proceed per se, without proving lost faculties." },
  { category: "Criminal Defense", terms: ["implied consent"], definition: "By driving in Texas, a person is deemed to consent to breath or blood testing after a lawful DWI arrest; refusing has license consequences.", hypothetical: "Because of implied consent, Nora's refusal triggered a longer ALR license suspension." },
  { category: "Criminal Defense", terms: ["alr", "administrative license revocation", "administrative license revocation alr"], definition: "The separate civil driver's-license suspension case started by a DWI arrest — with roughly 15 days to request a hearing before the suspension takes effect.", hypothetical: "The firm requested the ALR hearing on day 12, preserving the client's license pending the hearing." },
  { category: "Criminal Defense", terms: ["ignition interlock"], definition: "A breath-test device wired to a vehicle that prevents it from starting if alcohol is detected — a common bond or supervision condition in DWI cases.", hypothetical: "As a bond condition on his second DWI, Hank had an ignition interlock installed in his truck." },
  { category: "Criminal Defense", terms: ["intoxication assault"], definition: "Causing serious bodily injury to another by accident while driving intoxicated — a third-degree felony.", hypothetical: "The crash broke the other driver's leg in three places, so the DWI became intoxication assault." },
  { category: "Criminal Defense", terms: ["intoxication manslaughter"], definition: "Causing a death by accident while driving intoxicated — a second-degree felony.", hypothetical: "Because the passenger died in the wreck, the charge was intoxication manslaughter, a second-degree felony." },
  { category: "Criminal Defense", terms: ["bodily injury"], definition: "Physical pain, illness, or any impairment of physical condition — the injury element of basic assault.", hypothetical: "A shove that leaves a sore arm causes \"bodily injury\" even with no visible mark." },
  { category: "Criminal Defense", terms: ["serious bodily injury"], definition: "Injury creating a substantial risk of death, or causing death, serious permanent disfigurement, or long-term loss or impairment of a body part or organ.", hypothetical: "A skull fracture with lasting effects is serious bodily injury — turning an assault into aggravated assault." },
  { category: "Criminal Defense", terms: ["deadly weapon"], definition: "A firearm, or anything that in its use or intended use is capable of causing death or serious bodily injury.", hypothetical: "A car driven at someone can be a deadly weapon, elevating the assault to aggravated." },
  { category: "Criminal Defense", terms: ["family violence"], definition: "Violence against a family or household member or someone in a dating relationship; a family-violence finding brings firearm bans and future felony enhancement.", hypothetical: "Because the complainant was his girlfriend, the Class A assault carried a family-violence finding — and a firearm disability." },
  { category: "Criminal Defense", terms: ["strangulation", "strangulation suffocation"], definition: "Impeding a person's normal breathing or blood circulation (choking) during a family-violence assault — a third-degree felony rather than a misdemeanor.", hypothetical: "The allegation that he grabbed her throat turned a Class A assault into a third-degree strangulation charge." },
  { category: "Criminal Defense", terms: ["protective order", "protective orders"], definition: "A court order restricting contact with a protected person; violating it is a separate crime.", hypothetical: "After the protective order issued, one text message to his ex became a new criminal charge." },
  { category: "Criminal Defense", terms: ["penalty group", "penalty groups"], definition: "The Texas Controlled Substances Act's classification of drugs (Groups 1, 1-A, 1-B, 2, 2-A, 3, 4) that, with weight, sets the punishment range.", hypothetical: "Methamphetamine sits in Penalty Group 1, so even a small amount is a felony." },
  { category: "Criminal Defense", terms: ["aggregate weight", "adulterants and dilutants"], definition: "The whole weight of the drug mixture — cutting agents (adulterants and dilutants) included — used to set the punishment tier.", hypothetical: "The baggie held mostly cutting agent, but its full 5-gram aggregate weight set the felony level anyway." },
  { category: "Criminal Defense", terms: ["drug-free zone", "drug free zone"], definition: "An area in or near schools, playgrounds, or youth centers where drug offenses carry enhanced punishment.", hypothetical: "Because the arrest happened 800 feet from an elementary school, the drug-free-zone enhancement raised the range." },
  { category: "Criminal Defense", terms: ["aggregation"], definition: "Adding together multiple thefts committed under one scheme so the combined value sets the offense grade.", hypothetical: "Twelve $300 skims from the register aggregated into one $3,600 state-jail-felony theft." },
  { category: "Criminal Defense", terms: ["burglary"], definition: "Entering a habitation or building without consent intending to commit theft or another felony; burglary of a habitation is a second-degree felony.", hypothetical: "Slipping into a neighbor's garage to steal tools is burglary even if nothing is ultimately taken." },
  { category: "Criminal Defense", terms: ["robbery"], definition: "Theft plus causing bodily injury or threatening it — a violent second-degree felony.", hypothetical: "Shoving the clerk while grabbing the cash drawer turned a theft into robbery." },
  { category: "Criminal Defense", terms: ["aggravated robbery"], definition: "Robbery with serious bodily injury, a deadly weapon, or an elderly or disabled victim — a first-degree felony.", hypothetical: "Flashing a pistol during the purse snatching made it aggravated robbery, a first-degree felony." },
  { category: "Criminal Defense", terms: ["criminal mischief"], definition: "Intentionally damaging or destroying another person's property, graded by the cost of the damage on a ladder like theft's.", hypothetical: "Keying a truck with $2,800 in repair costs is state-jail-felony criminal mischief." },
  { category: "Criminal Defense", terms: ["permitless constitutional carry", "constitutional carry", "permitless carry"], definition: "Texas's rule since 2021 that most people 21+ who aren't otherwise prohibited may carry a handgun without a license — subject to prohibited places and persons.", hypothetical: "Constitutional carry let Sara carry without a permit, but not into the courthouse — and not at all once she picked up a felony conviction." },
  { category: "Criminal Defense", terms: ["felon in possession", "unlawful possession of a firearm by a felon"], definition: "A person with a felony conviction possessing a firearm — a third-degree felony with timing and location rules.", hypothetical: "Five years after prison, Joe kept a rifle at home; whether that's lawful depends on the statute's timing rules — a question for the attorney." },
  { category: "Criminal Defense", terms: ["beyond a reasonable doubt"], definition: "The State's burden of proof in a criminal case — the highest standard in the law.", hypothetical: "The jury thought the defendant probably did it but had real doubts — 'probably' isn't beyond a reasonable doubt, so they acquitted." },
  { category: "Criminal Defense", terms: ["probable cause"], definition: "A reasonable basis, from the facts, to believe a crime was committed — the standard for arrests, warrants, and grand jury indictment.", hypothetical: "The smell of burnt marijuana and a visible pipe gave the officer probable cause to search the car." },

  /* ------------------------------ Ethics & Practice ------------------------------ */
  { category: "Ethics & Practice", terms: ["fiduciary"], definition: "Someone legally required to act in good faith and in another's best interest.", hypothetical: "An agent under a POA is a fiduciary and can't use the principal's money for himself." },
  { category: "Ethics & Practice", terms: ["unauthorized practice of law", "upl"], definition: "A non-lawyer giving legal advice or doing work only a lawyer may do.", hypothetical: "If a clerk tells a client which option to choose for their will, that's unauthorized practice of law." },
  { category: "Ethics & Practice", terms: ["conflicts of interest", "conflict of interest", "conflicts"], definition: "A situation where duties to one client or person clash with duties to another.", hypothetical: "Representing both spouses with very different wishes can create a conflict of interest." },
];

const GLOSSARY: Record<string, GlossaryEntry> = {};
const ENTRIES: GlossaryEntry[] = [];
for (const e of RAW) {
  const entry: GlossaryEntry = {
    term: e.terms[0],
    also: e.terms.slice(1),
    definition: e.definition,
    hypothetical: e.hypothetical,
    category: e.category,
  };
  ENTRIES.push(entry);
  for (const t of e.terms) GLOSSARY[norm(t)] = entry;
}

/** All entries (one per concept), alphabetized — for the Glossary page. */
export function getGlossaryEntries(): GlossaryEntry[] {
  return [...ENTRIES].sort((a, b) => a.term.localeCompare(b.term));
}

/** Look up a bold term (handles a trailing colon and simple plurals). */
export function lookupTerm(boldText: string): GlossaryEntry | undefined {
  const base = norm(boldText);
  const candidates = [base];
  if (boldText.includes(":")) candidates.push(norm(boldText.split(":")[0]));
  // crude singularization so "beneficiaries"/"trustees"/"agents" still match
  candidates.push(base.replace(/ies$/, "y"), base.replace(/s$/, ""));
  for (const c of candidates) {
    if (c && GLOSSARY[c]) return GLOSSARY[c];
  }
  return undefined;
}
