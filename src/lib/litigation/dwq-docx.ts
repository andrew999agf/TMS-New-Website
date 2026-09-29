import {
  AlignmentType, BorderStyle, Document, Packer, PageBreak, Paragraph, Table, TableCell, TableRow,
  TextRun, WidthType, convertInchesToTwip,
} from "docx";

/**
 * Deposition on Written Questions / records-subpoena generator.
 *
 * Rebuilds, in code, the exact document the firm serves (modeled on the
 * W. McGee packages): caption, notice + subpoena duces tecum, Rule 176.8
 * warning, DOCUMENTS TO BE PRODUCED, WRITTEN QUESTIONS with answer lines,
 * response instructions, signature/certificate blocks, and the Rule 902(10)
 * Business Records Affidavit as Exhibit 1. Variants:
 *   - Zoom vs. in-person officer attendance,
 *   - financial-institution overlay (Tex. Fin. Code § 59.006: extra rule
 *     cite, customer-notice sentence, no-earlier-than production date),
 *   - optional affidavit-in-lieu paragraph + Exhibit 1,
 *   - standard custodian questions and housekeeping questions on toggles.
 * The output is a court-ready .docx the team opens, proofs, and serves.
 */

export type DwqInput = {
  causeNo: string;
  /** Court block lines for the right caption column, e.g. ["IN THE COUNTY COURT AT LAW", "NO. 3", "TARRANT COUNTY, TEXAS"]. */
  courtLines: string[];
  plaintiff: string;
  defendant: string;
  /** "Plaintiff Holocron Toy Store LLC" — how the noticing party reads in prose. */
  noticingParty: string;

  entity: string;
  /** "by and through its Registered Agent, CT Corporation System, 1999 Bryan Street, Suite 900, Dallas, TX 75201, or wherever it may be found." */
  serviceLine: string;

  financial: boolean;
  method: "zoom" | "in-person";
  /** "October 26, 2026, at 10:00 a.m." */
  dateTime: string;
  /** "Caprock Court Reporting, (806) 795-4202" */
  reporter: string;
  zoomLink?: string;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  /** In-person: the place of the deposition. */
  location?: string;

  affidavitOption: boolean;
  definitions: string;
  documents: string[];
  includeStandardQuestions: boolean;
  customQuestions: string[];
  includeHousekeepingQuestions: boolean;

  returnFax: string;
  returnEmail: string;
  officePhone: string;

  /** Certificate-of-service date, e.g. "September 29, 2026". */
  serviceDate: string;
  /** Financial only: "October 24, 2026". */
  noEarlierThan?: string;
  issuanceDate: string;

  /** Signature block lines under "/s/ …" (name first). */
  attorneyBlock: string[];
  /** "Attorney for Plaintiff\nHolocron Toy Store LLC" */
  signRole: string;
  /** Opposing counsel block lines for the certificate of service. */
  opposingCounsel: string[];
};

const FONT = "Times New Roman";
const SIZE = 24; // half-points = 12pt

const run = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, size: SIZE, ...opts });

const para = (text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spaceAfter?: number; spaceBefore?: number } = {}) =>
  new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts.spaceAfter ?? 160, before: opts.spaceBefore ?? 0, line: 276 },
    children: [run(text, { bold: opts.bold })],
  });

const center = (text: string, bold = true, spaceAfter = 160) =>
  para(text, { bold, align: AlignmentType.CENTER, spaceAfter });

const blank = () => new Paragraph({ spacing: { after: 120 }, children: [] });

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function captionTable(input: DwqInput): (Paragraph | Table)[] {
  const left = [
    `${input.plaintiff.toUpperCase()},`, "     Plaintiff,", "", "v.", "",
    `${input.defendant.toUpperCase()},`, "     Defendants.",
  ];
  const rows = Math.max(left.length, input.courtLines.length * 2 - 1, 9);
  const mid = Array.from({ length: rows }, () => "§");
  // Spread the court lines down the right column like the firm's caption.
  const right: string[] = Array.from({ length: rows }, () => "");
  const step = input.courtLines.length > 1 ? Math.floor((rows - 1) / (input.courtLines.length - 1)) : 0;
  input.courtLines.forEach((l, i) => { right[Math.min(rows - 1, i * Math.max(1, step))] = l; });

  const cell = (lines: string[], width: number, bold = false) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders: NO_BORDER,
      children: lines.map((l) =>
        new Paragraph({ spacing: { after: 20, line: 240 }, children: [run(l, { bold })] })),
    });

  return [
    center(`CAUSE NO. ${input.causeNo}`, true, 240),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [cell(left, 44), cell(mid, 8), cell(right, 48)] })],
    }),
    blank(),
  ];
}

