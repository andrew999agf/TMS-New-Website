import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, PageNumber, Packer, Paragraph,
  Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from "docx";
import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";

/**
 * Table-of-contents generator for share folders — litigation-grade output in
 * two real formats: a modern Word file (.docx, built with the docx OOXML
 * library — no legacy tricks) and a PDF (pdf-lib). Both are styled like a
 * Texas pleading: cause number, the party/court caption with the § column, a
 * centered TABLE OF CONTENTS title, then the documents grouped by sub-folder
 * in ruled tables — Tab No. | Date | Description. Caption fields the folder
 * doesn't have render as fill-in blanks, never guesses.
 */

export type TocFolder = {
  name: string;
  caseNumber: string;
  court: string;
  county: string;
  plaintiff: string;
  defendant: string;
};

const BLANK = "____________________";

/* --------------------------------- model --------------------------------- */

type TocRow = { n: number; date: string; title: string };
type TocGroup = { heading: string; rows: TocRow[]; empty: boolean };
export type TocModel = {
  cause: string;
  plaintiff: string;
  defendant: string;
  courtLine: string;
  countyLine: string;
  title: string;
  subtitle: string;
  countLine: string;
  scopeName: string;
  footerText: string;
  groups: TocGroup[];
  total: number;
};

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Small words kept lowercase in title case (unless first/last). */
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "v", "vs", "with"]);

/** Common legal/business acronyms forced to caps even from lowercase names. */
const ACRONYMS = new Set(["rfp", "rfa", "rog", "rogs", "llc", "llp", "pllc", "pc", "msj", "tro", "ti", "dwq", "qme", "ucc", "hoa", "cps", "dfps", "tdcj", "txdot", "irs", "emc", "uim", "pip", "hipaa", "dtpa", "tcpa"]);

/**
 * Best-effort cleanup of a file name into a document title:
 * drop the extension, leading index numbers ("01 - ", "003."), underscores,
 * long Bates-style digit runs and ranges, then title-case — preserving tokens
 * that are already all-caps (RFP, LLC) and existing mixed-case words.
 */
