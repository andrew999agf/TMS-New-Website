import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, PageNumber, Packer, Paragraph,
  Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from "docx";

/**
 * Exhibit-list export for the exhibit reviewer, in two formats:
 *
 *  - A court-filing-style Word document (.docx): Texas-pleading caption from
 *    the set's cause number / style / court, a centered "PLAINTIFF'S EXHIBIT
 *    LIST" (etc.) title, then the standard trial table — No. | Description
 *    (with Bates) | Offered | Objection | Admitted | Excluded — with the
 *    ruling columns left blank for use at trial.
 *
 *  - A CSV spreadsheet that opens in Excel (or pastes straight into a Word
 *    table): one row per exhibit with every field spelled out.
 *
 * Omitted exhibits are off the list and never appear in either.
 */

export type ExportDoc = {
  side: string; number: number | null; label: string; title: string; description: string;
  bates: string; batesEnd: string; pageCount: number | null; isVideo: boolean;
  witnessNames: string[]; presentNames: string[]; offerStatus: string; trialStatus: string;
};

export type ExportSet = { name: string; causeNumber: string; court: string };

const BLANK = "____________________";
const SIDE_TITLE: Record<string, string> = {
  plaintiff: "PLAINTIFF'S EXHIBIT LIST",
  defendant: "DEFENDANT'S EXHIBIT LIST",
  joint: "JOINT EXHIBIT LIST",
};
const SIDE_HEADING: Record<string, string> = { plaintiff: "PLAINTIFF'S EXHIBITS", defendant: "DEFENDANT'S EXHIBITS", joint: "JOINT EXHIBITS" };
const SIDE_RANK: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };

