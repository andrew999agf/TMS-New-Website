import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { FIRM } from "@/lib/firm";
import { loadLogoBytes } from "@/lib/billing/report";

/** Info shared by both export formats. */
export type AnswerDoc = { folder: string; caseNumber?: string; question: string; answerHtml: string; answeredAt?: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

/* --------------------------------- Word (.doc) --------------------------------- */

/** A Word-openable HTML document. Word reads HTML with an msword content-type, so
 *  this preserves bold / italic / underline / lists / highlight exactly. */
export function answerWordDoc(d: AnswerDoc): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(d.folder)} — Answer</title></head>
<body style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;font-size:12pt;line-height:1.5">
  <p style="color:#7a1f2b;font-size:10pt;letter-spacing:1pt;text-transform:uppercase;margin:0 0 6pt">${esc(FIRM.name)}</p>
  <p style="font-size:16pt;font-weight:bold;margin:0 0 2pt">${esc(d.folder)}</p>
  ${d.caseNumber ? `<p style="color:#555;font-size:10pt;margin:0 0 2pt">Case: ${esc(d.caseNumber)}</p>` : ""}
  ${d.answeredAt ? `<p style="color:#555;font-size:10pt;margin:0 0 12pt">Answered ${esc(fmt(d.answeredAt))}</p>` : ""}
  <hr />
  <p style="font-weight:bold;margin:12pt 0 4pt">Question / Task</p>
  <p style="margin:0 0 12pt">${esc(d.question)}</p>
  <p style="font-weight:bold;margin:12pt 0 4pt">Answer</p>
  <div>${d.answerHtml || "<p><i>No answer provided.</i></p>"}</div>
</body></html>`;
}

/* ----------------------------------- PDF ----------------------------------- */

type Run = { text: string; bold: boolean; italic: boolean };
type Line = { indent: number; prefix: string; runs: Run[] };

function decode(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Parse the limited answer HTML into styled lines for pdf-lib. Highlight and
 *  underline aren't drawn here — the Word export carries full fidelity. */
function parseAnswer(html: string): Line[] {
  const lines: Line[] = [];
  const list: { type: "ul" | "ol"; count: number }[] = [];
  const style = { bold: 0, italic: 0 };
  let cur: Line = { indent: 0, prefix: "", runs: [] };
  let buf = "";
  const flush = () => { if (buf) { cur.runs.push({ text: buf, bold: style.bold > 0, italic: style.italic > 0 }); buf = ""; } };
  const endLine = () => { flush(); if (cur.runs.some((r) => r.text.trim()) || cur.prefix) lines.push(cur); cur = { indent: list.length, prefix: "", runs: [] }; };

  const re = /<(\/?)([a-z0-9]+)[^>]*>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[3] != null) { buf += decode(m[3]); continue; }
    const close = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "b" || tag === "strong") style.bold = Math.max(0, style.bold + (close ? -1 : 1));
    else if (tag === "i" || tag === "em") style.italic = Math.max(0, style.italic + (close ? -1 : 1));
    else if (tag === "br") { flush(); endLine(); }
    else if (tag === "p" || tag === "div") { endLine(); }
    else if (tag === "ul" || tag === "ol") { if (!close) list.push({ type: tag, count: 0 }); else list.pop(); endLine(); }
    else if (tag === "li") {
      if (!close) { endLine(); const top = list[list.length - 1]; if (top) { top.count++; cur.prefix = top.type === "ol" ? `${top.count}.` : "•"; cur.indent = list.length; } }
      else endLine();
    }
  }
  endLine();
  return lines;
}

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54, RIGHT = PAGE_W - MARGIN;
const MAROON = rgb(0.478, 0.122, 0.169), INK = rgb(0.09, 0.09, 0.09), GRAY = rgb(0.45, 0.45, 0.45);
const clean = (s: string) => s.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function renderAnswerPdf(d: AnswerDoc): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItal = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const pick = (r: Run): PDFFont => (r.bold && r.italic ? boldItal : r.bold ? bold : r.italic ? ital : reg);

  const logo = await loadLogoBytes();
  let img: PDFImage | null = null;
  if (logo) { try { img = logo.type === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes); } catch { img = null; } }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };

  if (img) {
    const scale = Math.min(180 / img.width, 60 / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    y -= h; page.drawImage(img, { x: MARGIN, y, width: w, height: h }); y -= 14;
  } else {
    page.drawText(FIRM.name, { x: MARGIN, y: y - 14, size: 15, font: bold, color: MAROON }); y -= 22;
  }
  page.drawText(clean(d.folder), { x: MARGIN, y, size: 15, font: bold, color: INK }); y -= 16;
  if (d.caseNumber) { page.drawText(`Case: ${clean(d.caseNumber)}`, { x: MARGIN, y, size: 10, font: reg, color: GRAY }); y -= 12; }
  if (d.answeredAt) { page.drawText(`Answered ${fmt(d.answeredAt)}`, { x: MARGIN, y, size: 10, font: reg, color: GRAY }); y -= 12; }
  y -= 6; page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 1, color: MAROON }); y -= 22;

  page.drawText("Question / Task", { x: MARGIN, y, size: 11, font: bold, color: INK }); y -= 15;
  y = drawWrapped(page, [{ indent: 0, prefix: "", runs: [{ text: d.question, bold: false, italic: false }] }], reg, pick, y, () => { newPage(); return y; });
  y -= 12;
  page.drawText("Answer", { x: MARGIN, y, size: 11, font: bold, color: INK }); y -= 15;

  const lines = parseAnswer(d.answerHtml);
  if (lines.length === 0) { page.drawText("No answer provided.", { x: MARGIN, y, size: 11, font: ital, color: GRAY }); }
  else drawWrapped(page, lines, reg, pick, y, () => { newPage(); return y; });

  return Buffer.from(await doc.save());

  // Renders styled lines with word-wrap and list indents; paginates via onBreak.
  function drawWrapped(pg: typeof page, ls: Line[], base: PDFFont, fontFor: (r: Run) => PDFFont, startY: number, onBreak: () => number): number {
    const size = 11, lh = 16;
    let yy = startY;
    for (const line of ls) {
      const x0 = MARGIN + line.indent * 16;
      let x = x0;
      if (line.prefix) { pg.drawText(line.prefix, { x, y: yy, size, font: base, color: INK }); x = x0 + 16; }
      const contIndent = line.prefix ? x0 + 16 : x0;
      for (const run of line.runs) {
        const f = fontFor(run);
        const words = clean(run.text).split(/(\s+)/);
        for (const w of words) {
          if (!w) continue;
          const ww = f.widthOfTextAtSize(w, size);
          if (x + ww > RIGHT && x > contIndent) { yy -= lh; x = contIndent; if (yy < MARGIN + 20) { onBreak(); yy = PAGE_H - MARGIN; pg = page; } if (/^\s+$/.test(w)) continue; }
          pg.drawText(w, { x, y: yy, size, font: f, color: INK });
          x += ww;
        }
      }
      yy -= lh;
      if (yy < MARGIN + 20) { onBreak(); yy = PAGE_H - MARGIN; pg = page; }
    }
    return yy;
  }
}
