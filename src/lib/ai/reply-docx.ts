import "server-only";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";

/**
 * Turn an AI.fred reply (markdown) into a proper Word document — Times New
 * Roman 12pt, 1" margins, real bold/headings/lists/tables — so a drafted
 * letter or memo lands in Word ready to letterhead and send. Covers the same
 * markdown subset the chat window renders; anything else falls back to plain
 * paragraphs.
 */

const FONT = "Times New Roman";
const SIZE = 24; // 12 pt in half-points

const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|[\s:|-]+\|\s*$/;
const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const RULE = /^\s*([-_*])\1{2,}\s*$/;

/** Inline markdown → styled runs. */
function runs(text: string, base: { bold?: boolean } = {}): TextRun[] {
  const out: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (t: string, o: { bold?: boolean; italics?: boolean; mono?: boolean } = {}) => {
    if (!t) return;
    out.push(new TextRun({ text: t, font: o.mono ? "Courier New" : FONT, size: SIZE, bold: o.bold || base.bold, italics: o.italics, color: "000000" }));
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) push(t.slice(2, -2), { bold: true });
    else if (t.startsWith("`")) push(t.slice(1, -1), { mono: true });
    else push(t.slice(1, -1), { italics: true });
    last = m.index + t.length;
  }
  if (last < text.length) push(text.slice(last));
  return out.length ? out : [new TextRun({ text: "", font: FONT, size: SIZE })];
}

const CELL_LINE = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const CELL_BORDERS = { top: CELL_LINE, bottom: CELL_LINE, left: CELL_LINE, right: CELL_LINE };

export async function replyToDocx(content: string, title: string): Promise<Buffer> {
  const lines = content.replace(/<br\s*\/?>/gi, "\n").replace(/```[\w+-]*\n?/g, "").split("\n");
  const children: (Paragraph | Table)[] = [];
  let i = 0;
  const spacing = { after: 160 };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (TABLE_LINE.test(line)) {
      const rows: string[][] = [];
      let sawSep = false;
      while (i < lines.length && TABLE_LINE.test(lines[i])) {
        if (TABLE_SEP.test(lines[i])) { sawSep = true; i++; continue; }
        rows.push(lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
        i++;
      }
      const head = sawSep && rows.length > 1 ? rows[0] : null;
      const bodyRows = head ? rows.slice(1) : rows;
      const toRow = (cells: string[], bold: boolean) =>
        new TableRow({
          children: cells.map((c) =>
            new TableCell({
              borders: CELL_BORDERS,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: runs(c, { bold }) })],
            }),
          ),
        });
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [...(head ? [toRow(head, true)] : []), ...bodyRows.map((r) => toRow(r, false))],
        }),
        new Paragraph({ children: [], spacing: { after: 120 } }),
      );
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      children.push(new Paragraph({
        heading: h[1].length <= 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 160 },
        children: runs(h[2].trim(), { bold: true }),
      }));
      i++;
      continue;
    }

    if (RULE.test(line)) {
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } }, children: [], spacing }));
      i++;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      let n = 1;
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const text = lines[i].replace(LIST_ITEM, "").trim();
        children.push(
          ordered
            ? new Paragraph({ indent: { left: 720, hanging: 360 }, spacing: { after: 80 }, children: [new TextRun({ text: `${n}.\t`, font: FONT, size: SIZE }), ...runs(text)] })
            : new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: runs(text) }),
        );
        n++;
        i++;
      }
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !TABLE_LINE.test(lines[i]) && !HEADING.test(lines[i]) && !LIST_ITEM.test(lines[i]) && !RULE.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    // Keep intentional single line breaks (address blocks, signature blocks).
    const parts = para.join("\n").split("\n");
    const inner: TextRun[] = [];
    parts.forEach((p, pi) => {
      if (pi > 0) inner.push(new TextRun({ text: "", break: 1 }));
      inner.push(...runs(p));
    });
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing, children: inner }));
  }

  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: FONT, size: SIZE, color: "000000" } } } },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
