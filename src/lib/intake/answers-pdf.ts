import "server-only";
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Clean "what you submitted" PDF shared by every intake pathway — the main
 * intake forms and the standalone questionnaires. Firm header, form title,
 * date, any attorney-review flags in a highlighted banner, then each section
 * as label/value rows. Attached to the client's confirmation email (their
 * copy) and to the intake team's notification.
 */

export type AnswerItem = { label: string; value: string; flag?: boolean };
export type AnswerSection = { title: string; items: AnswerItem[] };
export type AnswersPdfInput = {
  firmName: string;
  formTitle: string;
  submittedAt: Date;
  clientName?: string;
  warnings?: string[];
  sections: AnswerSection[];
  /** Footer disclaimer line. */
  disclaimer?: string;
};

const M = 54;
const PW = PageSizes.Letter[0];
const PH = PageSizes.Letter[1];
const W = PW - M * 2;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.42, 0.38);
const ACCENT = rgb(0.48, 0.12, 0.17);
const RED = rgb(0.7, 0.15, 0.12);
const RULE = rgb(0.85, 0.82, 0.78);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(probe, size) <= width) { line = probe; continue; }
      if (line) out.push(line);
      // A single over-long word gets hard-broken.
      let piece = w;
      while (font.widthOfTextAtSize(piece, size) > width && piece.length > 4) {
        let cut = piece.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut--;
        out.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }
      line = piece;
    }
    if (line) out.push(line);
  }
  return out;
}

/** pdf-lib's WinAnsi can't take arbitrary Unicode — flatten what we can. */
const clean = (s: string) => s
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/–/g, "-").replace(/—/g, "--").replace(/…/g, "...")
  .replace(/·|•/g, "-").replace(/≤/g, "<=").replace(/≥/g, ">=")
  .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ]/g, "?");

export async function answersPdf(input: AnswersPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page: PDFPage = pdf.addPage([PW, PH]);
  let y = PH - M;
  const ensure = (need: number) => {
    if (y - need < M + 26) { page = pdf.addPage([PW, PH]); y = PH - M; }
  };
  const text = (s: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) => {
    const f = opts.font ?? body, size = opts.size ?? 10.5, width = opts.width ?? W, x = opts.x ?? M;
    for (const line of wrap(clean(s), f, size, width)) {
      ensure(size + 3);
      page.drawText(line, { x, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= size + (opts.gap ?? 3);
    }
  };

  // Header
  text(input.firmName.toUpperCase(), { font: bold, size: 10, color: ACCENT, gap: 6 });
  text(input.formTitle, { font: bold, size: 16, gap: 4 });
  const when = input.submittedAt.toLocaleString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  text(`Submitted ${when} (Central)${input.clientName ? ` by ${input.clientName}` : ""}`, { color: MUTED, size: 9.5, gap: 10 });
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: RULE });
  y -= 14;

  // Attorney-review flags
  if (input.warnings?.length) {
    const lines = input.warnings.flatMap((w) => wrap(clean(`- ${w}`), body, 10, W - 24));
    const boxH = 16 + lines.length * 13 + 8;
    ensure(boxH + 8);
    page.drawRectangle({ x: M, y: y - boxH, width: W, height: boxH, color: rgb(0.99, 0.94, 0.93), borderColor: RED, borderWidth: 0.8 });
    let by = y - 14;
    page.drawText("FOR ATTORNEY REVIEW", { x: M + 12, y: by, size: 9, font: bold, color: RED });
    by -= 14;
    for (const line of lines) { page.drawText(line, { x: M + 12, y: by, size: 10, font: body, color: RED }); by -= 13; }
    y -= boxH + 14;
  }

  // Sections
  const labelW = 170;
  for (const sec of input.sections) {
    ensure(34);
    text(sec.title.toUpperCase(), { font: bold, size: 11, color: ACCENT, gap: 6 });
    for (const item of sec.items) {
      const v = item.value.trim();
      if (!v) continue;
      const label = clean(item.label);
      const valueLines = wrap(clean(v), body, 10.5, W - labelW - 12);
      const rowH = Math.max(14, valueLines.length * 13.5) + 4;
      ensure(rowH);
      const top = y;
      const labelLines = wrap(label, bold, 8.5, labelW - 6);
      let ly = top - 9;
      for (const l of labelLines.slice(0, 3)) { page.drawText(l, { x: M, y: ly, size: 8.5, font: bold, color: MUTED }); ly -= 10.5; }
      let vy = top - 10.5;
      for (const l of valueLines) { page.drawText(l, { x: M + labelW, y: vy, size: 10.5, font: body, color: item.flag ? RED : INK }); vy -= 13.5; }
      y = top - rowH;
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: PW - M, y: y + 2 }, thickness: 0.4, color: RULE });
      y -= 4;
    }
    y -= 8;
  }

  // Footer on every page: disclaimer + page numbers.
  const disclaimer = clean(input.disclaimer ?? `${input.formTitle} - information gathering only; not legal advice; no attorney-client relationship is created by this submission.`);
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const foot = wrap(disclaimer, italic, 7.5, W - 70);
    let fy = M - 18 + (foot.length - 1) * 9;
    for (const line of foot) { p.drawText(line, { x: M, y: fy, size: 7.5, font: italic, color: MUTED }); fy -= 9; }
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: PW - M - body.widthOfTextAtSize(pn, 8), y: M - 18, size: 8, font: body, color: MUTED });
  });

  return pdf.save();
}