export function orderExportDocs(docs: ExportDoc[]): ExportDoc[] {
  return docs.slice().sort((a, b) =>
    (SIDE_RANK[a.side] ?? 9) - (SIDE_RANK[b.side] ?? 9) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** "RES No.1 Trust v. Tommy Morgan" → plaintiff/defendant halves; the whole
 *  name as plaintiff (defendant blank) when there's no " v. " to split on. */
function splitStyle(name: string): { plaintiff: string; defendant: string } {
  const m = name.match(/^(.*?)\s+v(?:s)?\.?\s+(.*)$/i);
  if (m && m[1].trim() && m[2].trim()) return { plaintiff: m[1].trim(), defendant: m[2].trim() };
  return { plaintiff: name.trim(), defendant: "" };
}

/** "220th District Court (Bosque County)" → court + county caption lines. */
function captionLines(court: string): { courtLine: string; countyLine: string } {
  const county = court.match(/\(([^)]*?)\s*county\)/i)?.[1]?.trim() ?? "";
  const courtOnly = court.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return {
    courtLine: courtOnly ? `IN THE ${courtOnly.toUpperCase().replace(/^IN THE\s+/i, "")}` : `IN THE ${BLANK}`,
    countyLine: county ? `${county.toUpperCase()} COUNTY, TEXAS` : `${BLANK} COUNTY, TEXAS`,
  };
}

export function exportTitle(side: string): string {
  return SIDE_TITLE[side] ?? "EXHIBIT LIST";
}

export function exportFileBase(set: ExportSet, side: string): string {
  const nice = exportTitle(side).toLowerCase().split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  const cause = set.causeNumber.trim();
  return `${nice}${cause ? ` — ${cause}` : ""}`.replace(/[\\/:*?"<>|]/g, "-");
}

/* --------------------------------- DOCX ---------------------------------- */

const FONT = "Century Schoolbook";
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const LINE = { style: BorderStyle.SINGLE, size: 6, color: "222222" } as const;

const run = (text: string, opts: { bold?: boolean; caps?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 24, bold: opts.bold, smallCaps: opts.caps, italics: opts.italics });

const batesRange = (a: string, b: string) => (a && b && b !== a ? `${a}–${b}` : a || b);

export async function exhibitListDocx(set: ExportSet, docs: ExportDoc[], side: string): Promise<Buffer> {
  const { plaintiff, defendant } = splitStyle(set.name);
  const { courtLine, countyLine } = captionLines(set.court);
  const cause = set.causeNumber.trim()
    ? `CAUSE NO. ${set.causeNumber.trim().toUpperCase().replace(/^(CAUSE\s+)?NO\.?\s*/i, "")}`
    : `CAUSE NO. ${BLANK}`;

  const noBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
  const allBorders = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };

  const capCell = (children: Paragraph[], widthPct: number) =>
    new TableCell({ children, width: { size: widthPct, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER } });
  const capP = (text: string, opts: { indent?: boolean } = {}) =>
    new Paragraph({ children: [run(text)], indent: opts.indent ? { left: 720 } : undefined, spacing: { after: 40 } });
  const sect = () => new Paragraph({ children: [run("§")], alignment: AlignmentType.CENTER, spacing: { after: 40 } });
  const capRow = (left: Paragraph, right: Paragraph | null) =>
    new TableRow({ children: [capCell([left], 44), capCell([sect()], 6), capCell(right ? [right] : [new Paragraph("")], 50)] });

  const caption = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      capRow(capP(`${(plaintiff || BLANK).toUpperCase()},`), capP(courtLine)),
      capRow(capP("Plaintiff,", { indent: true }), null),
      capRow(capP("V."), capP(countyLine)),
      capRow(capP(`${(defendant || BLANK).toUpperCase()},`), null),
      capRow(capP("Defendant.", { indent: true }), null),
    ],
  });

  const COLS: [string, number][] = [["NO.", 8], ["DESCRIPTION", 52], ["OFFERED", 10], ["OBJECTION", 10], ["ADMITTED", 10], ["EXCLUDED", 10]];
  const header = new TableRow({
    tableHeader: true,
    children: COLS.map(([label, w]) => new TableCell({
      children: [new Paragraph({ children: [run(label, { bold: true, size: 18 })], alignment: label === "DESCRIPTION" ? AlignmentType.LEFT : AlignmentType.CENTER })],
      width: { size: w, type: WidthType.PERCENTAGE },
      shading: { fill: "F1EDE4" },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
    })),
  });

  const cell = (paras: Paragraph[], center = false) =>
    new TableCell({ children: paras.length ? paras : [new Paragraph("")], verticalAlign: center ? VerticalAlign.CENTER : VerticalAlign.TOP, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE } });

  const row = (d: ExportDoc) => {
    const desc: Paragraph[] = [new Paragraph({ children: [run(d.title || "Exhibit")] })];
    const meta = [batesRange(d.bates, d.batesEnd), d.isVideo ? "Video" : ""].filter(Boolean).join("  ·  ");
    if (meta) desc.push(new Paragraph({ children: [run(meta, { size: 19, italics: true })] }));
    return new TableRow({
      children: [
        cell([new Paragraph({ children: [run(d.label || String(d.number ?? ""))], alignment: AlignmentType.CENTER })], true),
        cell(desc),
        cell([]), cell([]), cell([]), cell([]),
      ],
    });
  };

  const title = exportTitle(side);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [run(cause, { bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 280 } }),
    caption,
    new Paragraph({ children: [run(title, { bold: true, caps: true, size: 30 })], alignment: AlignmentType.CENTER, spacing: { before: 320, after: 240 } }),
  ];

  // A single-side list holds only that side — even if the caller passed more.
  const ordered = orderExportDocs(side === "all" ? docs : docs.filter((d) => d.side === side));
  if (side === "all") {
    for (const s of ["plaintiff", "defendant", "joint"]) {
      const group = ordered.filter((d) => d.side === s);
      if (!group.length) continue;
      children.push(new Paragraph({ children: [run(SIDE_HEADING[s] ?? s.toUpperCase(), { bold: true, caps: true })], spacing: { before: 240, after: 100 } }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: allBorders, rows: [header, ...group.map(row)] }));
    }
  } else {
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: allBorders, rows: [header, ...ordered.map(row)] }));
  }
  if (ordered.length === 0) children.push(new Paragraph({ children: [run("(No exhibits.)", { italics: true })] }));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1660, left: 1440 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              run(title, { caps: true, size: 19 }),
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

/* ---------------------------------- CSV ----------------------------------- */

const OFFER_LABEL: Record<string, string> = { expect: "Expect to offer", need: "If the need arises", omit: "Marked omit" };
const STATUS_LABEL: Record<string, string> = { admitted: "Admitted", pending: "Offered — pending", excluded: "Excluded" };

/** Excel-friendly CSV (UTF-8 BOM, quoted) — one row per exhibit. Paste-ready
 *  for a Word exhibit-list table via Excel. */
export function exhibitListCsv(docs: ExportDoc[]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Side", "Exhibit No.", "Title", "Description", "Bates Begin", "Bates End", "Pages", "Admit Through", "May Also Present To", "Offer Plan", "Trial Status"];
  const lines = [head.join(",")];
  for (const d of orderExportDocs(docs)) {
    lines.push([
      esc(d.side.charAt(0).toUpperCase() + d.side.slice(1)),
      esc(d.label || (d.number ?? "")),
      esc(d.title),
      esc(d.description),
      esc(d.bates),
      esc(d.batesEnd),
      esc(d.isVideo ? "Video" : d.pageCount ?? ""),
      esc(d.witnessNames.join("; ")),
      esc(d.presentNames.join("; ")),
      esc(OFFER_LABEL[d.offerStatus] ?? ""),
      esc(STATUS_LABEL[d.trialStatus] ?? ""),
    ].join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