export function improveTitle(base: string): string {
  let s = base.replace(/\.[a-z0-9]{2,5}$/i, "");
  s = s.replace(/^[\s._-]*\d{1,4}[\s._)-]+(?=\S)/, ""); // leading index numbers
  s = s.replace(/[_]+/g, " ");
  s = s.replace(/\b\d{5,}\s*[-–]\s*\d{3,}\b/g, " "); // bates ranges 000123-000456
  s = s.replace(/\b\d{6,}\b/g, " "); // long bare digit runs
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim().replace(/[\s,;:-]+$/, "");
  if (!s) s = base.replace(/\.[a-z0-9]{2,5}$/i, "");
  const words = s.split(" ");
  // A fully shouted name ("SMITH DEPOSITION VOL 1") gets title-cased wholesale;
  // all-caps tokens are treated as acronyms only inside mixed-case names.
  const allShout = words.every((w) => !/[a-z]/.test(w));
  return words
    .map((w, i) => {
      if (!allShout && w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w; // acronyms
      if (/[a-z].*[A-Z]|[A-Z].*[a-z].*[A-Z]/.test(w)) return w; // existing mixed case (McDonald)
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower.replace(/[^a-z]/g, ""))) return w.toUpperCase();
      if (i !== 0 && i !== words.length - 1 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const plainTitle = (base: string) => base.replace(/\.[a-z0-9]{2,5}$/i, "");

export function buildTocModel(
  folder: TocFolder,
  scope: string,
  files: { filename: string; createdAt: Date | null }[],
  allDirs: string[],
  now: Date,
  cleanTitles: boolean,
): TocModel {
  const prefix = scope ? `${scope}/` : "";
  const inScope = files
    .filter((f) => (scope ? f.filename.startsWith(prefix) : true))
    .map((f) => ({ rel: f.filename.slice(prefix.length), at: f.createdAt }));

  const groupsMap = new Map<string, { base: string; at: Date | null }[]>();
  for (const f of inScope) {
    const i = f.rel.lastIndexOf("/");
    const dir = i >= 0 ? f.rel.slice(0, i) : "";
    const base = i >= 0 ? f.rel.slice(i + 1) : f.rel;
    if (!groupsMap.has(dir)) groupsMap.set(dir, []);
    groupsMap.get(dir)!.push({ base, at: f.at });
  }
  // Registered-but-empty sub-folders still get a heading so the index shows the
  // folder's full shape.
  for (const d of allDirs) {
    const rel = scope ? (d === scope ? "" : d.startsWith(prefix) ? d.slice(prefix.length) : null) : d;
    if (rel === null || rel === "") continue;
    if (!groupsMap.has(rel)) groupsMap.set(rel, []);
  }

  const scopeName = scope ? scope.split("/").pop()! : folder.name;
  const keys = ["", ...[...groupsMap.keys()].filter((k) => k !== "").sort(natural)];
  let n = 0;
  const groups: TocGroup[] = [];
  for (const dir of keys) {
    const entries = (groupsMap.get(dir) ?? []).slice().sort((a, b) => natural(a.base, b.base));
    if (dir === "" && entries.length === 0) continue;
    const heading = dir === ""
      ? (keys.length > 1 ? scopeName.toUpperCase() : "")
      : dir.split("/").join("  /  ").toUpperCase();
    const rows = entries.map((e) => {
      n++;
      return {
        n,
        date: e.at ? new Date(e.at).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }) : "",
        title: cleanTitles ? improveTitle(e.base) : plainTitle(e.base),
      };
    });
    groups.push({ heading, rows, empty: rows.length === 0 });
  }

  const causeNum = folder.caseNumber.trim();
  return {
    cause: causeNum ? `CAUSE NO. ${causeNum.toUpperCase().replace(/^(CAUSE\s+)?NO\.?\s*/i, "")}` : `CAUSE NO. ${BLANK}`,
    plaintiff: (folder.plaintiff.trim() || BLANK).toUpperCase(),
    defendant: (folder.defendant.trim() || BLANK).toUpperCase(),
    courtLine: folder.court.trim() ? `IN THE ${folder.court.trim().toUpperCase().replace(/^IN THE\s+/i, "")}` : `IN THE ${BLANK}`,
    countyLine: folder.county.trim() ? `${folder.county.trim().toUpperCase().replace(/\s+COUNTY.*$/i, "")} COUNTY, TEXAS` : `${BLANK} COUNTY, TEXAS`,
    title: "TABLE OF CONTENTS",
    subtitle: scope ? `${scopeName} — ${folder.name}` : scopeName,
    countLine: `${n} document${n === 1 ? "" : "s"}  ·  as of ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    scopeName,
    footerText: `Table of Contents — ${scopeName}`,
    groups,
    total: n,
  };
}

export const tocFileBase = (m: TocModel) => `Table of Contents — ${m.scopeName.replace(/[\\/:*?"<>|]/g, "-").trim() || "folder"}`;

/* --------------------------------- DOCX ---------------------------------- */

const FONT = "Century Schoolbook";
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const LINE = { style: BorderStyle.SINGLE, size: 6, color: "222222" } as const;

const run = (text: string, opts: { bold?: boolean; caps?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 24, bold: opts.bold, smallCaps: opts.caps, italics: opts.italics });

export async function tocToDocx(m: TocModel): Promise<Buffer> {
  const noBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
  const allBorders = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };

  const capCell = (children: Paragraph[], widthPct: number) =>
    new TableCell({ children, width: { size: widthPct, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER } });
  const capP = (text: string, opts: { indent?: boolean; bold?: boolean } = {}) =>
    new Paragraph({ children: [run(text, { bold: opts.bold })], indent: opts.indent ? { left: 720 } : undefined, spacing: { after: 40 } });
  const sect = (text: string) => new Paragraph({ children: [run(text)], alignment: AlignmentType.CENTER, spacing: { after: 40 } });

  const capRow = (left: Paragraph, right: Paragraph | null) =>
    new TableRow({ children: [capCell([left], 44), capCell([sect("§")], 6), capCell(right ? [right] : [new Paragraph("")], 50)] });

  const caption = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      capRow(capP(`${m.plaintiff},`), capP(m.courtLine)),
      capRow(capP("Plaintiff,", { indent: true }), null),
      capRow(capP("V."), capP(m.countyLine)),
      capRow(capP(`${m.defendant},`), null),
      capRow(capP("Defendant.", { indent: true }), null),
    ],
  });

  const idxHeader = new TableRow({
    tableHeader: true,
    children: [
      ["TAB", 12], ["DATE", 16], ["DESCRIPTION", 72],
    ].map(([label, w]) => new TableCell({
      children: [new Paragraph({ children: [run(String(label), { bold: true, size: 19 })], alignment: label === "DESCRIPTION" ? AlignmentType.LEFT : AlignmentType.CENTER })],
      width: { size: Number(w), type: WidthType.PERCENTAGE },
      shading: { fill: "F1EDE4" },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
    })),
  });

  const idxRow = (r: TocRow) => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [run(String(r.n))], alignment: AlignmentType.CENTER })], margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE } }),
      new TableCell({ children: [new Paragraph({ children: [run(r.date || "")], alignment: AlignmentType.CENTER })], margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE } }),
      new TableCell({ children: [new Paragraph({ children: [run(r.title)] })], margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE } }),
    ],
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [run(m.cause, { bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 280 } }),
    caption,
    new Paragraph({ children: [run(m.title, { bold: true, caps: true, size: 30 })], alignment: AlignmentType.CENTER, spacing: { before: 320, after: 60 } }),
    new Paragraph({ children: [run(m.subtitle, { caps: true, size: 24 })], alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
    new Paragraph({ children: [run(m.countLine, { italics: true, size: 21 })], alignment: AlignmentType.CENTER, spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 8 } } }),
  ];
  for (const g of m.groups) {
    if (g.heading) children.push(new Paragraph({ children: [run(g.heading, { bold: true, caps: true })], spacing: { before: 240, after: 100 } }));
    if (g.empty) { children.push(new Paragraph({ children: [run("(No documents.)", { italics: true, size: 21 })], indent: { left: 360 }, spacing: { after: 120 } })); continue; }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: allBorders, rows: [idxHeader, ...g.rows.map(idxRow)] }));
  }
  if (m.total === 0 && m.groups.length === 0) children.push(new Paragraph({ children: [run("(No documents in this folder yet.)", { italics: true })] }));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1660, left: 1440 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              run(m.footerText, { caps: true, size: 19 }),
              new TextRun({ children: ["\t", "Page "], font: FONT, size: 19 }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 19 }),
              new TextRun({ children: [" of "], font: FONT, size: 19 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 19 }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "888888", space: 4 } },
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

