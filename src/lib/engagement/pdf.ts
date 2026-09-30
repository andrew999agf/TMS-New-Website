import "server-only";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { buildEngagementLetterPreview, letterFileName, type LetterData } from "./letter";
import { FIRM } from "@/lib/firm";

/**
 * The engagement letter as a PDF — what clients receive and sign. Rendered
 * from the same filled template as the .docx (via the preview paragraphs), so
 * the text is word-for-word identical; a PDF can't be quietly edited the way
 * a Word file can. A signed letter gets the signature block appended.
 */

export type SignatureRecord = {
  kind: "typed" | "drawn";
  /** Cursive-rendered name for a typed signature. */
  typedName?: string;
  /** PNG (base64, no data: prefix) for a drawn signature. */
  imagePngBase64?: string;
  /** Typed initials, stamped at every "Client Initials:" blank. */
  initials?: string;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  ip?: string;
};

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 72;
const SIZE = 11.5;
const LEADING = 15.5;
const INK = rgb(0.1, 0.1, 0.12);

/** WinAnsi-safe text: strip zero-width chars, swap anything unencodable. */
const safe = (s: string) =>
  s
    .replace(/[​-‏﻿]/g, "")
    .replace(/[^\x00-\xFF‘’“”–—•…]/g, "?");

type Word = { text: string; strike: boolean };

export async function buildEngagementLetterPdf(d: LetterData, sig?: SignatureRecord): Promise<Buffer> {
  const paras = await buildEngagementLetterPreview(d);
  const pdf = await PDFDocument.create();
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  pdf.setTitle(letterFileName(d).replace(/\.docx$/, ""));
  pdf.setAuthor(FIRM.name);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const maxW = PAGE_W - MARGIN * 2;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // Letterhead: firm name + rule, once, on page one.
  const head = safe(FIRM.name);
  const headW = timesBold.widthOfTextAtSize(head, 17);
  page.drawText(head, { x: (PAGE_W - headW) / 2, y, size: 17, font: timesBold, color: INK });
  y -= 16;
  const sub = "ATTORNEY AT LAW";
  const subW = times.widthOfTextAtSize(sub, 8.5);
  page.drawText(sub, { x: (PAGE_W - subW) / 2, y, size: 8.5, font: times, color: INK });
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: INK });
  y -= 22;

  /** Draw one paragraph with wrapping; words carry their own strike flag. */
  const drawPara = (p: { text: string; bold: boolean; center: boolean; indent: boolean; segs?: { text: string; strike: boolean }[] }) => {
    const font: PDFFont = p.bold ? timesBold : times;
    const indent = p.indent ? 28 : 0;
    const width = maxW - indent;
    // Tokenize into words that remember their strike flag.
    const words: Word[] = [];
    const segs = p.segs ?? [{ text: p.text, strike: false }];
    for (const s of segs) {
      for (const w of safe(s.text).split(/(\s+)/)) {
        if (w !== "") words.push({ text: w, strike: s.strike });
      }
    }
    // Greedy wrap into lines.
    const lines: Word[][] = [];
    let line: Word[] = [];
    let lineW = 0;
    for (const w of words) {
      const wW = font.widthOfTextAtSize(w.text, SIZE);
      if (lineW + wW > width && line.length && w.text.trim() !== "") {
        lines.push(line);
        line = [];
        lineW = 0;
        if (w.text.trim() === "") continue; // don't start a line with a space
      }
      line.push(w);
      lineW += wW;
    }
    if (line.length) lines.push(line);

    for (const ln of lines) {
      newPageIfNeeded(LEADING);
      const lnW = ln.reduce((a, w) => a + font.widthOfTextAtSize(w.text, SIZE), 0);
      let x = p.center ? (PAGE_W - lnW) / 2 : MARGIN + indent;
      for (const w of ln) {
        const wW = font.widthOfTextAtSize(w.text, SIZE);
        if (w.text.trim() !== "") page.drawText(w.text, { x, y, size: SIZE, font, color: INK });
        if (w.strike && w.text.trim() !== "") {
          page.drawLine({ start: { x, y: y + SIZE * 0.32 }, end: { x: x + wW, y: y + SIZE * 0.32 }, thickness: 0.9, color: INK });
        }
        x += wW;
      }
      y -= LEADING;
    }
  };

  for (const p of paras) {
    if (p.text.trim() === "") {
      y -= LEADING * 0.55; // blank paragraph = spacing
      continue;
    }
    drawPara(p);
    y -= 4; // paragraph gap
  }

  if (sig) await appendSignature(pdf, sig, { times, timesBold, timesItalic });

  return Buffer.from(await pdf.save());
}

