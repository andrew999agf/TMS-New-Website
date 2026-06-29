import { EP } from "@/lib/intake/config";

/**
 * Document generator — bridges estate-planning intake answers to draftable
 * documents. Each template body contains {{fieldName}} merge tokens that map
 * directly to intake answer keys. When an answer is present it is substituted;
 * when it is blank, a labeled placeholder like [ Executor ] is inserted so the
 * attorney can see exactly what still needs filling. A template is "offered"
 * for a submission when the client checked the matching document at intake
 * (the `trigger`). These are drafting scaffolds for attorney review, not final
 * documents.
 */

export type DocTemplate = {
  id: string;
  label: string;
  /** Offered when this intake checklist field contains this option. */
  trigger: { field: string; value: string };
  body: string;
};

/** Human labels for merge tokens, used when an answer is blank. */
export const FIELD_LABELS: Record<string, string> = {
  testatorFullName: "Full legal name",
  testatorAddress: "Residence address",
  testatorCounty: "County of residence",
  testatorDob: "Date of birth",
  maritalStatus: "Marital status",
  spouseName: "Spouse's full legal name",
  children: "Children",
  executor: "Executor",
  executorAlt1: "First alternate executor",
  executorAlt2: "Second alternate executor",
  guardianMinor: "Guardian for minor children",
  guardianMinorAlt: "Alternate guardian",
  specificGifts: "Specific gifts",
  residuaryBeneficiary: "Residuary beneficiary",
  residuaryAlternate: "Alternate residuary beneficiary",
  funeralWishes: "Funeral / burial wishes",
  trustee: "Trustee",
  successorTrustee: "Successor trustee",
  trustBeneficiaries: "Trust beneficiaries",
  trustDistribution: "Distribution method",
  trustAges: "Distribution ages",
  trustFunding: "Assets funding the trust",
  finAgent: "Agent (attorney-in-fact)",
  finAgentAlt: "Alternate agent",
  finEffective: "When it takes effect",
  finScope: "Scope of authority",
  finScopeLimits: "Limited powers",
  finGifts: "Gift-giving power",
  medAgent: "Health-care agent",
  medAgentAlt: "Alternate health-care agent",
  medLimits: "Limits on agent's authority",
  lifeSupport: "Life-support wishes",
  hipaaRecipients: "HIPAA recipients",
  guardianPreferred: "Preferred guardian(s)",
  guardianExcluded: "Persons excluded as guardian",
  deedProperty: "Property (address / legal description)",
  deedGrantee: "Grantee (who receives the property)",
};

const WILL = `LAST WILL AND TESTAMENT OF {{testatorFullName}}

I, {{testatorFullName}}, a resident of {{testatorCounty}} County, Texas, being of sound mind, declare this to be my Last Will and Testament, and revoke all prior wills and codicils.

ARTICLE I — FAMILY
My marital status is {{maritalStatus}}. My spouse is {{spouseName}}. My children are:
{{children}}

ARTICLE II — EXECUTOR
I appoint {{executor}} as Independent Executor of my estate, to serve without bond. If they cannot serve, I appoint {{executorAlt1}}, and then {{executorAlt2}}. No action shall be required in the probate court other than the probating and recording of this will and the return of any required inventory, appraisement, and list of claims.

ARTICLE III — GUARDIAN
If a guardian is needed for my minor children, I appoint {{guardianMinor}}, and if they cannot serve, {{guardianMinorAlt}}.

ARTICLE IV — SPECIFIC GIFTS
I make the following specific gifts:
{{specificGifts}}

ARTICLE V — RESIDUARY ESTATE
I give all the rest, residue, and remainder of my estate to {{residuaryBeneficiary}}. If they do not survive me, then to {{residuaryAlternate}}.

ARTICLE VI — FUNERAL WISHES
{{funeralWishes}}

Signed on ____________________, at {{testatorCounty}} County, Texas.


_______________________________
{{testatorFullName}}, Testator

[Attestation by two witnesses and self-proving affidavit before a notary to be attached.]`;