/* ---------------------------------- PDF ----------------------------------- */

const M = 72; // 1" margins
const PW = PageSizes.Letter[0]; // 612
const PH = PageSizes.Letter[1]; // 792
const CONTENT_W = PW - M * 2;
const INK = rgb(0.08, 0.08, 0.08);
const RULE = rgb(0.55, 0.52, 0.47);

export async function tocToPdf(m: TocModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  let page = pdf.addPage([PW, PH]);
  let y = PH - M;

  const wrap = (text: string, f = font, size = 12, width = CONTENT_W): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) <= width) cur = t;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  const text = (s: string, x: number, yy: number, f = font, size = 12) => page.drawText(s, { x, y: yy, font: f, size, color: INK });
  const center = (s: string, yy: number, f = font, size = 12) => text(s, M + (CONTENT_W - f.widthOfTextAtSize(s, size)) / 2, yy, f, size);
  const newPage = () => { page = pdf.addPage([PW, PH]); y = PH - M; };

  /* caption */
  center(m.cause, y - 12, bold, 12);
  y -= 40;
  const L = M, SX = M + CONTENT_W * 0.47, R = M + CONTENT_W * 0.53;
  const capRows: { left: string; leftIndent?: boolean; right?: string }[] = [
    { left: `${m.plaintiff},`, right: m.courtLine },
    { left: "Plaintiff,", leftIndent: true },
    { left: "V.", right: m.countyLine },
    { left: `${m.defendant},` },
    { left: "Defendant.", leftIndent: true },
  ];
  for (const rrow of capRows) {
    const leftLines = wrap(rrow.left, font, 12, CONTENT_W * 0.44);
    const rightLines = rrow.right ? wrap(rrow.right, font, 12, CONTENT_W * 0.45) : [];
    const rows = Math.max(leftLines.length, rightLines.length, 1);
    for (let i = 0; i < rows; i++) {
      y -= 16;
      if (leftLines[i]) text(leftLines[i], L + (rrow.leftIndent ? 36 : 0), y);
      text("§", SX, y);
      if (rightLines[i]) text(rightLines[i], R, y);
    }
  }

  /* title block */
  y -= 44;
  center(m.title, y, bold, 15);
  y -= 20;
  center(m.subtitle.toUpperCase(), y, font, 11.5);
  y -= 16;
  center(m.countLine, y, italic, 10);
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.7, color: RULE });
  y -= 8;

  /* index tables: Tab | Date | Description with a full ruled grid */
  const cTab = M, wTab = 52, cDate = cTab + wTab, wDate = 76, cDesc = cDate + wDate, wDesc = CONTENT_W - wTab - wDate;
  const drawHeaderRow = () => {
    const h = 20;
    if (y - h < M + 40) newPage();
    page.drawRectangle({ x: M, y: y - h, width: CONTENT_W, height: h, color: rgb(0.945, 0.929, 0.894) });
    [[cTab, wTab, "TAB"], [cDate, wDate, "DATE"], [cDesc, wDesc, "DESCRIPTION"]].forEach(([x, w, label]) => {
      page.drawRectangle({ x: Number(x), y: y - h, width: Number(w), height: h, borderWidth: 0.7, borderColor: INK });
      const lx = label === "DESCRIPTION" ? Number(x) + 6 : Number(x) + (Number(w) - bold.widthOfTextAtSize(String(label), 8)) / 2;
      text(String(label), lx, y - h + 6.5, bold, 8);
    });
    y -= h;
  };
  const drawRow = (r: TocRow) => {
    const lines = wrap(r.title, font, 10.5, wDesc - 12);
    const h = Math.max(18, lines.length * 12.5 + 6);
    if (y - h < M + 40) { newPage(); drawHeaderRow(); }
    [[cTab, wTab], [cDate, wDate], [cDesc, wDesc]].forEach(([x, w]) => page.drawRectangle({ x: Number(x), y: y - h, width: Number(w), height: h, borderWidth: 0.7, borderColor: INK }));
    const baseY = y - 13;
    text(String(r.n), cTab + (wTab - font.widthOfTextAtSize(String(r.n), 10.5)) / 2, baseY, font, 10.5);
    if (r.date) text(r.date, cDate + (wDate - font.widthOfTextAtSize(r.date, 10.5)) / 2, baseY, font, 10.5);
    lines.forEach((ln, i) => text(ln, cDesc + 6, baseY - i * 12.5, font, 10.5));
    y -= h;
  };

  for (const g of m.groups) {
    if (g.heading) {
      if (y < M + 90) newPage();
      y -= 22;
      text(g.heading, M, y, bold, 11);
      y -= 8;
    } else {
      y -= 10;
    }
    if (g.empty) { y -= 14; text("(No documents.)", M + 18, y, italic, 10); y -= 6; continue; }
    drawHeaderRow();
    for (const r of g.rows) drawRow(r);
    y -= 6;
  }
  if (m.total === 0 && m.groups.length === 0) { y -= 20; text("(No documents in this folder yet.)", M, y, italic, 11); }

  /* footer with page numbers — stamped after the page count is known */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 14 }, end: { x: PW - M, y: M - 14 }, thickness: 0.6, color: RULE });
    p.drawText(m.footerText.toUpperCase(), { x: M, y: M - 26, font, size: 7.5, color: INK });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: PW - M - font.widthOfTextAtSize(pn, 7.5), y: M - 26, font, size: 7.5, color: INK });
  });

  return pdf.save();
}