function answerLines(): Paragraph[] {
  return [
    new Paragraph({ spacing: { after: 60, line: 276 }, children: [run("ANSWER: ____________________________________________________________________")] }),
    new Paragraph({ spacing: { after: 200, line: 276 }, children: [run("______________________________________________________________________________")] }),
  ];
}

export function standardCustodianQuestions(entity: string): string[] {
  return [
    `Please state your full name, title, and your relationship to ${entity}.`,
    `Are you the Custodian of Records for ${entity}, or are you otherwise authorized to testify regarding the business records of ${entity}?`,
    `Are the documents produced in response to this deposition on written questions kept by ${entity} in the regular course of its business?`,
    "Were the documents produced in response to this deposition on written questions made at or near the time of the events they reflect, by or from information transmitted by a person with knowledge of those events?",
    `Is it the regular practice of ${entity} to make and keep records of the type produced in response to this deposition?`,
    "Are the documents produced true and correct copies of records maintained by the Entity?",
  ];
}

export function housekeepingQuestions(): string[] {
  return [
    "If any responsive documents have been withheld for any reason, please identify each such document with sufficient particularity to permit assessment of the basis for withholding, and state the basis for withholding.",
    "As to any category of documents requested above for which no responsive records exist, please state that no responsive records exist and describe the search performed to reach that conclusion.",
    "Have any records responsive to this subpoena been destroyed, purged, deleted, archived offsite, or overwritten? If so, please identify the records, the date of destruction or purging, and the retention policy or instruction under which it occurred.",
  ];
}

