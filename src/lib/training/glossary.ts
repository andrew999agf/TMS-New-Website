/**
 * Hover-glossary for training modules. Bold terms in lesson content are matched
 * against this list (case-insensitive, with simple plural handling); a match
 * renders a hover popup with a definition and a short "law-school flashcard"
 * hypothetical. Add a term by appending to RAW — content needs no changes as
 * long as the term is written in **bold** somewhere.
 */

export type GlossaryEntry = { term: string; definition: string; hypothetical: string };

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const RAW: { terms: string[]; definition: string; hypothetical: string }[] = [
  { terms: ["testator"], definition: "The person who makes a will.", hypothetical: "Maria signs a will leaving her house to her son — Maria is the testator." },
  { terms: ["executor"], definition: "The person named in a will to gather assets, pay debts, and distribute the estate.", hypothetical: "John's will names his sister as executor; she files the will for probate and pays his final bills." },
  { terms: ["independent executor"], definition: "A Texas executor who administers the estate with minimal court supervision.", hypothetical: "Because the will named an independent executor serving without bond, she settled the estate without court approval for each step." },
  { terms: ["beneficiary"], definition: "A person or organization that receives property under a will or trust.", hypothetical: "A will leaves $10,000 to a church — the church is a beneficiary." },
  { terms: ["devise", "bequest"], definition: "A gift of property made in a will.", hypothetical: "\"I give my watch to my nephew\" is a bequest." },
  { terms: ["residuary estate", "residuary", "residue"], definition: "Everything left in an estate after specific gifts and debts are paid.", hypothetical: "After giving away her car and jewelry, the rest of Ann's property — the residuary estate — passes to her children." },
  { terms: ["probate"], definition: "The court process that proves a will is valid and oversees administration of the estate.", hypothetical: "After Dad died, the family took his will to the county court to probate it." },
  { terms: ["intestate"], definition: "Dying without a valid will, so state law decides who inherits.", hypothetical: "Carlos died with no will, so his estate passes by Texas intestacy law." },
  { terms: ["codicil"], definition: "A formal amendment to an existing will.", hypothetical: "Rather than rewrite her will, Beth added a codicil naming a new executor." },
  { terms: ["guardian"], definition: "A person appointed to care for a minor child (or an incapacitated person) or their property.", hypothetical: "The will names Aunt Rosa as guardian for the couple's young children." },
  { terms: ["trustee"], definition: "The person or institution that manages trust property for the beneficiaries.", hypothetical: "The trust names the client's brother as trustee to manage funds for her kids until age 25." },
  { terms: ["settlor", "trustor", "grantor"], definition: "The person who creates (and usually funds) a trust; in a deed, the person transferring property.", hypothetical: "When Pat signs a living trust and moves assets into it, Pat is the settlor." },
  { terms: ["testamentary trust"], definition: "A trust created by a will that comes into existence at the person's death.", hypothetical: "The will says a child's share is held in a testamentary trust until age 30 instead of paid outright." },
  { terms: ["living trust", "revocable living trust", "inter vivos"], definition: "A trust created and funded during life that can avoid probate.", hypothetical: "Sam moves his home and accounts into a living trust so they pass to his daughter without probate." },
  { terms: ["revocable"], definition: "Able to be changed or canceled by the person who made it.", hypothetical: "A revocable living trust lets the settlor amend or revoke it anytime during life." },
  { terms: ["irrevocable"], definition: "Unable to be changed or revoked.", hypothetical: "At the settlor's death, the living trust becomes irrevocable and its terms are locked in." },
  { terms: ["spendthrift"], definition: "A trust provision that keeps a beneficiary from assigning their interest and shields it from creditors.", hypothetical: "Thanks to the spendthrift clause, a beneficiary's creditors can't reach the trust funds before they're paid out." },
  { terms: ["hems"], definition: "A distribution standard letting a trustee pay for a beneficiary's Health, Education, Maintenance, and Support.", hypothetical: "Under HEMS, the trustee pays the beneficiary's tuition and medical bills but not a luxury vacation." },
  { terms: ["per stirpes"], definition: "Dividing a share so a deceased beneficiary's portion passes to their descendants.", hypothetical: "Gifts pass to the children per stirpes, so a predeceased child's share goes to that child's kids." },
  { terms: ["per capita"], definition: "Dividing property equally among the surviving members of a generation.", hypothetical: "Per capita, the surviving grandchildren split the share equally, head by head." },
  { terms: ["holographic will"], definition: "A will written entirely in the testator's own handwriting and signed; no witnesses needed in Texas.", hypothetical: "Grandpa's handwritten, signed note leaving his truck to a grandson can be a holographic will." },
  { terms: ["attested will"], definition: "A typed will signed by the testator and witnessed by two people.", hypothetical: "The will the firm prepares, signed before two witnesses, is an attested will." },
  { terms: ["self-proving affidavit"], definition: "A notarized statement attached to a will so it can be probated without the witnesses testifying.", hypothetical: "Because the will had a self-proving affidavit, the witnesses didn't have to appear in court years later." },
  { terms: ["power of attorney", "poa"], definition: "A document authorizing an agent to act for the person who signs it.", hypothetical: "Lee signs a power of attorney so his daughter can manage his bank accounts." },
  { terms: ["durable"], definition: "A power of attorney that stays effective even if the principal becomes incapacitated.", hypothetical: "Because it's durable, the POA still works after the principal develops dementia." },
  { terms: ["springing"], definition: "A power of attorney that takes effect only on a future event, usually the principal's incapacity.", hypothetical: "The springing POA gives the agent authority only once a doctor certifies the principal can't manage finances." },
  { terms: ["principal"], definition: "The person who grants authority to an agent in a power of attorney.", hypothetical: "In a financial POA, the person being represented is the principal." },
  { terms: ["agent", "attorney-in-fact"], definition: "The person authorized to act for the principal under a power of attorney.", hypothetical: "The daughter named in the POA is the agent (attorney-in-fact)." },
  { terms: ["fiduciary"], definition: "Someone legally required to act in good faith and in another's best interest.", hypothetical: "An agent under a POA is a fiduciary and can't use the principal's money for himself." },
  { terms: ["hipaa"], definition: "A federal law restricting how health providers share a person's medical information.", hypothetical: "Because of HIPAA, the hospital won't share records with the daughter until she has a signed authorization." },
  { terms: ["protected health information", "phi"], definition: "Identifiable medical information protected under HIPAA.", hypothetical: "A patient's diagnosis and treatment records are protected health information (PHI)." },
  { terms: ["directive to physicians", "living will"], definition: "A document stating end-of-life treatment wishes.", hypothetical: "Her directive to physicians says she doesn't want artificial life support if she's terminally ill." },
  { terms: ["declaration of guardian"], definition: "A document naming who should — and should not — serve as your guardian if one is ever needed.", hypothetical: "His declaration of guardian names his sister and expressly excludes his estranged brother." },
  { terms: ["lady bird deed", "enhanced life estate deed"], definition: "A Texas deed that keeps full control of property during life and passes it at death without probate.", hypothetical: "Through a lady bird deed, Mom keeps her home and can sell it anytime, but at her death it goes to her son automatically." },
  { terms: ["remainder", "remainderman"], definition: "The future interest that takes effect after a life estate ends — and the person who holds it.", hypothetical: "Under the lady bird deed, the son is the remainderman who receives the house at his mother's death." },
  { terms: ["grantee"], definition: "The person receiving property in a deed.", hypothetical: "The relative named to receive the home on the deed is the grantee." },
  { terms: ["testamentary capacity"], definition: "Being of sound mind to make a will: knowing your property and heirs and that you're making a will.", hypothetical: "If the client understands what she owns and who her family is, she likely has testamentary capacity." },
  { terms: ["unauthorized practice of law", "upl"], definition: "A non-lawyer giving legal advice or doing work only a lawyer may do.", hypothetical: "If a clerk tells a client which option to choose for their will, that's unauthorized practice of law." },
  { terms: ["pour-over will"], definition: "A will that sends any leftover assets into the person's living trust at death.", hypothetical: "Assets Sam forgot to retitle into his trust are caught by his pour-over will." },
  { terms: ["conflicts of interest", "conflict of interest", "conflicts"], definition: "A situation where duties to one client or person clash with duties to another.", hypothetical: "Representing both spouses with very different wishes can create a conflict of interest." },
];

const GLOSSARY: Record<string, GlossaryEntry> = {};
for (const e of RAW) {
  const entry: GlossaryEntry = { term: e.terms[0], definition: e.definition, hypothetical: e.hypothetical };
  for (const t of e.terms) GLOSSARY[norm(t)] = entry;
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