/**
 * Put the e-signature ON the signature line: locate the signer's printed
 * name (searching from the last page backward, so the greeting on page one
 * is never matched) and draw the signature just above it. Returns whether
 * the anchor was found; callers append the record page either way.
 */
export async function stampSignatureOnPdf(pdfBytes: Buffer, sig: SignatureRecord, anchorText: string, offset: { dx?: number; dy?: number } = {}): Promise<{ buf: Buffer; stamped: boolean }> {
  let found: { page: number; x: number; y: number } | null = null;
  // Whitespace-insensitive: Word's small-caps runs come back letter-spaced
  // ("W A N D A …"), so both sides are compared with spaces stripped.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const needle = norm(safe(anchorText)).slice(0, 15);
  if (needle.length >= 4) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
      for (let i = doc.numPages; i >= 1 && !found; i--) {
        const tc = await (await doc.getPage(i)).getTextContent();
        // Group items into visual lines by their y position, keeping the
        // leftmost x — an anchor split across runs still matches whole.
        const lines = new Map<number, { x: number; y: number; text: string }>();
        for (const raw of tc.items) {
          const it = raw as { str?: string; transform?: number[] };
          if (!it.str || !it.transform) continue;
          const key = Math.round(it.transform[5] * 2) / 2;
          const line = lines.get(key);
          if (line) {
            line.text += it.str;
            line.x = Math.min(line.x, it.transform[4]);
          } else {
            lines.set(key, { x: it.transform[4], y: it.transform[5], text: it.str });
          }
        }
        for (const line of lines.values()) {
          if (norm(line.text).startsWith(needle)) {
            found = { page: i, x: line.x, y: line.y };
            break;
          }
        }
      }
      await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
    } catch {
      found = null; // fall through to the record page only
    }
  }
  if (!found) return { buf: pdfBytes, stamped: false };

  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const page = pdf.getPage(found.page - 1);
  const dx = offset.dx ?? 0;
  const dy = offset.dy ?? 6;
  if (sig.kind === "drawn" && sig.imagePngBase64) {
    try {
      const png = await pdf.embedPng(Buffer.from(sig.imagePngBase64, "base64"));
      const h = 38;
      const w = (png.width / png.height) * h;
      page.drawImage(png, { x: found.x + dx, y: found.y + dy - 6, width: Math.min(w, 220), height: h });
    } catch {
      const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      page.drawText(safe(sig.typedName || sig.signerName), { x: found.x + dx, y: found.y + dy, size: 19, font: italic, color: INK });
    }
  } else {
    const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    page.drawText(safe(sig.typedName || sig.signerName), { x: found.x + dx, y: found.y + dy, size: 19, font: italic, color: INK });
  }
  return { buf: Buffer.from(await pdf.save()), stamped: true };
}

/** Stamp plain text (e.g. the signing date) onto an anchored line, same
 *  last-page-first anchor search as the signature stamp. */
export async function stampTextOnPdf(pdfBytes: Buffer, text: string, anchorText: string, offset: { dx?: number; dy?: number } = {}): Promise<{ buf: Buffer; stamped: boolean }> {
  let found: { page: number; x: number; y: number } | null = null;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const needle = norm(safe(anchorText)).slice(0, 15);
  if (needle.length >= 4) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
      for (let i = doc.numPages; i >= 1 && !found; i--) {
        const tc = await (await doc.getPage(i)).getTextContent();
        const lines = new Map<number, { x: number; y: number; text: string }>();
        for (const raw of tc.items) {
          const it = raw as { str?: string; transform?: number[] };
          if (!it.str || !it.transform) continue;
          const key = Math.round(it.transform[5] * 2) / 2;
          const line = lines.get(key);
          if (line) { line.text += it.str; line.x = Math.min(line.x, it.transform[4]); }
          else lines.set(key, { x: it.transform[4], y: it.transform[5], text: it.str });
        }
        for (const line of lines.values()) {
          if (norm(line.text).startsWith(needle)) { found = { page: i, x: line.x, y: line.y }; break; }
        }
      }
      await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
    } catch { found = null; }
  }
  if (!found) return { buf: pdfBytes, stamped: false };
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  pdf.getPage(found.page - 1).drawText(safe(text), { x: found.x + (offset.dx ?? 0), y: found.y + (offset.dy ?? 4), size: 12, font: times, color: INK });
  return { buf: Buffer.from(await pdf.save()), stamped: true };
}