export async function buildDwqDocx(input: DwqInput): Promise<Uint8Array> {
  const e = input.entity;
  const body: (Paragraph | Table)[] = [];

  body.push(...captionTable(input));
  body.push(center(`NOTICE OF DEPOSITION ON WRITTEN QUESTIONS AND SUBPOENA DUCES TECUM TO CUSTODIAN OF RECORDS OF ${e.toUpperCase()}`, true, 280));

  body.push(para("THE STATE OF TEXAS", { bold: true, spaceAfter: 60 }));
  body.push(para("SUBPOENA DUCES TECUM", { bold: true, spaceAfter: 240 }));

  body.push(para(`TO:  ${e.toUpperCase()}, ${input.serviceLine}`, { spaceAfter: 240 }));

  const rules = input.financial
    ? "Texas Rules of Civil Procedure 200 and 205 and Texas Finance Code § 59.006"
    : "Texas Rules of Civil Procedure 200 and 205";
  const attendance =
    input.method === "zoom"
      ? `on ${input.dateTime}, via Zoom videoconference administered by court reporters of ${input.reporter}.`
      : `on ${input.dateTime}, in person at ${input.location ?? "[location]"}, before court reporters of ${input.reporter}.`;
  body.push(para(
    `PLEASE TAKE NOTICE that, pursuant to ${rules}, ${input.noticingParty} will take the deposition on written questions of the Custodian of Records of ${e}. ` +
    `The deposition will be conducted before a notary public or other officer authorized to administer oaths at a time and at a mutually agreeable place, or if no agreement is reached, ${attendance}`,
  ));

  if (input.method === "zoom" && input.zoomLink) {
    body.push(para("Zoom link:", { spaceAfter: 40 }));
    body.push(para(input.zoomLink, { spaceAfter: 120 }));
    if (input.zoomMeetingId) body.push(para(`Meeting ID: ${input.zoomMeetingId}`, { spaceAfter: 40 }));
    if (input.zoomPasscode) body.push(para(`Passcode: ${input.zoomPasscode}`, { spaceAfter: 200 }));
  }

  if (input.affidavitOption) {
    body.push(para(
      "If you provide a valid business-record affidavit (attached hereto as Exhibit 1) in accordance with Texas Rule of Evidence 902(10), together with records satisfying Texas Rule of Evidence 803(6), in advance of the applicable deadline, then the Deposition Upon Written Questions may not be necessary.",
    ));
  }

  body.push(para(
    `YOU ARE COMMANDED to appear by and through the Custodian of Records for ${e}, and to answer the written questions attached hereto under oath and produce the documents described below at the time, date, and place stated herein` +
    (input.affidavitOption ? ", unless the requested records are produced with a valid business-records affidavit in accordance with Texas Rule of Evidence 902(10)." : "."),
  ));

  body.push(para(
    "Pursuant to Texas Rule of Civil Procedure 176, you are further commanded to produce the documents described herein. Failure to comply with this subpoena without adequate excuse may be deemed a contempt of the court from which this subpoena is issued. Any person who without adequate excuse fails to obey a subpoena served upon that person may be held in contempt of court. See Tex. R. Civ. P. 176.8.",
  ));
  body.push(para("176.8 Enforcement of Subpoena.", { bold: true, spaceAfter: 120 }));
  body.push(para(
    "(a) Contempt.  Failure by any person without adequate excuse to obey a subpoena served upon that person may be deemed a contempt of the court from which the subpoena is issued or a district court in the county in which the subpoena is served, and may be punished by fine or confinement, or both.",
  ));
  body.push(para(
    "(b) Proof of payment of fees required for fine or attachment.  A fine may not be imposed, nor a person served with a subpoena attached, for failure to comply with a subpoena without proof by affidavit of the party requesting the subpoena or the party's attorney of record that all fees due the witness by law were paid or tendered.",
  ));
  body.push(para(
    "You may be entitled to reimbursement of reasonable costs of compliance. If you object to this subpoena or any portion thereof, you must serve written objections on the issuing attorney before the time specified for compliance. See Tex. R. Civ. P. 176.6.",
  ));

  body.push(center("DOCUMENTS TO BE PRODUCED", true, 200));
  if (input.definitions.trim()) body.push(para(input.definitions.trim()));
  input.documents.filter((d) => d.trim()).forEach((d, i) => body.push(para(`${i + 1}. ${d.trim()}`, { spaceAfter: 120 })));

  const questions: string[] = [
    ...(input.includeStandardQuestions ? standardCustodianQuestions(e) : []),
    ...input.customQuestions.filter((q) => q.trim()),
    ...(input.includeHousekeepingQuestions ? housekeepingQuestions() : []),
  ];
  body.push(center("WRITTEN QUESTIONS TO THE CUSTODIAN OF RECORDS", true, 200));
  questions.forEach((q, i) => {
    body.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 100, line: 276 },
      children: [run(`QUESTION NO. ${i + 1}: `, { bold: true }), run(q.trim())],
    }));
    body.push(...answerLines());
  });

  body.push(center("INSTRUCTIONS FOR RESPONSE", true, 200));
  body.push(para(
    "The Custodian's answers to the written questions above must be made under oath before a notary public or other officer authorized to administer oaths. The sworn responses must be returned together with all responsive documents" +
    (input.affidavitOption ? " and the executed Business Records Affidavit attached hereto as Exhibit 1." : "."),
  ));
  body.push(para("Responsive documents and sworn answers may be returned by one of the following methods:", { spaceAfter: 100 }));
  body.push(para(`By Facsimile: ${input.returnFax}; or`, { spaceAfter: 100 }));
  body.push(para(
    `By Email: ${input.returnEmail}. If producing documents by email, you must call our office in advance at ${input.officePhone} to notify us that the production will be transmitted via secured link or encrypted email, so that we may properly receive and access the documents.`,
  ));

  if (input.financial) {
    body.push(para(
      `A copy of this record request was served on counsel of record for the customers whose records are sought, on ${input.serviceDate}, by email and e-service. ` +
      `The Entity is not required to produce responsive records before ${input.noEarlierThan ?? "[date]"}. Reasonable costs of compliance will be paid upon submission of an itemized statement to the issuing attorney.`,
    ));
  } else {
    body.push(para("Reasonable costs of compliance will be paid upon submission of an itemized statement to the issuing attorney."));
  }

  body.push(blank());
  body.push(para(`ISSUANCE DATE:   ${input.issuanceDate}`, { spaceAfter: 240 }));
  body.push(para("Respectfully submitted,", { spaceAfter: 160 }));
  const [name, ...rest] = input.attorneyBlock;
  body.push(para(`/s/ ${name}`, { spaceAfter: 40 }));
  body.push(para(name, { spaceAfter: 40 }));
  rest.forEach((l) => body.push(para(l, { spaceAfter: 40 })));
  input.signRole.split("\n").forEach((l) => body.push(para(l, { spaceAfter: 40 })));

  body.push(blank());
  body.push(center("CERTIFICATE OF SERVICE", true, 200));
  body.push(para(
    `I hereby certify that on ${input.serviceDate}, the foregoing document was served on counsel for all parties listed below via email and / or eserve:`,
  ));
  input.opposingCounsel.forEach((l) => body.push(para(l, { spaceAfter: 40 })));
  body.push(blank());
  body.push(para(`/s/ ${name}`, { spaceAfter: 40 }));
  body.push(para(name, { spaceAfter: 40 }));

  if (input.affidavitOption) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(center("EXHIBIT “1”", true, 400));
    body.push(...captionTable(input));
    body.push(center("BUSINESS RECORDS AFFIDAVIT", true, 240));
    body.push(para("THE STATE OF TEXAS", { bold: true, spaceAfter: 60 }));
    body.push(para("COUNTY OF ______________", { bold: true, spaceAfter: 240 }));
    body.push(para(
      "Before me, the undersigned authority, personally appeared ________________________, who, being by me duly sworn, stated as follows:",
    ));
    const aff = [
      "“My name is ______________________________. I am over eighteen (18) years of age, of sound mind, capable of making this affidavit, and personally acquainted with the facts stated in this affidavit.",
      `I am the Custodian of Records for ${e} (hereafter the “Entity”), or I am otherwise an employee or authorized representative of the Entity who is familiar with the manner in which the Entity creates, receives, maintains, and preserves its business records by virtue of my duties and responsibilities.`,
      "Attached to this affidavit are _________ pages of records from the Entity's files.",
      "The records attached to this affidavit are the original records or exact duplicates of the original records maintained by the Entity.",
      "The attached records were made at or near the time of each act, event, condition, opinion, transaction, occurrence, or matter set forth in the records, or it was the regular practice of the Entity to make this type of record at or near the time of each act, event, condition, opinion, transaction, occurrence, or matter set forth in the records.",
      "The attached records were made by, or from information transmitted by, persons with knowledge of the matters set forth in the records, or it was the regular practice of the Entity for this type of record to be made by, or from information transmitted by, persons with knowledge of the matters set forth in the records.",
      "The attached records were kept in the course of a regularly conducted business activity of the Entity, or it was the regular practice of the Entity to keep this type of record in the course of a regularly conducted business activity.",
      "It was the regular practice of the business activity of the Entity to make and keep records of the type attached to this affidavit.",
      "To the best of my knowledge, information, and belief, the attached records constitute the records responsive to the subpoena duces tecum served in this matter, except as follows:",
    ];
    aff.forEach((p) => body.push(para(p)));
    for (let i = 0; i < 3; i++) body.push(para("________________________________________________________________________", { spaceAfter: 80 }));
    body.push(para("This affidavit is made pursuant to Texas Rule of Evidence 902(10) and Texas Rule of Evidence 803(6).”"));
    body.push(para("Further affiant sayeth not.", { spaceAfter: 320 }));
    body.push(para("__________________________________", { spaceAfter: 40 }));
    body.push(para("Affiant Signature", { spaceAfter: 200 }));
    body.push(para("__________________________________", { spaceAfter: 40 }));
    body.push(para("Printed Name", { spaceAfter: 200 }));
    body.push(para("__________________________________", { spaceAfter: 40 }));
    body.push(para(`Title / Position, ${e}`, { spaceAfter: 320 }));
    body.push(para(
      "SUBSCRIBED AND SWORN TO before me on this the ________ day of ____________________, 20____, by ____________________________________.",
      { spaceAfter: 320 },
    ));
    body.push(para("__________________________________", { spaceAfter: 40 }));
    body.push(para("Notary Public, State of ______________", { spaceAfter: 40 }));
    body.push(para("My Commission Expires: _____________", { spaceAfter: 40 }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{
      properties: {
        page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) } },
      },
      children: body,
    }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
