import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, PageNumber, Packer, Paragraph,
  Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from "docx";

/**
 * DRAFT Texas Small Estate Affidavit (Estates Code ch. 205), generated from
 * the client questionnaire for the INTAKE TEAM only — an initial working
 * draft in proper form: cause-number caption for the county court, the
 * statutory recitals, asset / liability tables, family history, a
 * distributee table with shares left open, distributee and disinterested-
 * witness signature blocks with notary certificates, and the judge's
 * approval block. Anything the questionnaire didn't supply renders as a
 * fill-in blank; nothing is guessed. Times New Roman, 12 pt, black.
 */

const S = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const B = (v: unknown) => v === true;
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);

export type SeaRaw = Record<string, unknown>;

const BLANK = "____________________";
const FONT = "Times New Roman";
const SIZE = 24; // 12 pt

const run = (text: string, o: { bold?: boolean; caps?: boolean; italics?: boolean; size?: number; underline?: boolean } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? SIZE, bold: o.bold, smallCaps: o.caps, italics: o.italics, color: "000000", underline: o.underline ? {} : undefined });

const NO_B = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const LINE = { style: BorderStyle.SINGLE, size: 6, color: "000000" } as const;

function fmtDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || BLANK;
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
const money = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : v || "";
};

export async function seaDraftDocx(rawIn: SeaRaw, firmName: string, submittedAt: Date): Promise<Buffer> {
  const raw = rawIn ?? {};
  const dec = (raw.decedent ?? {}) as Record<string, unknown>;
  const hs = (raw.homestead ?? {}) as Record<string, unknown>;
  const contact = (raw.contact ?? {}) as Record<string, unknown>;
  const elig = (raw.eligibility ?? {}) as Record<string, unknown>;

  const name = S(dec.name) || BLANK;
  const NAME = name === BLANK ? BLANK : name.toUpperCase();
  const aka = S(dec.aka);
  const dod = fmtDate(S(dec.dod, 20));
  const resCounty = S(dec.county) || BLANK;
  const resState = S(dec.state) || "Texas";
  const marital = S(dec.marital, 20);
  const filingCounty = (S(raw.filingCounty) || resCounty).replace(/\s+county\s*$/i, "");
  const FILING = filingCounty === BLANK ? BLANK : filingCounty.toUpperCase();

  const marriages = arr(raw.marriages, 12).map((m) => {
    const x = (m ?? {}) as Record<string, unknown>;
    return { spouse: S(x.spouse), start: S(x.start, 40), end: S(x.end, 60), endDate: S(x.endDate, 40) };
  });
  const children = arr(raw.children, 25).map((c) => {
    const x = (c ?? {}) as Record<string, unknown>;
    return { name: S(x.name), dob: S(x.dob, 20), addr: S(x.addr), of: S(x.of, 120), adopted: B(x.adopted), outside: B(x.outside), deceased: B(x.deceased), descendants: S(x.descendants, 600), guardian: S(x.guardian) };
  }).filter((c) => c.name);
  const assets = arr(raw.assets, 40).map((a) => {
    const x = (a ?? {}) as Record<string, unknown>;
    return { type: S(x.type, 80), desc: S(x.desc), where: S(x.where), last4: S(x.last4, 8), value: S(x.value, 20), pod: B(x.pod), joint: B(x.joint) };
  }).filter((a) => a.type || a.desc || a.value);
  const debts = arr(raw.debts, 40).map((d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    return { who: S(x.who), type: S(x.type, 80), amt: S(x.amt, 20), secured: S(x.secured) };
  }).filter((d) => d.who || d.amt);
  const witnesses = arr(raw.witnesses, 2).map((w) => {
    const x = (w ?? {}) as Record<string, unknown>;
    return { name: S(x.name), contact: S(x.contact), rel: S(x.rel) };
  });

  // Surviving spouse: the marriage marked still-in-force, else the last listed
  // when the decedent died married.
  const survivingSpouse = marital === "Married"
    ? (marriages.find((m) => /still married/i.test(m.end))?.spouse || marriages[marriages.length - 1]?.spouse || BLANK)
    : "";

  // Distributee candidates for the draft — shares deliberately left open.
  const distributees: { name: string; rel: string }[] = [];
  if (survivingSpouse) distributees.push({ name: survivingSpouse, rel: "Surviving spouse" });
  for (const c of children) {
    if (c.deceased) {
      distributees.push({ name: c.descendants ? `Descendants of ${c.name}, deceased: ${c.descendants}` : `Descendants of ${c.name}, deceased`, rel: "Per stirpes — deceased child's share" });
    } else {
      distributees.push({ name: c.name, rel: c.guardian ? `Child (minor — by ${c.guardian})` : "Child" });
    }
  }
  if (!children.length) {
    const father = S(raw.father), mother = S(raw.mother), siblings = S(raw.siblings, 800);
    if (father) distributees.push({ name: father, rel: "Father" });
    if (mother) distributees.push({ name: mother, rel: "Mother" });
    if (siblings) distributees.push({ name: siblings.replace(/\r?\n/g, "; "), rel: "Sibling(s)" });
  }
  if (!distributees.length) distributees.push({ name: BLANK, rel: BLANK });

  const totalAssets = assets.reduce((t, a) => {
    const n = parseFloat(a.value);
    return t + (Number.isFinite(n) && !a.pod && !a.joint ? n : 0);
  }, 0);
  const totalDebts = debts.reduce((t, d) => { const n = parseFloat(d.amt); return t + (Number.isFinite(n) ? n : 0); }, 0);

  /* ------------------------------ building ------------------------------ */
  const children_: (Paragraph | Table)[] = [];
  const P = (kids: TextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; indentFirst?: boolean } = {}) =>
    children_.push(new Paragraph({ children: kids, alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 160, line: 300 }, indent: o.indentFirst ? { firstLine: 720 } : undefined }));
  const numbered = (n: number, text: string) =>
    children_.push(new Paragraph({ children: [run(`${n}.\t`), run(text)], spacing: { after: 180, line: 300 }, indent: { left: 720, hanging: 720 } }));

  // Draft banner — team-only document.
  children_.push(new Paragraph({
    children: [run(`DRAFT — prepared by ${firmName} from the client questionnaire submitted ${submittedAt.toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric" })}. For attorney review; not for filing or signature until reviewed.`, { bold: true, italics: true, size: 20 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    border: { top: LINE, bottom: LINE, left: LINE, right: LINE },
  }));

  P([run(`CAUSE NO. ${BLANK}`, { bold: true })], { align: AlignmentType.CENTER, after: 280 });

  // Caption: estate style, § column, county court.
  const capCell = (paras: Paragraph[], w: number) =>
    new TableCell({ children: paras, width: { size: w, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, borders: { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B } });
  const capP = (t: string, bold = false) => new Paragraph({ children: [run(t, { bold })], spacing: { after: 40 } });
  const sect = () => new Paragraph({ children: [run("§")], alignment: AlignmentType.CENTER, spacing: { after: 40 } });
  children_.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B, insideHorizontal: NO_B, insideVertical: NO_B },
    rows: [
      new TableRow({ children: [capCell([capP("IN THE ESTATE OF")], 44), capCell([sect()], 6), capCell([capP("IN THE COUNTY COURT")], 50)] }),
      new TableRow({ children: [capCell([capP(`${NAME},`, true)], 44), capCell([sect()], 6), capCell([capP("")], 50)] }),
      new TableRow({ children: [capCell([capP("DECEASED")], 44), capCell([sect()], 6), capCell([capP(`OF ${FILING} COUNTY, TEXAS`)], 50)] }),
    ],
  }));

  P([run("SMALL ESTATE AFFIDAVIT", { bold: true, size: 28 })], { align: AlignmentType.CENTER, before: 320, after: 60 });
  P([run("(Pursuant to Chapter 205 of the Texas Estates Code)", { italics: true, size: 22 })], { align: AlignmentType.CENTER, after: 240 });

  P([run("On the dates shown by the notary certificates below, the distributees and disinterested witnesses named in this affidavit personally appeared before the undersigned notaries and, being duly sworn, stated on their oaths the following:")], { after: 200 });

  let n = 0;
  numbered(++n, `The decedent, ${name}${aka ? ` (also known as ${aka})` : ""}, died on ${dod}. At the time of death, the decedent resided in ${resCounty === BLANK ? BLANK : `${resCounty} County`}, ${resState}.`);
  numbered(++n, `More than thirty (30) days have elapsed since the death of the decedent.`);
  numbered(++n, `No petition for the appointment of a personal representative of the decedent's estate is pending or has been granted.${S(elig.admin) === "Yes" ? "  [QUESTIONNAIRE FLAG: the client reported an administration may have been filed or granted — VERIFY.]" : ""}`);
  numbered(++n, `The value of the entire assets of the estate, not including homestead and exempt property, does not exceed $75,000.${S(elig.under75) === "No" ? "  [QUESTIONNAIRE FLAG: the client reported assets may EXCEED $75,000 — VERIFY.]" : ""}`);
  numbered(++n, `The value of the entire assets of the estate, not including homestead and exempt property, exceeds the known liabilities of the estate, not including liabilities secured by homestead and exempt property.${S(elig.solvent) === "No" ? "  [QUESTIONNAIRE FLAG: the client reported debts may exceed assets — VERIFY.]" : ""}`);
  numbered(++n, `The decedent died intestate — the decedent left no will.${S(elig.will) === "Yes" ? "  [QUESTIONNAIRE FLAG: the client reported a WILL EXISTS — a Small Estate Affidavit is generally unavailable; VERIFY before proceeding.]" : ""}`);

  // Family history
  const famBits: string[] = [];
  if (marital) famBits.push(`At the time of death the decedent was ${marital === "Single" ? "single (not married)" : marital.toLowerCase()}.`);
  if (marital === "Single" && S(dec.everMarried) === "No") famBits.push("The decedent was never married.");
  marriages.forEach((m, i) => {
    if (!m.spouse && !m.end) return;
    famBits.push(`Marriage ${i + 1}: to ${m.spouse || BLANK}${m.start ? `, married ${m.start}` : ""}${m.end ? ` — ${m.end.toLowerCase()}` : ""}${m.endDate ? ` (${m.endDate})` : ""}.`);
  });
  if (children.length) {
    famBits.push(`The decedent had ${children.length} child${children.length === 1 ? "" : "ren"}:`);
  } else if (S(raw.hasKids) === "No") {
    famBits.push("The decedent had no children, biological or adopted.");
  }
  numbered(++n, `Family history: ${famBits.join("  ") || BLANK}`);
  children.forEach((c) => {
    const bits = [c.name, c.dob ? `born ${fmtDate(c.dob)}` : "", c.addr ? `of ${c.addr}` : "", c.of ? c.of.toLowerCase() : "", c.adopted ? "adopted" : "", c.outside ? "born outside a marriage" : "", c.deceased ? `DECEASED${c.descendants ? ` — descendants: ${c.descendants}` : " — no descendants listed"}` : ""].filter(Boolean).join("; ");
    children_.push(new Paragraph({ children: [run(`•  ${bits}`)], spacing: { after: 80, line: 300 }, indent: { left: 1080 } }));
  });
  if (!children.length && (S(raw.father) || S(raw.mother) || S(raw.siblings))) {
    numbered(++n, `The decedent's heirs at law include: ${[S(raw.father) && `father, ${S(raw.father)}`, S(raw.mother) && `mother, ${S(raw.mother)}`, S(raw.siblings) && `sibling(s): ${S(raw.siblings, 800).replace(/\r?\n/g, "; ")}`].filter(Boolean).join("; ")}.`);
  }
  if (S(raw.incap) === "Yes") numbered(++n, `[QUESTIONNAIRE FLAG: an heir may be legally incapacitated — additional steps may be required before filing. See client notes.]`);

  // Assets
  numbered(++n, `All known assets of the estate, and their values, are listed below. Assets noted as having a payable-on-death beneficiary or a joint owner with survivorship rights may pass outside the probate estate:`);
  const th = (t: string, w: number) => new TableCell({ children: [new Paragraph({ children: [run(t, { bold: true, size: 20 })], alignment: AlignmentType.CENTER })], width: { size: w, type: WidthType.PERCENTAGE }, shading: { fill: "EEEEEE" }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE } });
  const td = (t: string, center = false) => new TableCell({ children: [new Paragraph({ children: [run(t || " ")], alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT })], margins: { top: 50, bottom: 50, left: 100, right: 100 }, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE } });
  children_.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [th("ASSET", 46), th("WHERE HELD", 22), th("VALUE", 16), th("NOTES", 16)] }),
      ...(assets.length ? assets : [{ type: BLANK, desc: "", where: "", last4: "", value: "", pod: false, joint: false }]).map((a) =>
        new TableRow({ children: [
          td([a.type, a.desc].filter(Boolean).join(" — ")),
          td([a.where, a.last4 && `acct …${a.last4}`].filter(Boolean).join(", ")),
          td(money(a.value), true),
          td([a.pod ? "POD beneficiary" : "", a.joint ? "Joint owner" : ""].filter(Boolean).join("; ")),
        ] })),
      new TableRow({ children: [td("Estimated total (excluding POD/joint items)"), td(""), td(totalAssets ? money(String(totalAssets)) : BLANK, true), td("")] }),
    ],
  }));
  children_.push(new Paragraph({ children: [], spacing: { after: 160 } }));

  // Liabilities
  numbered(++n, `All known liabilities of the estate are listed below:`);
  children_.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [th("CREDITOR", 40), th("TYPE", 26), th("AMOUNT", 16), th("SECURED BY", 18)] }),
      ...(debts.length ? debts : [{ who: "None known", type: "", amt: "", secured: "" }]).map((d) =>
        new TableRow({ children: [td(d.who), td(d.type), td(money(d.amt), true), td(d.secured)] })),
      ...(totalDebts ? [new TableRow({ children: [td("Known total"), td(""), td(money(String(totalDebts)), true), td("")] })] : []),
    ],
  }));
  children_.push(new Paragraph({ children: [], spacing: { after: 160 } }));

  // Homestead
  if (S(hs.owned) === "Yes") {
    numbered(++n, `The decedent's homestead: ${S(hs.addr) || BLANK}${S(hs.legal) ? `; legal description: ${S(hs.legal, 600)}` : `; legal description: ${BLANK}`}${S(hs.occupant) ? `. Current occupant: ${S(hs.occupant)}` : ""}.${!survivingSpouse ? "  [ATTORNEY NOTE: no surviving spouse — confirm a minor child (or other homestead right) before attempting to pass the homestead by this affidavit.]" : ""}`);
  } else {
    numbered(++n, `The decedent did not own a homestead.${S(elig.otherRealty) === "Yes" ? "  [QUESTIONNAIRE FLAG: the client reported OTHER real property — it generally cannot pass by this affidavit; VERIFY.]" : ""}`);
  }

  // Distributees
  numbered(++n, `The distributees of the estate, their relationship to the decedent, and each distributee's share of the estate, are as follows [SHARES TO BE COMPLETED BY ATTORNEY under Texas descent-and-distribution law]:`);
  children_.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [th("DISTRIBUTEE", 46), th("RELATIONSHIP", 30), th("SHARE OF ESTATE", 24)] }),
      ...distributees.map((d) => new TableRow({ children: [td(d.name), td(d.rel), td("__________", true)] })),
    ],
  }));
  children_.push(new Paragraph({ children: [], spacing: { after: 160 } }));

  numbered(++n, `All facts stated in this affidavit, including the family history of the decedent, are within the personal knowledge of the affiants and are true and correct.`);
  if (S(contact.notes)) numbered(++n, `[CLIENT NOTES — not part of the affidavit: ${S(contact.notes, 1500)}]`);

  /* --------------------------- signature blocks -------------------------- */
  const sigLine = (label: string, sub?: string) => {
    children_.push(new Paragraph({ children: [run("_________________________________________")], spacing: { before: 360, after: 20 } }));
    children_.push(new Paragraph({ children: [run(label, { bold: true })], spacing: { after: sub ? 20 : 120 } }));
    if (sub) children_.push(new Paragraph({ children: [run(sub, { size: 21 })], spacing: { after: 120 } }));
  };
  const notary = (forWhom: string) => {
    P([run(`STATE OF TEXAS\t\t§`, {})], { after: 40 });
    P([run(`COUNTY OF ${FILING === BLANK ? BLANK : FILING}\t§`, {})], { after: 120 });
    P([run(`SWORN TO AND SUBSCRIBED before me by ${forWhom} on this ______ day of ________________, 20____.`)], { after: 200 });
    sigLine("Notary Public, State of Texas");
  };

  P([run("DISTRIBUTEES", { bold: true, caps: true })], { before: 320, after: 120 });
  const applicant = S(contact.name);
  sigLine(applicant ? `${applicant}, Distributee / Affiant` : "Distributee / Affiant", applicant && S(contact.rel) ? `(${S(contact.rel)} of the decedent)` : undefined);
  notary(applicant || BLANK);
  sigLine("Distributee / Affiant");
  notary(BLANK);

  P([run("DISINTERESTED WITNESSES", { bold: true, caps: true })], { before: 320, after: 120 });
  P([run("Each of the undersigned, being duly sworn, states: I knew the decedent and the decedent's family history. I have no interest in the decedent's estate and do not inherit from it. The facts stated above concerning the decedent's family history are true and correct.")], { after: 200 });
  for (const w of [witnesses[0], witnesses[1]]) {
    const who = w?.name || "";
    sigLine(who ? `${who}, Disinterested Witness` : "Disinterested Witness", w && (w.rel || w.contact) ? [w.rel, w.contact].filter(Boolean).join(" · ") : undefined);
    notary(who || BLANK);
  }

  P([run("APPROVAL BY THE COURT", { bold: true, caps: true })], { before: 320, after: 120 });
  P([run(`The foregoing Small Estate Affidavit, having been examined by the Court and found to comply with Chapter 205 of the Texas Estates Code, is APPROVED this ______ day of ________________, 20____, and is ordered filed and recorded in the Small Estate records of ${FILING === BLANK ? BLANK : `${FILING} County`}, Texas.`)], { after: 240 });
  sigLine("JUDGE PRESIDING");

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE, color: "000000" } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1660, left: 1440 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              run(`DRAFT — SMALL ESTATE AFFIDAVIT — ESTATE OF ${NAME}`, { size: 18 }),
              new TextRun({ children: ["\t", "Page "], font: FONT, size: 18, color: "000000" }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "000000" }),
              new TextRun({ children: [" of "], font: FONT, size: 18, color: "000000" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: "000000" }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } },
          })],
        }),
      },
      children: children_,
    }],
  });
  return Packer.toBuffer(doc);
}
