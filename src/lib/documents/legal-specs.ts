import { EP } from "@/lib/intake/config";
import { FIELD_LABELS } from "./templates";
import { C, buildArticles, type DocBuildCtx, type DocSpec } from "./legal";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bold = (s: string) => `<strong>${esc(s)}</strong>`;
const andList = (xs: string[]): string =>
  xs.length <= 1 ? xs[0] ?? "" : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;

/** Discretionary powers of executor — Article VIII boilerplate (verbatim). */
const DISCRETIONARY =
  C.p(`The Executor(s) shall have and may exercise the following discretionary powers in addition to any common law or statutory powers without the necessity of court license or approval:`) +
  C.ol([
    `To retain for whatever period the Executor deems advisable any property, including property owned by me at my death, and to invest and reinvest in any property, both real and personal, regardless of whether any particular investment would be proper for Executor and regardless of the extent of diversification of the assets held hereunder.`,
    `To sell and to grant options to purchase all or any part of my estate, both real and personal, at any time, at public or private sale, for consideration, whether or not the highest possible consideration, and upon terms, including credit, as the Executor(s) deems advisable, and to execute, acknowledge, and deliver deeds or other instruments in connection therewith.`,
    `To lease any real estate, including mineral interests, for terms and conditions as the Executor(s) deems advisable, including the granting of options to renew, options to extend the term or terms, and options to purchase.`,
    `To pay, compromise, settle or otherwise adjust any claims, including taxes, asserted in favor of or against me, my estate or Executor(s).`,
    `To make any separation into shares in whole or in part in kind and at values determined by Executor(s), with or without regard to tax basis, and to allocate different kinds and disproportionate amounts of property and undivided interests in property among the shares.`,
    `To make such elections under the tax laws as the Executor(s) shall deem appropriate, including elections with respect to qualified terminable interest property, exemptions and the use of deductions as income tax or estate tax deductions, and to determine whether to make any adjustments between income and principal on account of any election so made.`,
    `To make any elections permitted under any pension, profit sharing, employee stock ownership or other benefit plan.`,
    `To employ others in connection with the administration of my estate, including legal counsel, investment advisors, brokers, accountants and agents and to pay reasonable compensation if necessary.`,
    `To vote any shares of stock or other securities in person or by proxy; to assert or waive any stockholder's rights or privilege to subscribe for or otherwise acquire additional stock; to deposit securities in any voting trust or with any committee.`,
    `To borrow and to pledge or mortgage any property as collateral, and to make secured or unsecured loans. The Executor(s) are specifically authorized to make loans without interest to any beneficiary hereunder. No individual or entity loaning property to the Executor or trustee shall be held to see to the application of such property.`,
    `The Executor(s) shall also in their absolute discretion determine the allocation of any GST exemption available to me at my death to property passing under this Will or otherwise. The determination of the Executor(s) with respect to any elections or allocation, if made or taken in good faith, shall be binding upon all affected.`,
  ]);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (d: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = d % 100;
  return `${d}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
/** Parse a YYYY-MM-DD execution date into day/month/year phrasing, or null. */
function execDate(raw: string): { day: string; month: string; yy: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw || "").trim());
  if (!m) return null;
  return { day: ordinal(parseInt(m[3], 10)), month: MONTHS[parseInt(m[2], 10) - 1] ?? "", yy: m[1].slice(2) };
}

/** A neat witness block: name + contact (filled when known, else placeholder) + signature line. */
function witnessBlock(p?: { name: string; address: string }): string {
  const nm = p?.name ? esc(p.name) : `<span class="ph">[ Witness Name ]</span>`;
  const addr = p?.address ? esc(p.address) : "";
  return `<div class="wit">
    <div class="wit-row"><span class="wit-label">Witness Name:</span><span class="wit-line" style="border:0">${nm}</span></div>
    <div class="wit-row"><span class="wit-label">Signature:</span><span class="wit-line"></span></div>
    <div class="wit-row"><span class="wit-label">Address:</span><span class="wit-line"${addr ? ' style="border:0"' : ""}>${addr}</span></div>
  </div>`;
}

/** The "STATE OF TEXAS / COUNTY OF ___ §" jurat caption. */
function jurat(countyHtml: string): string {
  return `<div class="jurat">
    <div class="j-row"><span class="j-left">STATE OF TEXAS</span>&sect;</div>
    <div class="j-row"><span class="j-left">&nbsp;</span>&sect;</div>
    <div class="j-row"><span class="j-left">COUNTY OF ${countyHtml}</span>&sect;</div>
  </div>`;
}

/** Flush-left bold caption used for the statutory section labels (e.g. "DURATION."). */
const POAH = (t: string) => `<p class="body" style="text-indent:0;font-weight:bold;margin:11px 0 4px">${esc(t)}</p>`;

/** One blank ruled line (for fill-in-by-hand fields). */
const blankLine = `<div class="addr-line" style="margin:14px 0"></div>`;

/** A labeled "Name / Address / Phone" block; each value is printed in bold when
 *  provided, otherwise a ruled blank line is left to complete by hand. */
function poaContact(p: { name?: string; address?: string; phone?: string } | undefined, opts: { phone?: boolean } = {}): string {
  const row = (label: string, val?: string) => {
    const filled = (val ?? "").trim();
    return `<div class="wit-row"><span class="wit-label">${label}</span><span class="wit-line"${filled ? ' style="border:0"' : ""}>${filled ? bold(filled) : ""}</span></div>`;
  };
  return `<div class="wit">${row("Name:", p?.name)}${row("Address:", p?.address)}${opts.phone === false ? "" : row("Phone:", p?.phone)}</div>`;
}

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth"];

/** Execution, witness attestation, self-proving affidavit, and notary blocks. Witness
 *  names, contact info, and the execution date are inserted when provided, else blank. */
function executionBlocks(c: DocBuildCtx): string {
  const name = c.b("testatorFullName");
  const ARTH = (h: string) => `<h2 class="article"><span class="art-h">${esc(h)}</span></h2>`;
  const wit = c.persons("witnesses");
  const witNames = wit.map((w) => bold(w.name));
  // "Joe, the Testator, and Bob and Tim, the witnesses"
  const partiesPhrase = `${name}, the Testator${witNames.length ? `, and ${andList(witNames)}, the witnesses` : " and the witnesses"}`;
  const inPresenceOf = witNames.length ? andList(witNames) : "the undersigned attesting witnesses";
  // Execution date pieces: filled if a date was given, otherwise blanks.
  const d = execDate(c.raw("executionDate"));
  const day = d ? `<strong>${d.day}</strong>` : "______";
  const month = d ? `<strong>${esc(d.month)}</strong>` : "____________________";
  const yy = d ? `<strong>${esc(d.yy)}</strong>` : "______";
  const witBlocks = (wit.length ? wit : [undefined, undefined]).map((w) => witnessBlock(w)).join("");

  return (
    ARTH("Execution") +
    `<div class="keep">` +
    C.p(`IN WITNESS WHEREOF, I, ${name}, sign my name to this Last Will and Testament, including the attestation and the self-proving affidavit, on this the ${day} day of ${month}, in the year of 20${yy}, at ____________________________________, State of Texas, in the presence of ${inPresenceOf}, attesting witnesses, who sign their names here at my request and in my presence.`) +
    C.sign(name, "Testator") +
    `</div>` +
    ARTH("Witness Attestation") +
    C.p(`We, the undersigned persons of lawful age, declare that the foregoing instrument was signed, published, and declared by ${name}, the above-named Testator, as the Testator's Will, in our presence, and we, at the Testator's request, and in the Testator's presence and in the presence of each other, have signed our names to this instrument as attesting witnesses on this the ${day} day of ${month}, in the year of 20${yy}; and we certify that, in our opinion, the said Testator is of sound and disposing mind.`) +
    C.spacer() + witBlocks +
    ARTH("Self-Proving Affidavit") +
    jurat(c.f("testatorCounty")) +
    C.p(`Before me, the undersigned authority, on this day personally appeared ${partiesPhrase}, known to me to be the testator and the witnesses, respectively, whose names are subscribed to the foregoing instrument in their respective capacities, and, all of said persons being by me duly sworn, the said Testator declared to me and to the said witnesses in my presence that said instrument is the Testator's Will, and that the Testator had willingly made and executed it as the Testator's free act and deed; and the said witnesses, each on his or her oath stated to me, in the presence and hearing of the said Testator, that the said Testator had declared to them that said instrument is the Testator's Will, and that the Testator executed same as such and wanted each of them to sign it as a witness; and upon their oaths each witness stated further that they did sign the same as witnesses in the presence of the said Testator and at the Testator's request; that the Testator was at that time eighteen years of age or over (or being under such age, was or had been lawfully married, or was then a member of the armed forces of the United States) and was of sound mind; and that each of said witnesses was then at least fourteen years of age.`) +
    `<div class="two-col"><div>${C.sign(name, "Testator")}</div><div></div></div>` +
    `<div class="two-col">${C.sign(witNames[0] ?? "", "Witness")}${C.sign(witNames[1] ?? "", "Witness")}</div>` +
    ARTH("Notary Acknowledgment") +
    C.p(`Subscribed and sworn to before me by ${partiesPhrase}, on this the ${day} day of ${month}, 20${yy}.`) +
    `<div class="two-col"><div>${C.sign("", "Notary Public, State of Texas")}<p class="sig-role" style="margin-top:2px">My commission expires: ____________________</p></div><div></div></div>`
  );
}

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
const OPT_NO_CONTEST = { id: "noContest", label: "No-Contest", defaultOn: true, text: "If any beneficiary of my estate or of a trust created hereunder in any manner, directly or indirectly, contests the probate or validity of this Will or any of its provisions, or institutes or joins in, except as a party defendant, any proceeding to contest the probate or validity of this Will or to prevent any provision hereof from being carried out in accordance with the terms hereof, then all benefits provided for such beneficiary and such contesting beneficiary's descendants are revoked and shall pass as if that contesting beneficiary and such contesting beneficiary's descendants had failed to survive me. My Executor or Trustee shall be reimbursed from my estate or the affected trust for the reasonable costs and expenses, including attorneys' fees, incurred in defending any such contest." };
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
    fields: flds("testatorFullName", "testatorAddress", "testatorCounty", "maritalStatus", "spouseName", "children", "guardians", "guardianAlts", "gifts", "residuary", "executors", "executorAlts", "funeralWishes"),
    optionals: [OPT_INDEP, OPT_NO_CONTEST, OPT_TANGIBLE],
    body: (c) => {
      // ---- I. Marital Status ----
      const marital =
        c.raw("maritalStatus") === "Married"
          ? C.p(`I am married to ${c.b("spouseName")} at the time of the making of this Will.`)
          : C.p(`I am not married at the time of the making of this Will.`);

      // ---- II. Children ----
      const childNames = c.list("children").map((s) => s.split(/—|--|\s-\s|\(|,/)[0].trim()).filter(Boolean);
      const children =
        childNames.length === 0
          ? C.p(`I have no children at the time of the making of this Will.`)
          : C.p(`At the time of the making of this Will, I have ${childNames.length === 1 ? "a child named" : "children named"} ${andList(childNames.map(bold))}. Any other children that I may have are intentionally omitted from this Will.`);

      // ---- Guardian (only when minor-children guardians were named) ----
      const guardian = c.has("guardians")
        ? C.p(`In the event that, at the time of my death, any of my children are minors, I appoint ${c.party("guardians")} as guardian of the person of such minor children.${c.has("guardianAlts") ? ` If that person is unable or unwilling to serve, I appoint ${c.partyOrder("guardianAlts")}, in that order.` : ""}`)
        : "";

      // ---- Debts, Taxes, Funeral ----
      const debts =
        C.p(`I direct that all expenses of my last illness, funeral and burial arrangements, probate and administration expenses, inheritance and estate taxes, if any are due, and all of my just legal debts, be paid by my Executor, hereinafter named, as soon after my death as may be found practicable. My Executor shall have the authority to reasonably negotiate the payment of these expenses.`) +
        C.p(`I direct that my Executor be responsible for organizing my funeral, with all related expenses to be paid from my estate prior to the distribution of any assets therefrom.${c.raw("funeralWishes") ? ` It is my wish that ${c.f("funeralWishes")}.` : ""}`) +
        C.p(`I further direct my Executor to pay all estate, inheritance, succession, and death taxes assessed by the United States, any state, or any foreign government against my estate predicated upon my death as the taxable event. These taxes shall be paid without apportionment or right of reimbursement from any beneficiary.`);

      // ---- Specific Gifts (only when present) ----
      const gifts = c.has("gifts")
        ? c.gifts("gifts") + C.p(`If any recipient of a specific gift does not survive me, that gift shall lapse and become part of my residuary estate.`)
        : "";

      // ---- Estate Disposition (residuary) with footnote ----
      const dispositionRef = c.footnote(
        `The addresses and/or telephone numbers provided for the beneficiaries and Executor(s) are included to assist in contacting the individuals only and should not be used to identify them. The individuals named shall remain the intended beneficiaries regardless of any subsequent change or mistake in their addresses; the gifts, devises, and bequests are made to them personally and follow them regardless of their place of residence at the time of my death.`,
      );
      const residuary =
        C.p(`I give, devise, and bequeath all of my property and estate, both real and personal, of whatever kind and wherever situated, which I may own or have the right to dispose of at the time of my death, ${c.residuary("residuary")}, if such beneficiary or beneficiaries shall survive me.`) +
        C.p(`If no beneficiary named above shall survive me, then I give, devise, and bequeath all of my property and estate to my heirs at law, as determined by the laws of intestate succession of the State of Texas in effect at the time of my death.`) +
        C.p(`If any beneficiary disclaims or renounces any bequest or devise hereunder, then the property subject to such disclaimer or renunciation shall pass as if such beneficiary had predeceased me.`) +
        C.p(`In distributing my estate, my Executor may make distribution on a non-pro rata basis, if he or she determines that to be the correct course of action, without regard to the income tax basis of such assets.`);

      // ---- Executor (successive appointments) ----
      const execs = c.persons("executors");
      const alts = c.persons("executorAlts");
      let executor = C.p(`I nominate and appoint ${c.party("executors")}, as ${execs.length > 1 ? "Co-Executors" : "the Executor"} of this Will, to serve without bond.`);
      let prior = execs.length ? andList(execs.map((e) => bold(e.name))) : "the foregoing Executor";
      for (const a of alts) {
        executor += C.p(`If ${prior} is unable or refuses to serve, then I nominate and appoint ${a.html}, as the Executor of this Will, to serve without bond.`);
        prior = bold(a.name);
      }
      executor +=
        C.p(`If my estate contains property located in another state or a foreign jurisdiction and my Executor cannot or chooses not to serve under the laws thereof, my Executor or Trustee shall have the power to appoint an ancillary individual or corporate Executor or Trustee of such property.`) +
        C.p(`Unless another meaning is clearly indicated or required by context or circumstances, the term "Executor" or "Executors" shall also mean and include any Co-Executors, alternates, or successors. Except as otherwise specifically provided in this Will, if Co-Executors are designated to serve or are already serving, and one such Co-Executor declines to serve, fails to qualify, dies, resigns, becomes incapacitated, or otherwise fails or ceases to serve for any reason, then the remaining Executor or Co-Executors shall serve or continue to serve in such capacity.`);

      // ---- Miscellaneous (survivorship, debts, no-contest) ----
      const miscItems = [
        `<u>Survivorship Provisions.</u> No person shall be deemed to have survived me if such person shall die within 30 days after my death. Any person who is prohibited by law from inheriting property from me shall be treated as having failed to survive me.`,
        `<u>Payment of Debts.</u> I direct that all of my legal debts, funeral and testamentary expenses, costs and expenses of administration of my estate, and all estate, inheritance, transfer and succession taxes (Federal, State and others) upon or with respect to any property required to be included in my gross estate, and whether or not passing hereunder, shall be paid as soon after my death as in the opinion of my Executor(s) is practical and advisable. If at the time of my death any of my property is subject to a mortgage, lien, or other debt, the devisee taking such property shall take it subject to such debt and shall not be entitled to have it paid out of my general estate. My Executor(s) are given the right to renew, refinance, and extend any debt as my Executor(s) deems best, and shall under no circumstances be required to prepay any debt of mine.`,
      ];
      if (c.optText("noContest")) miscItems.push(`<u>No Contest Clause.</u> ${c.optText("noContest")}`);

      const articles = [
        { heading: "Marital Status; Spouse's Name", html: marital },
        { heading: "Children", html: children },
        { heading: "Guardian of Minor Children", html: guardian },
        { heading: "Debts, Taxes, Funeral Arrangements, and General Expenses", html: debts },
        { heading: "Property Disposed of by Will", html: C.p(`It is my intention to dispose of all property subject to my testamentary power.`) },
        { heading: "Specific Gifts", html: gifts },
        { heading: "Estate Disposition", ref: dispositionRef, html: residuary },
        { heading: "Executor", html: executor },
        { heading: "Bond", html: C.p(`No bond shall be required of any fiduciary serving hereunder, whether or not specifically named in this Will, or if a bond is required by law, then no surety will be required on such bond.`) },
        ...(c.optText("independent") ? [{ heading: "Independent Administration", html: C.p(c.optText("independent")) }] : []),
        { heading: "Discretionary Powers of Executor", html: DISCRETIONARY },
        { heading: "Miscellaneous", html: C.ol(miscItems) },
      ];

      return (
        `<h1 class="doc-title">Last Will and Testament</h1><p class="doc-for">for</p><p class="doc-sub">${c.f("testatorFullName")}</p><hr class="title-rule"/>` +
        C.recital(`I, ${c.b("testatorFullName")}, residing at ${c.f("testatorAddress")}, County of ${c.f("testatorCounty")}, State of Texas, being of sound mind, and not acting under duress, menace, fraud, or undue influence of any person, declare this to be my Last Will and Testament. I hereby revoke any and / or all previous Wills and Codicils.`) +
        C.recital(`By this Will, I dispose of all my property of every nature and description, separate and community, real, personal and mixed, and wherever situated, and whether acquired before or after the execution of this Will (hereafter "my estate" or "my property").`) +
        buildArticles(articles) +
        executionBlocks(c)
      );
    },
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
      ${C.spacer()}<div class="keep">${C.p(`IN WITNESS WHEREOF, I, ${c.b("testatorFullName")}, have signed this Will on this ______ day of ____________________, 20____.`)}
      ${C.sign(c.f("testatorFullName"), "Testator")}</div>
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
    fields: flds("testatorFullName", "testatorAddress", "testatorPhone", "testatorCounty", "medAgents", "medAlts", "medLimits", "medOriginalLocation", "medCopyHolders", "medEndDate"),
    optionals: [],
    body: (c) => {
      const agents = c.persons("medAgents");
      const agent = agents[0];
      const alts = c.persons("medAlts");
      const copies = c.persons("medCopyHolders");
      const original = c.raw("medOriginalLocation").trim() || c.raw("testatorAddress").trim();
      const endDate = c.raw("medEndDate").trim();
      const limits = c.raw("medLimits").trim();
      const county = c.f("testatorCounty");

      // First / Second / … alternate blocks (at least one shown, blank if none).
      const altBlocks = (alts.length ? alts : [undefined])
        .map((a, i) => `${C.section(`${ORDINALS[i] ?? `${i + 1}`} Alternate`, "")}${poaContact(a)}`)
        .join("");
      // Signed-copy holders (name + address only); at least one blank row.
      const copyBlocks = (copies.length ? copies : [undefined])
        .map((p) => poaContact(p, { phone: false }))
        .join("");

      return `
      ${TITLE("Medical Power of Attorney", `Designation of Health Care Agent — ${c.f("testatorFullName")}`)}
      ${POAH("Declaration of Health Care Agent.")}
      ${C.p(`I, ${c.b("testatorFullName")} of ${c.f("testatorAddress")}; Phone Number: ${c.f("testatorPhone")}, appoint:`)}
      ${poaContact(agent)}
      ${C.p(`as my agent to make any and all health care decisions for me, except to the extent I state otherwise in this document. This medical power of attorney takes effect if I become unable to make my own health care decisions and this fact is certified in writing by my physician.`)}
      ${POAH("Limitations on the Decision-Making Authority of My Agent Are as Follows:")}
      ${limits ? C.p(c.f("medLimits")) : blankLine + blankLine + blankLine}
      ${POAH("Designation of Alternate Agent.")}
      ${C.p(`<em>(You are not required to designate an alternate agent but you may do so. An alternate agent may make the same health care decisions as the designated agent if the designated agent is unable or unwilling to act as your agent. If the agent designated is your spouse, the designation is automatically revoked by law if your marriage is dissolved, annulled, or declared void unless this document provides otherwise.)</em>`)}
      ${C.p(`If the person designated as my agent is unable or unwilling to make health care decisions for me, I designate the following persons to serve as my agent to make health care decisions for me as authorized by this document, who serve in the following order:`)}
      ${altBlocks}
      ${C.p(`The original of this document is kept at: ${original ? bold(original) : `<span class="ph">[ ${esc(FIELD_LABELS.medOriginalLocation)} ]</span>`}`)}
      ${C.p(`The following individuals and / or institutions have signed copies:`)}
      ${copyBlocks}
      ${POAH("Duration.")}
      ${C.p(`I understand that this power of attorney exists indefinitely from the date I execute this document unless I establish a shorter time or revoke the power of attorney. If I am unable to make health care decisions for myself when this power of attorney expires, the authority I have granted my agent continues to exist until the time I become able to make health care decisions for myself.`)}
      ${C.p(`(If applicable) This power of attorney ends on the following date: ${bold(endDate || "INDEFINITE")}`)}
      ${POAH("Prior Designations Revoked.")}
      ${C.p(`I revoke any prior medical power of attorney.`)}
      ${POAH("Disclosure Statement")}
      ${C.p(`THIS MEDICAL POWER OF ATTORNEY IS AN IMPORTANT LEGAL DOCUMENT. BEFORE SIGNING THIS DOCUMENT, YOU SHOULD KNOW THESE IMPORTANT FACTS:`)}
      ${C.p(`Except to the extent you state otherwise, this document gives the person you name as your agent the authority to make any and all health care decisions for you in accordance with your wishes, including your religious and moral beliefs, when you are unable to make the decisions for yourself. Because "health care" means any treatment, service, or procedure to maintain, diagnose, or treat your physical or mental condition, your agent has the power to make a broad range of health care decisions for you. Your agent may consent, refuse to consent, or withdraw consent to medical treatment and may make decisions about withdrawing or withholding life-sustaining treatment. Your agent may not consent to voluntary inpatient mental health services, convulsive treatment, psychosurgery, or abortion. A physician must comply with your agent's instructions or allow you to be transferred to another physician.`)}
      ${C.p(`Your agent's authority is effective when your doctor certifies that you lack the competence to make health care decisions.`)}
      ${C.p(`Your agent is obligated to follow your instructions when making decisions on your behalf. Unless you state otherwise, your agent has the same authority to make decisions about your health care as you would have if you were able to make health care decisions for yourself.`)}
      ${C.p(`It is important that you discuss this document with your physician or other health care provider before you sign the document to ensure that you understand the nature and range of decisions that may be made on your behalf. If you do not have a physician, you should talk with someone else who is knowledgeable about these issues and can answer your questions. You do not need a lawyer's assistance to complete this document, but if there is anything in this document that you do not understand, you should ask a lawyer to explain it to you.`)}
      ${C.p(`The person you appoint as agent should be someone you know and trust. The person must be 18 years of age or older or a person under 18 years of age who has had the disabilities of a minority removed. If you appoint your health or residential care provider (e.g., your physician or an employee of a home health agency, hospital, nursing facility, or residential care facility, other than a relative), that person has to choose between acting as your agent or as your health or residential care provider; the law does not allow a person to serve as both at the same time.`)}
      ${C.p(`You should inform the person you appoint that you want the person to be your health care agent. You should discuss this document with your agent and your physician and give each a signed copy. You should indicate on the document itself the people and institutions that you intend to have signed copies. Your agent is not liable for health care decisions made in good faith on your behalf.`)}
      ${C.p(`Once you have signed this document, you have the right to make health care decisions for yourself as long as you are able to make those decisions, and treatment cannot be given to you or stopped over your objection. You have the right to revoke the authority granted to your agent by informing your agent or your health or residential care provider orally or in writing or by your execution of a subsequent medical power of attorney. Unless you state otherwise in this document, your appointment of a spouse is revoked if your marriage is dissolved, annulled, or declared void.`)}
      ${C.p(`This document may not be changed or modified. If you want to make changes in this document, you must execute a new medical power of attorney.`)}
      ${C.p(`You may wish to designate an alternate agent in the event that your agent is unwilling, unable, or ineligible to act as your agent. If you designate an alternate agent, the alternate agent has the same authority as the agent to make health care decisions for you.`)}
      ${C.p(`THIS POWER OF ATTORNEY IS NOT VALID UNLESS:`)}
      ${C.ul([
        `YOU SIGN IT AND HAVE YOUR SIGNATURE ACKNOWLEDGED BEFORE A NOTARY PUBLIC; OR`,
        `YOU SIGN IT IN THE PRESENCE OF TWO COMPETENT ADULT WITNESSES.`,
      ])}
      ${C.p(`THE FOLLOWING PERSONS MAY NOT ACT AS ONE OF THE WITNESSES:`)}
      ${C.ul([
        `the person you have designated as your agent;`,
        `a person related to you by blood or marriage;`,
        `a person entitled to any part of your estate after your death under a will or codicil executed by you or by operation of law;`,
        `your attending physician;`,
        `an employee of your attending physician;`,
        `an employee of a health care facility in which you are a patient if the employee is providing direct patient care to you or is an officer, director, partner, or business office employee of the health care facility or of any parent organization of the health care facility; or`,
        `a person who, at the time this medical power of attorney is executed, has a claim against any part of your estate after your death.`,
      ])}
      ${C.p(`By signing below, I acknowledge that I have read and understand the information contained in the above disclosure statement.`)}
      ${C.p(`<em>(YOU MUST DATE AND SIGN THIS POWER OF ATTORNEY. YOU MAY SIGN IT AND HAVE YOUR SIGNATURE ACKNOWLEDGED BEFORE A NOTARY PUBLIC OR YOU MAY SIGN IT IN THE PRESENCE OF TWO COMPETENT ADULT WITNESSES.)</em>`)}
      ${POAH("Signature Acknowledged Before Notary")}
      <div class="keep">
        ${C.p(`I sign my name to this medical power of attorney on the ________ day of _________________________, 20________ at __________________ ${county} County, Texas.`)}
        ${C.sign(c.b("testatorFullName"), "Declarant")}
        ${C.sign("", "Witness #1")}
        ${C.sign("", "Witness #2")}
      </div>
      <div class="keep">
        ${C.p(`SUBSCRIBED AND SWORN TO before me by the above named declarant and affiants on this the ________ day of _________________________, 20________.`)}
        ${C.sign("", "Notary Public, State of Texas")}
      </div>`;
    },
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
