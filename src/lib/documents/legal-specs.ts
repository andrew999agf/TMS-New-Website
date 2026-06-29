import { EP } from "@/lib/intake/config";
import { FIELD_LABELS } from "./templates";
import { C, type DocSpec } from "./legal";

/**
 * The estate-planning document catalog, authored as professional legal HTML.
 * Bodies consume the structured intake answers (party lists with names and
 * addresses, specific gifts, residuary shares) via the build context's party /
 * partyOrder / residuary / gifts / has helpers, and read remaining values with
 * f / b / raw. Optional provisions are toggle-and-edit. Content is
 * attorney-reviewable scaffolding.
 */

const flds = (...tokens: string[]) => tokens.map((t) => ({ token: t, label: FIELD_LABELS[t] ?? t }));

const OPT_NO_BOND = { id: "noBond", label: "No Bond", defaultOn: true, text: "I direct that no bond or other security be required of any Executor or Trustee named in this Will." };
const OPT_INDEP = { id: "independent", label: "Independent Administration", defaultOn: true, text: "I direct that no action be had in the probate court in relation to the settlement of my estate other than the probating and recording of this Will and the return of any required inventory, appraisement, and list of claims, or an affidavit in lieu thereof." };
const OPT_NO_CONTEST = { id: "noContest", label: "No-Contest", defaultOn: false, text: "If any beneficiary under this Will contests or attacks this Will or any of its provisions, any share or interest given to that beneficiary is revoked and shall be disposed of as if that beneficiary had predeceased me without descendants." };
const OPT_TANGIBLE = { id: "tangible", label: "Tangible Personal Property Memorandum", defaultOn: false, text: "I may leave a written memorandum, separate from this Will, directing the disposition of items of tangible personal property. I direct my Executor to give effect to any such memorandum to the extent permitted by law." };

const TITLE = (t: string, subHtml: string) => `<h1 class="doc-title">${t}</h1><p class="doc-sub">${subHtml}</p><hr class="title-rule"/>`;
const ARTH = (h: string) => `<h2 class="article"><span class="art-h">${h}</span></h2>`;
const SELF_PROVING = (countyHtml: string) =>
  ARTH("Self-Proving Affidavit") +
  C.p(`Before me, the undersigned authority, on this day personally appeared the Testator and the witnesses, known to me to be the persons whose names are subscribed to the foregoing instrument, who each declared to me that the Testator executed the instrument as the Testator's last will, that the Testator did so willingly and was of sound mind, and that each witness signed in the presence of the Testator and of each other.`) +
  C.notary(countyHtml);