const TESTAMENTARY_TRUST = `TESTAMENTARY TRUST PROVISIONS (to be included in the Will of {{testatorFullName}})

On my death, the share passing to a beneficiary below shall be held in a separate trust rather than distributed outright.

TRUSTEE: {{trustee}}. SUCCESSOR TRUSTEE: {{successorTrustee}}, to serve without bond, with all powers granted to a trustee under the Texas Trust Code.

BENEFICIARIES: {{trustBeneficiaries}}

DISTRIBUTIONS: The Trustee shall distribute income and principal for the beneficiary's health, education, maintenance, and support. Distribution method: {{trustDistribution}} {{trustAges}}. Each trust is a spendthrift trust. On a beneficiary's death, the remaining trust passes per stirpes to that beneficiary's descendants.

[Full trustee powers, perpetuities savings clause, and administrative provisions to be inserted from the firm precedent.]`;

const LIVING_TRUST = `{{testatorFullName}} REVOCABLE LIVING TRUST — TRUST AGREEMENT

This Declaration is made by {{testatorFullName}}, of {{testatorAddress}} ("Trustor" and initial "Trustee"). The Trustor transfers to the Trust the property listed on Exhibit A.

FUNDING (Exhibit A): {{trustFunding}}

ADMINISTRATION DURING LIFE: The Trustor may amend or revoke this Trust at any time and shall receive the net income during life. On the Trustor's incapacity or death, {{successorTrustee}} shall serve as Successor Trustee.

BENEFICIARIES: During the Trustor's life, the Trustor. Thereafter: {{trustBeneficiaries}}. Distribution method: {{trustDistribution}} {{trustAges}}.

This Trust becomes irrevocable on the Trustor's death. Governed by Texas law. Signed before a notary.

[A pour-over will should accompany this trust. Full trustee powers and administrative provisions to be inserted from the firm precedent.]`;

const FINANCIAL_POA = `STATUTORY DURABLE POWER OF ATTORNEY

NOTICE: THE POWERS GRANTED BY THIS DOCUMENT ARE BROAD AND SWEEPING. THIS DOCUMENT DOES NOT AUTHORIZE ANYONE TO MAKE HEALTH-CARE DECISIONS FOR YOU.

I, {{testatorFullName}}, of {{testatorAddress}}, appoint {{finAgent}} as my agent (attorney-in-fact). If my agent cannot serve, I appoint {{finAgentAlt}}.

GRANT OF AUTHORITY: {{finScope}}. {{finScopeLimits}}

GIFT POWER: {{finGifts}}

EFFECTIVE: {{finEffective}}.

This power of attorney is durable and is not affected by my later disability or incapacity except as stated above. I revoke any prior financial power of attorney.

Signed on ____________________.

_______________________________
{{testatorFullName}}, Principal

State of Texas, County of {{testatorCounty}} — acknowledged before a notary public.`;

const MEDICAL_POA = `MEDICAL POWER OF ATTORNEY — DESIGNATION OF HEALTH CARE AGENT

I, {{testatorFullName}}, of {{testatorAddress}}, appoint {{medAgent}} as my agent to make any and all health-care decisions for me when I am unable to do so, as certified in writing by my attending physician. If my agent cannot serve, I appoint {{medAgentAlt}}.

LIMITATIONS ON MY AGENT'S AUTHORITY: {{medLimits}}

By law my agent may not consent to voluntary inpatient mental-health services, convulsive treatment, psychosurgery, or abortion. I revoke any prior medical power of attorney.

THIS POWER OF ATTORNEY IS NOT VALID UNLESS SIGNED BEFORE A NOTARY PUBLIC OR IN THE PRESENCE OF TWO COMPETENT ADULT WITNESSES.

Signed on ____________________ at {{testatorCounty}} County, Texas.

_______________________________
{{testatorFullName}}, Principal

[Statutory disclosure statement to be attached.]`;

const DIRECTIVE = `DIRECTIVE TO PHYSICIANS AND FAMILY OR SURROGATES (LIVING WILL)

I, {{testatorFullName}}, of {{testatorAddress}}, make this Directive regarding my care if I have a terminal or irreversible condition.

MY WISHES: {{lifeSupport}}

This Directive is signed in the presence of two qualified witnesses or before a notary.

Signed on ____________________.

_______________________________
{{testatorFullName}}`;

const HIPAA = `HIPAA AUTHORIZATION FOR RELEASE OF PROTECTED HEALTH INFORMATION

I, {{testatorFullName}}, authorize my health-care providers to disclose my protected health information to the following persons:
{{hipaaRecipients}}

This authorization is made under the HIPAA Privacy Rule (45 CFR 164.508). It remains in effect until revoked in writing by me.

Signed on ____________________.

_______________________________
{{testatorFullName}}`;