/** Stamp text on EVERY line that starts with the anchor, on every page —
 *  used to drop the client's initials into each "Client Initials:" blank in
 *  the letter body. Italic, sized to sit in the blank. */
export async function stampTextOnAllAnchors(pdfBytes: Buffer, text: string, anchorText: string, offset: { dx?: number; dy?: number } = {}): Promise<{ buf: Buffer; count: number }> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const needle = norm(safe(anchorText)).slice(0, 15);
  const hits: { page: number; x: number; y: number }[] = [];
  if (needle.length >= 4) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
      for (let i = 1; i <= doc.numPages; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        const lines = new Map<number, { x: number; y: number; text: string }>();
        for (const raw of tc.items) {
          const it = raw as { str?: string; transform?: number[] };
          if (!it.str || !it.transform) continue;
          const key = Math.round(it.transform[5] * 2) / 2;
          const line = lines.get(key);
          if (line) { line.text += it.str; line.x = Math.min(line.x, it.transform[4]); }
          else lines.set(key, { x: it.transform[4], y: it.transform[5], text: it.str });
        }
        for (const line of lines.values()) {
          if (norm(line.text).startsWith(needle)) hits.push({ page: i, x: line.x, y: line.y });
        }
      }
      await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
    } catch { /* no hits — nothing stamped */ }
  }
  if (!hits.length) return { buf: pdfBytes, count: 0 };
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  for (const h of hits) {
    pdf.getPage(h.page - 1).drawText(safe(text), { x: h.x + (offset.dx ?? 86), y: h.y + (offset.dy ?? 2), size: 13, font: italic, color: INK });
  }
  return { buf: Buffer.from(await pdf.save()), count: hits.length };
}

/** Append an e-signature page to ANY letter PDF (generated or uploaded). */
export async function appendSignaturePageToPdf(pdfBytes: Buffer, sig: SignatureRecord): Promise<Buffer> {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  await appendSignature(pdf, sig, { times, timesBold, timesItalic });
  return Buffer.from(await pdf.save());
}

async function appendSignature(
  pdf: PDFDocument,
  sig: SignatureRecord,
  f: { times: PDFFont; timesBold: PDFFont; timesItalic: PDFFont },
): Promise<void> {
  const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const line = (text: string, font: PDFFont, size: number, gap = 16) => {
    page.drawText(safe(text), { x: MARGIN, y, size, font, color: INK });
    y -= gap;
  };

  line("ELECTRONIC SIGNATURE", f.timesBold, 13, 10);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: INK });
  y -= 26;
  line("Signed and agreed:", f.times, SIZE, 30);

  if (sig.kind === "drawn" && sig.imagePngBase64) {
    try {
      const png = await pdf.embedPng(Buffer.from(sig.imagePngBase64, "base64"));
      const w = Math.min(240, png.width);
      const h = (png.height / png.width) * w;
      y -= Math.max(0, h - 30);
      page.drawImage(png, { x: MARGIN, y, width: w, height: h });
      y -= 10;
    } catch {
      /* a bad image falls back to the typed name below */
      page.drawText(safe(sig.signerName), { x: MARGIN, y, size: 24, font: f.timesItalic, color: INK });
      y -= 12;
    }
  } else {
    page.drawText(safe(sig.typedName || sig.signerName), { x: MARGIN, y, size: 26, font: f.timesItalic, color: INK });
    y -= 14;
  }

  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 260, y }, thickness: 0.8, color: INK });
  y -= 18;
  line(sig.signerName, f.timesBold, SIZE, 15);
  line(sig.signerEmail, f.times, 10.5, 15);
  if (sig.initials) line(`Initials applied at each initial blank: ${sig.initials}`, f.times, 10.5, 15);
  const when = sig.signedAt.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "short" });
  line(`Signed electronically on ${when} (Central)${sig.ip ? ` from IP ${sig.ip}` : ""}.`, f.times, 10.5, 15);
  line("The signer affirmed that this electronic signature has the same force and effect as a handwritten signature.", f.times, 9.5, 14);
}

export function letterPdfFileName(d: Pick<LetterData, "clientName" | "businessName">, signed = false): string {
  return letterFileName(d).replace(/\.docx$/, signed ? " (signed).pdf" : ".pdf");
}