export const LEGAL_DOCS: DocSpec[] = [
  /* ---------------------------- Standard Will ---------------------------- */
  {
    id: "standard-will",
    label: "Last Will & Testament",
    footerName: "Last Will and Testament",
    trigger: { field: "docsWill", value: EP.WILL },
    fields: flds("testatorFullName", "testatorCounty", "maritalStatus", "spouseName", "children", "executors", "executorAlts", "guardians", "guardianAlts", "gifts", "residuary", "funeralWishes"),
    optionals: [OPT_NO_BOND, OPT_INDEP, OPT_NO_CONTEST, OPT_TANGIBLE],
    body: (c) => `
      ${TITLE("Last Will and Testament", `of ${c.f("testatorFullName")}`)}
      ${C.recital(`I, ${c.b("testatorFullName")}, a resident of ${c.f("testatorCounty")} County, Texas, being of sound and disposing mind and over the age of eighteen years, make, publish, and declare this to be my Last Will and Testament, and revoke all wills and codicils previously made by me.`)}
      ${C.article("I", "Family")}
      ${C.p(`My marital status is ${c.f("maritalStatus")}.${c.raw("spouseName") ? ` My spouse is ${c.f("spouseName")}.` : ""} My children are:`)}
      ${C.p(c.f("children"))}
      ${C.article("II", "Executor")}
      ${C.p(`I appoint ${c.party("executors")} as Independent Executor of my estate.${c.has("executorAlts") ? ` If that person fails or ceases to serve, I appoint ${c.partyOrder("executorAlts")}, to serve in that order.` : ""}`)}
      ${c.opt("noBond")}${c.opt("independent")}
      ${c.has("guardians") ? C.article("III", "Guardian of Minor Children") + C.p(`If at my death any of my children are minors, I appoint ${c.party("guardians")} as guardian of the person of my minor children${c.has("guardianAlts") ? `, and if that person cannot serve, ${c.partyOrder("guardianAlts")}` : ""}.`) : ""}
      ${c.has("gifts") ? C.article("IV", "Specific Gifts") + c.gifts("gifts") + c.opt("tangible") : ""}
      ${C.article("V", "Residuary Estate")}
      ${C.p(`I give all the rest, residue, and remainder of my estate ${c.residuary("residuary")}. If any residuary beneficiary does not survive me, that beneficiary's share shall pass to the surviving residuary beneficiaries in proportion to their respective shares.`)}
      ${c.raw("funeralWishes") ? C.article("VI", "Funeral and Burial") + C.p(c.f("funeralWishes")) : ""}
      ${c.opt("noContest")}
      ${C.spacer()}${C.p(`IN WITNESS WHEREOF, I have signed this Will on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Testator")}
      ${ARTH("Attestation")}${C.witnesses()}
      ${SELF_PROVING(c.f("testatorCounty"))}`,
  },

  /* ------------------- Standard Will with Minor's Trust ------------------ */
  {
    id: "will-minor-trust",
    label: "Will with Minor's Trust",
    footerName: "Last Will and Testament (with Minor's Trust)",
    fields: flds("testatorFullName", "testatorCounty", "maritalStatus", "spouseName", "children", "executors", "executorAlts", "guardians", "guardianAlts", "residuary", "minorTrustees", "minorTrustAge"),
    optionals: [OPT_NO_BOND, OPT_INDEP, OPT_NO_CONTEST],
    body: (c) => `
      ${TITLE("Last Will and Testament", `of ${c.f("testatorFullName")}`)}
      ${C.recital(`I, ${c.b("testatorFullName")}, a resident of ${c.f("testatorCounty")} County, Texas, being of sound and disposing mind, make, publish, and declare this to be my Last Will and Testament, and revoke all prior wills and codicils.`)}
      ${C.article("I", "Family")}
      ${C.p(`My marital status is ${c.f("maritalStatus")}.${c.raw("spouseName") ? ` My spouse is ${c.f("spouseName")}.` : ""} My children are:`)}
      ${C.p(c.f("children"))}
      ${C.article("II", "Executor")}
      ${C.p(`I appoint ${c.party("executors")} as Independent Executor.${c.has("executorAlts") ? ` If that person cannot serve, I appoint ${c.partyOrder("executorAlts")}.` : ""}`)}
      ${c.opt("noBond")}${c.opt("independent")}
      ${c.has("guardians") ? C.article("III", "Guardian of Minor Children") + C.p(`I appoint ${c.party("guardians")} as guardian of the person of my minor children${c.has("guardianAlts") ? `, and if that person cannot serve, ${c.partyOrder("guardianAlts")}` : ""}.`) : ""}
      ${C.article("IV", "Residuary Estate and Minor's Trust")}
      ${C.section("Gift", `I give the residue of my estate ${c.residuary("residuary")}.`)}
      ${C.section("Minor's Trust", `Notwithstanding the foregoing, any share passing to a beneficiary who has not reached the age stated below shall not be distributed outright but shall be held in a separate trust under this Article.`)}
      ${C.section("Trustee", `I appoint ${c.party("minorTrustees")} as Trustee of each trust created under this Article, to serve without bond and with all powers granted to a trustee under the Texas Trust Code.`)}
      ${C.section("Distribution", `The Trustee shall distribute as much of the net income and principal as the Trustee deems necessary for the beneficiary's health, education, maintenance, and support, and shall distribute the remaining principal ${c.raw("minorTrustAge") ? `as follows: ${c.f("minorTrustAge")}` : `when the beneficiary reaches the age I have specified`}.`)}
      ${C.section("Spendthrift", `No beneficiary may assign, and no creditor may reach, any interest in a trust before it is actually distributed.`)}
      ${c.opt("noContest")}
      ${C.spacer()}${C.p(`IN WITNESS WHEREOF, I have signed this Will on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Testator")}
      ${ARTH("Attestation")}${C.witnesses()}
      ${SELF_PROVING(c.f("testatorCounty"))}`,
  },

  /* --------------------------- Living Trust ------------------------------ */
  {
    id: "living-trust",
    label: "Revocable Living Trust",
    footerName: "Revocable Living Trust Agreement",
    trigger: { field: "docsTrust", value: EP.LIVING_TRUST },
    fields: flds("testatorFullName", "testatorAddress", "testatorCounty", "trusteeAlts", "trustBeneficiaries", "trustFunding"),
    optionals: [
      { id: "incapacity", label: "Incapacity", defaultOn: true, text: "If I become incapacitated, my Successor Trustee shall manage the Trust for my benefit, applying income and principal for my health, support, and maintenance, without the need for any guardianship of my estate." },
      { id: "homestead", label: "Homestead", defaultOn: false, text: "Any residence held in this Trust shall remain my homestead, and I retain the right to occupy it rent-free for life; this Trust is a qualifying trust under Section 41.0021 of the Texas Property Code." },
    ],
    body: (c) => `
      ${TITLE("Revocable Living Trust Agreement", `of ${c.f("testatorFullName")}`)}
      ${C.recital(`This Trust Agreement is made by ${c.b("testatorFullName")}, of ${c.f("testatorAddress")} (the "Trustor" and initial "Trustee"). The Trustor transfers to the Trust the property described on Exhibit A, to be held, administered, and distributed as provided herein.`)}
      ${C.article("I", "Administration During Life")}
      ${C.section("Revocable", `The Trustor may amend or revoke this Trust, in whole or in part, at any time by written instrument, and shall receive the net income of the Trust during the Trustor's life.`)}
      ${c.opt("incapacity")}${c.opt("homestead")}
      ${C.article("II", "Successor Trustee")}
      ${C.p(`Upon the Trustor's incapacity or death, ${c.partyOrder("trusteeAlts")} shall serve as Successor Trustee, to serve without bond and with all powers granted to a trustee under the Texas Trust Code.`)}
      ${C.article("III", "Disposition at Death")}
      ${C.section("Irrevocable", `This Trust becomes irrevocable upon the Trustor's death.`)}
      ${C.section("Beneficiaries", `After the Trustor's death, the Trustee shall distribute the Trust estate ${c.residuary("trustBeneficiaries")}.`)}
      ${C.article("IV", "Trust Property (Exhibit A)")}
      ${C.p(c.f("trustFunding"))}
      ${C.spacer()}${C.p(`This Trust is governed by Texas law. Executed on ____________________.`)}
      <div class="two-col">${C.sign(c.f("testatorFullName"), "Trustor")}${C.sign(c.f("testatorFullName"), "Trustee")}</div>
      ${C.notary(c.f("testatorCounty"))}`,
  },

  /* ------------------------- Testamentary Trust -------------------------- */
  {
    id: "testamentary-trust",
    label: "Testamentary Trust (in will)",
    footerName: "Testamentary Trust Provisions",
    trigger: { field: "docsTrust", value: EP.TEST_TRUST },
    fields: flds("testatorFullName", "trustees", "trusteeAlts", "trustBeneficiaries", "trustDistribution"),
    optionals: [
      { id: "spendthrift", label: "Spendthrift", defaultOn: true, text: "Each trust created under these provisions is a spendthrift trust; no beneficiary may assign, and no creditor may reach, an interest before it is distributed." },
      { id: "perpetuities", label: "Rule Against Perpetuities", defaultOn: true, text: "Notwithstanding anything to the contrary, each trust shall terminate no later than the period permitted under the Texas rule against perpetuities, whereupon the Trustee shall distribute the remaining property to the then-living descendants, per stirpes, of the beneficiary for whom the trust is named." },
    ],
    body: (c) => `
      ${TITLE("Testamentary Trust Provisions", `to be included in the Will of ${c.f("testatorFullName")}`)}
      ${C.p(`On my death, the share of my estate passing to a beneficiary named below shall be held in a separate trust rather than distributed outright.`)}
      ${C.article("I", "Trustee")}
      ${C.p(`I appoint ${c.party("trustees")} as Trustee${c.has("trusteeAlts") ? `, and if that person cannot serve, ${c.partyOrder("trusteeAlts")}` : ""}, to serve without bond and with all powers granted to a trustee under the Texas Trust Code.`)}
      ${C.article("II", "Beneficiaries")}
      ${C.p(`The trust estate shall be administered for, and distributed ${c.residuary("trustBeneficiaries")}.`)}
      ${C.article("III", "Distributions")}
      ${C.p(`The Trustee shall distribute income and principal for each beneficiary's health, education, maintenance, and support. Manner of distribution: ${c.f("trustDistribution")}. On a beneficiary's death, the remaining trust shall pass per stirpes to that beneficiary's descendants.`)}
      ${c.opt("spendthrift")}${c.opt("perpetuities")}`,
  },

  /* ----------------------- Financial (Durable) POA ----------------------- */
  {
    id: "financial-poa",
    label: "Statutory Durable (Financial) POA",
    footerName: "Statutory Durable Power of Attorney",
    trigger: { field: "docsPoa", value: EP.FIN_POA },
    fields: flds("testatorFullName", "testatorAddress", "testatorCounty", "finAgents", "finActing", "finAlts", "finEffective", "finPowers", "finGifts"),
    optionals: [
      { id: "hotpowers", label: "Hot Powers Granted", defaultOn: false, text: "I specifically grant my agent authority to create or change rights of survivorship and beneficiary designations, and to create, amend, or revoke an inter vivos trust, subject to Section 751.032 of the Texas Estates Code." },
    ],
    body: (c) => `
      ${TITLE("Statutory Durable Power of Attorney", `of ${c.f("testatorFullName")}`)}
      ${C.p(`NOTICE: THE POWERS GRANTED BY THIS DOCUMENT ARE BROAD AND SWEEPING. THEY ARE EXPLAINED IN THE DURABLE POWER OF ATTORNEY ACT, SUBTITLE P, TITLE 2, TEXAS ESTATES CODE. THIS DOCUMENT DOES NOT AUTHORIZE ANYONE TO MAKE HEALTH-CARE DECISIONS FOR YOU.`)}
      ${C.article("I", "Designation of Agent")}
      ${C.p(`I, ${c.b("testatorFullName")}, of ${c.f("testatorAddress")}, appoint ${c.party("finAgents")} as my agent (attorney-in-fact).${c.raw("finActing") ? ` If more than one agent is named, my agents may act: ${c.f("finActing")}.` : ""}${c.has("finAlts") ? ` If an agent is unable or unwilling to serve, I appoint ${c.partyOrder("finAlts")}, in that order.` : ""}`)}
      ${C.article("II", "Grant of Authority")}
      ${C.p(`I grant my agent authority with respect to the following powers under the Texas statutory durable power of attorney: ${c.f("finPowers")}.`)}
      ${C.section("Gifts", `Gift-giving authority: ${c.f("finGifts")}.`)}
      ${c.opt("hotpowers")}
      ${C.article("III", "Effective Date and Durability")}
      ${C.p(`This power of attorney is effective ${c.f("finEffective")} and is durable; it is not affected by my subsequent disability or incapacity. I revoke any prior financial power of attorney.`)}
      ${C.spacer()}${C.p(`Signed on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Principal")}
      ${C.notary(c.f("testatorCounty"))}`,
  },

  /* --------------------------- Medical POA ------------------------------- */
  {
    id: "medical-poa",
    label: "Medical Power of Attorney",
    footerName: "Medical Power of Attorney",
    trigger: { field: "docsPoa", value: EP.MED_POA },
    fields: flds("testatorFullName", "testatorAddress", "testatorCounty", "medAgents", "medAlts", "medLimits"),
    optionals: [],
    body: (c) => `
      ${TITLE("Medical Power of Attorney", `Designation of Health Care Agent by ${c.f("testatorFullName")}`)}
      ${C.article("I", "Designation of Agent")}
      ${C.p(`I, ${c.b("testatorFullName")}, of ${c.f("testatorAddress")}, appoint ${c.party("medAgents")} as my agent to make any and all health-care decisions for me, except to the extent I state otherwise, when my attending physician certifies in writing that I am unable to make such decisions.${c.has("medAlts") ? ` If my agent is unable or unwilling to serve, I appoint ${c.partyOrder("medAlts")}.` : ""}`)}
      ${C.article("II", "Limitations")}
      ${C.p(`Limitations on my agent's authority: ${c.f("medLimits")}.`)}
      ${C.article("III", "Effect and Duration")}
      ${C.p(`This medical power of attorney takes effect upon my attending physician's certification of my incapacity and continues until I revoke it. I revoke any prior medical power of attorney. This document is not valid unless signed before a notary public or in the presence of two qualified witnesses.`)}
      ${C.spacer()}${C.p(`Signed on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Principal")}
      ${C.witnesses()}
      ${C.notary(c.f("testatorCounty"))}`,
  },

  /* --------------------- Directive to Physicians ------------------------- */
  {
    id: "directive",
    label: "Directive to Physicians",
    footerName: "Directive to Physicians",
    trigger: { field: "docsPoa", value: EP.DIRECTIVE },
    fields: flds("testatorFullName", "testatorAddress", "lifeSupport"),
    optionals: [],
    body: (c) => `
      ${TITLE("Directive to Physicians and Family or Surrogates", `of ${c.f("testatorFullName")}`)}
      ${C.p(`I, ${c.b("testatorFullName")}, of ${c.f("testatorAddress")}, make this Directive regarding my medical care if I have a terminal or irreversible condition, and willfully and voluntarily make known my wishes.`)}
      ${C.article("I", "My Wishes")}
      ${C.p(c.f("lifeSupport"))}
      ${C.article("II", "Execution")}
      ${C.p(`This Directive is signed in the presence of two qualified witnesses or acknowledged before a notary public.`)}
      ${C.spacer()}${C.p(`Signed on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Declarant")}
      ${C.witnesses()}`,
  },

  /* ----------------------- HIPAA Authorization --------------------------- */
  {
    id: "hipaa",
    label: "HIPAA Authorization",
    footerName: "HIPAA Authorization",
    trigger: { field: "docsPoa", value: EP.HIPAA },
    fields: flds("testatorFullName", "hipaaPeople"),
    optionals: [],
    body: (c) => `
      ${TITLE("Authorization for Release of Protected Health Information", `under HIPAA — ${c.f("testatorFullName")}`)}
      ${C.p(`I, ${c.b("testatorFullName")}, authorize all health-care providers, plans, and clearinghouses to use and disclose my protected health information to the following persons: ${c.party("hipaaPeople")}.`)}
      ${C.article("I", "Scope and Duration")}
      ${C.p(`This authorization applies to all of my protected health information and remains in effect until I revoke it in writing. It is made under the HIPAA Privacy Rule, 45 C.F.R. § 164.508. A photocopy or electronic copy is as valid as the original.`)}
      ${C.spacer()}${C.p(`Signed on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Patient")}`,
  },

  /* --------------------- Declaration of Guardian ------------------------- */
  {
    id: "declaration-of-guardian",
    label: "Declaration of Guardian",
    footerName: "Declaration of Guardian",
    trigger: { field: "docsOther", value: EP.GUARDIAN_DECL },
    fields: flds("testatorFullName", "testatorCounty", "guardianPreferred", "guardianExcluded"),
    optionals: [],
    body: (c) => `
      ${TITLE("Declaration of Guardian in the Event of Later Incapacity or Need of Guardian", `of ${c.f("testatorFullName")}`)}
      ${C.p(`I, ${c.b("testatorFullName")}, a resident of ${c.f("testatorCounty")} County, Texas, make this Declaration in the event a guardian is ever needed for me or my estate.`)}
      ${C.article("I", "Designation")}
      ${C.p(`I designate the following, in the order named, to serve as my guardian: ${c.partyOrder("guardianPreferred")}.`)}
      ${C.article("II", "Disqualification")}
      ${C.p(`I expressly disqualify the following persons from serving as my guardian, and no court may appoint them: ${c.party("guardianExcluded")}.`)}
      ${C.article("III", "Execution")}
      ${C.p(`This Declaration is signed in the presence of two witnesses or made self-proved before a notary public.`)}
      ${C.spacer()}${C.p(`Signed on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Declarant")}
      ${C.witnesses()}
      ${C.notary(c.f("testatorCounty"))}`,
  },

  /* ------------------------- Lady Bird Deed ------------------------------ */
  {
    id: "lady-bird-deed",
    label: "Lady Bird / TOD Deed",
    footerName: "Enhanced Life Estate (Lady Bird) Deed",
    trigger: { field: "docsOther", value: EP.LADYBIRD },
    fields: flds("testatorFullName", "testatorAddress", "deedProperty", "deedGrantee"),
    optionals: [],
    body: (c) => `
      ${TITLE("Enhanced Life Estate Deed", "(Lady Bird Deed)")}
      ${C.p(`<strong>NOTICE OF CONFIDENTIALITY RIGHTS:</strong> IF YOU ARE A NATURAL PERSON, YOU MAY REMOVE OR STRIKE ANY OF THE FOLLOWING INFORMATION FROM THIS INSTRUMENT BEFORE IT IS FILED FOR RECORD: YOUR SOCIAL SECURITY NUMBER OR YOUR DRIVER'S LICENSE NUMBER.`)}
      ${C.section("Grantor", `${c.b("testatorFullName")}, of ${c.f("testatorAddress")}.`)}
      ${C.section("Grantee", `${c.party("deedGrantee")}.`)}
      ${C.section("Consideration", `Ten Dollars ($10.00) and other good and valuable consideration.`)}
      ${C.section("Property", `${c.f("deedProperty")}.`)}
      ${C.article("I", "Reservation of Enhanced Life Estate")}
      ${C.p(`Grantor reserves a life estate together with the full power, during Grantor's lifetime, to sell, convey, lease, mortgage, gift, or otherwise dispose of the property, and to cancel this deed by further conveyance, all without the joinder or consent of the Grantee. Upon the death of the Grantor, if the property has not been previously conveyed, all right and title shall vest in the Grantee.`)}
      ${C.spacer()}${C.p(`This instrument was prepared from information furnished by the parties; no title examination was performed. Executed on ____________________.`)}
      ${C.sign(c.f("testatorFullName"), "Grantor")}
      ${C.notary("____________")}`,
  },
];

/** Server-side lookup by id (keeps the body builder server-side). */
export function getDocSpec(id: string): DocSpec | undefined {
  return LEGAL_DOCS.find((d) => d.id === id);
}

/** Lightweight, serializable metadata for client components (no body fns). */
export const LEGAL_DOC_META = LEGAL_DOCS.map((d) => ({
  id: d.id,
  label: d.label,
  trigger: d.trigger ?? null,
  fields: d.fields,
  optionals: d.optionals.map((o) => ({ id: o.id, label: o.label, text: o.text, defaultOn: o.defaultOn })),
}));

export type DocMetaLite = (typeof LEGAL_DOC_META)[number];