const DECLARATION_OF_GUARDIAN = `DECLARATION OF GUARDIAN IN THE EVENT OF LATER INCAPACITY OR NEED OF GUARDIAN

I, {{testatorFullName}}, of {{testatorCounty}} County, Texas, make this Declaration.

If a guardian is ever needed for me, I designate the following, in order of preference:
{{guardianPreferred}}

I expressly DISQUALIFY the following persons from serving as my guardian:
{{guardianExcluded}}

This Declaration is signed before two witnesses or made self-proved before a notary.

Signed on ____________________.

_______________________________
{{testatorFullName}}`;

const LADY_BIRD_DEED = `ENHANCED LIFE ESTATE DEED (LADY BIRD DEED)

NOTICE OF CONFIDENTIALITY RIGHTS: IF YOU ARE A NATURAL PERSON, YOU MAY REMOVE OR STRIKE ANY OR ALL OF THE FOLLOWING INFORMATION FROM ANY INSTRUMENT THAT TRANSFERS AN INTEREST IN REAL PROPERTY BEFORE IT IS FILED FOR RECORD: YOUR SOCIAL SECURITY NUMBER OR YOUR DRIVER'S LICENSE NUMBER.

Grantor: {{testatorFullName}}, of {{testatorAddress}}.
Grantee: {{deedGrantee}}.
Consideration: Ten Dollars ($10.00) and other good and valuable consideration.

Property: {{deedProperty}}

Grantor reserves a life estate together with the full power, during Grantor's lifetime, to sell, lease, mortgage, gift, or otherwise dispose of the property, and to cancel this deed by further conveyance, all without the consent of the Grantee. On the Grantor's death, if not previously disposed of, all remaining title vests in the Grantee.

Signed on ____________________, and acknowledged before a notary; to be recorded in the real-property records of the county where the property is located.

_______________________________
{{testatorFullName}}, Grantor`;

export const TEMPLATES: DocTemplate[] = [
  { id: "standard-will", label: "Last Will & Testament", trigger: { field: "docsWill", value: EP.WILL }, body: WILL },
  { id: "testamentary-trust", label: "Testamentary Trust (in will)", trigger: { field: "docsTrust", value: EP.TEST_TRUST }, body: TESTAMENTARY_TRUST },
  { id: "living-trust", label: "Revocable Living Trust", trigger: { field: "docsTrust", value: EP.LIVING_TRUST }, body: LIVING_TRUST },
  { id: "financial-poa", label: "Statutory Durable (Financial) POA", trigger: { field: "docsPoa", value: EP.FIN_POA }, body: FINANCIAL_POA },
  { id: "medical-poa", label: "Medical Power of Attorney", trigger: { field: "docsPoa", value: EP.MED_POA }, body: MEDICAL_POA },
  { id: "directive", label: "Directive to Physicians", trigger: { field: "docsPoa", value: EP.DIRECTIVE }, body: DIRECTIVE },
  { id: "hipaa", label: "HIPAA Authorization", trigger: { field: "docsPoa", value: EP.HIPAA }, body: HIPAA },
  { id: "declaration-of-guardian", label: "Declaration of Guardian", trigger: { field: "docsOther", value: EP.GUARDIAN_DECL }, body: DECLARATION_OF_GUARDIAN },
  { id: "lady-bird-deed", label: "Lady Bird / TOD Deed", trigger: { field: "docsOther", value: EP.LADYBIRD }, body: LADY_BIRD_DEED },
];

/** Lightweight metadata (no bodies) safe to pass to client components. */
export const DOC_META = TEMPLATES.map((t) => ({ id: t.id, label: t.label, trigger: t.trigger }));

export function getTemplate(id: string): DocTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Does a submission's answers request this template? */
export function answersTrigger(trigger: DocTemplate["trigger"], answers: Record<string, unknown>): boolean {
  const v = answers[trigger.field];
  const arr = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  return arr.includes(trigger.value);
}

/** Fill a template body from answers; returns the draft text and the blank fields. */
export function fillTemplate(body: string, answers: Record<string, unknown>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = answers[key];
    const s = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v).trim();
    if (!s) {
      if (!missing.includes(key)) missing.push(key);
      return `[ ${FIELD_LABELS[key] ?? key} ]`;
    }
    return s;
  });
  return { text, missing };
}
