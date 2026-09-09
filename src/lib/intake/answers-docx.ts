import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, PageNumber, Packer, Paragraph,
  TabStopType, TextRun,
} from "docx";
import type { AnswerSection } from "@/lib/intake/answers-pdf";

/**
 * Law-firm-style Word document of an intake or questionnaire submission —
 * for the INTAKE TEAM only (the client gets the PDF copy instead). Clean
 * litigation formatting: Times New Roman, 12 pt, black text throughout, a
 * centered title block, ruled section headings, label/value lines, and a
 * footer with the title and page numbers.
 */

const FONT = "Times New Roman";
const SIZE = 24; // 12 pt (docx half-points)

const run = (text: string, opts: { bold?: boolean; caps?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? SIZE, bold: opts.bold, smallCaps: opts.caps, italics: opts.italics, color: "000000" });

export type AnswersDocxInput = {
  firmName: string;
  formTitle: string;
  submittedAt: Date;
  clientName?: string;
  contact?: { email?: string; phone?: string };
  warnings?: string[];
  sections: AnswerSection[];
};

export async function answersDocx(input: AnswersDocxInput): Promise<Buffer> {
  const when = input.submittedAt.toLocaleString("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const children: Paragraph[] = [
    new Paragraph({ children: [run(input.firmName.toUpperCase(), { bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
    new Paragraph({ children: [run(input.formTitle.toUpperCase(), { bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
    new Paragraph({
      children: [run(`Submitted ${when} (Central)${input.clientName ? ` by ${input.clientName}` : ""}`, { italics: true, size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 10 } },
    }),
  ];

  const contactBits = [input.contact?.email, input.contact?.phone].filter(Boolean);
  if (contactBits.length) {
    children.push(new Paragraph({
      children: [run("Contact:  ", { bold: true }), run(contactBits.join("  ·  "))],
      spacing: { before: 120, after: 120 },
    }));
  }

  if (input.warnings?.length) {
    children.push(new Paragraph({
      children: [run("FOR ATTORNEY REVIEW", { bold: true })],
      spacing: { before: 120, after: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 6 } },
    }));
    for (const w of input.warnings) {
      children.push(new Paragraph({ children: [run(w, { bold: true })], bullet: { level: 0 }, spacing: { after: 40 } }));
    }
    children.push(new Paragraph({
      children: [run("", { size: 2 })],
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 6 } },
    }));
  }

  for (const sec of input.sections) {
    const items = sec.items.filter((it) => it.value.trim());
    if (!items.length) continue;
    children.push(new Paragraph({
      children: [run(sec.title.toUpperCase(), { bold: true })],
      spacing: { before: 240, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } },
    }));
    for (const it of items) {
      const valueRuns = it.value.split(/\r?\n/).flatMap((line, i) => (i === 0 ? [run(line)] : [new TextRun({ break: 1 }), run(line)]));
      children.push(new Paragraph({
        children: [run(`${it.label}:  `, { bold: true }), ...valueRuns],
        spacing: { after: 80 },
        indent: { left: 360, hanging: 360 },
      }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE, color: "000000" } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1660, left: 1440 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              run(input.formTitle.toUpperCase(), { size: 18 }),
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
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
