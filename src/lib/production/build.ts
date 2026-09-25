import "server-only";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, type PDFFont, type PDFPage } from "pdf-lib";
import { FIRM, PRINCIPAL_OFFICE } from "@/lib/firm";

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export const batesLabel = (prefix: string, n: number) => `${prefix}${String(n).padStart(6, "0")}`;

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

function isPdf(contentType: string | null | undefined, name: string) {
  return contentType === "application/pdf" || /\.pdf$/i.test(name);
}
function isImage(contentType: string | null | undefined, name: string) {
  return IMAGE_TYPES.has((contentType ?? "").toLowerCase()) || /\.(jpe?g|png)$/i.test(name);
}

/** Draw one Bates label bottom-right of a page, on a white backing box so it
 *  stays legible over dark scans. */
function stampPage(page: PDFPage, font: PDFFont, label: string) {
  const { width } = page.getSize();
  const size = 10;
  const textW = font.widthOfTextAtSize(label, size);
  const x = width - textW - 24;
  const y = 14;
  page.drawRectangle({ x: x - 4, y: y - 3, width: textW + 8, height: size + 6, color: rgb(1, 1, 1), opacity: 0.85 });
  page.drawText(label, { x, y, size, font, color: rgb(0, 0, 0) });
}

export type StampResult = { bytes: Uint8Array; pages: number };

/**
 * Bates-stamp one client document. PDFs get a label on every page; JPEG/PNG
 * photos become a one-page PDF carrying the image. Anything else returns null
 * (produced as-is is not allowed — a Bates number must be visible).
 */
export async function stampToPdf(bytes: Uint8Array, contentType: string | null | undefined, name: string, prefix: string, startNum: number): Promise<StampResult | null> {
  if (isPdf(contentType, name)) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    pages.forEach((page, i) => stampPage(page, font, batesLabel(prefix, startNum + i)));
    return { bytes: await doc.save(), pages: pages.length };
  }
  if (isImage(contentType, name)) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const img = /png$/i.test(name) || contentType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    // Letter-size page, image fit inside with margins.
    const page = doc.addPage([612, 792]);
    const maxW = 612 - 72, maxH = 792 - 90;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: (612 - w) / 2, y: 792 - 36 - h, width: w, height: h });
    stampPage(page, font, batesLabel(prefix, startNum));
    return { bytes: await doc.save(), pages: 1 };
  }
  return null;
}

/** Merge stamped PDFs, in Bates order, into the single production file. */
export async function mergeProductionPdf(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  return out.save();
}

export type LetterOpts = {
  caseName: string;
  causeNumber: string;
  court: string;
  seq: number;
  batesFrom: string;
  batesTo: string;
  link: string;
  date: Date;
};

/**
 * The short production cover letter on the firm's text letterhead: RE block
 * with the case style and "Nth Production", two-sentence body, and the
 * clickable production link.
 */
export async function buildProductionLetter(opts: LetterOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([612, 792]);
  const M = 72;
  let y = 792 - M;

  const center = (text: string, f: PDFFont, size: number) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (612 - w) / 2, y, size, font: f });
    y -= size + 4;
  };
  // Text letterhead (swapped for the designed letterhead when one is set up).
  center(FIRM.name, bold, 16);
  center(`${PRINCIPAL_OFFICE.street}, ${PRINCIPAL_OFFICE.city}, ${PRINCIPAL_OFFICE.state} ${PRINCIPAL_OFFICE.zip}`, font, 10);
  center(`Tel ${PRINCIPAL_OFFICE.phone} · Fax ${FIRM.fax} · ${FIRM.email}`, font, 10);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: rgb(0.48, 0.12, 0.17) });
  y -= 28;

  const line = (text: string, f: PDFFont = font, size = 11, indent = 0) => {
    page.drawText(text, { x: M + indent, y, size, font: f });
    y -= size + 6;
  };

  line(opts.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  y -= 12;
  line("Via email", bold, 11);
  y -= 8;
  line(`RE:  ${opts.caseName}`, bold, 11);
  if (opts.causeNumber) line(`Cause No. ${opts.causeNumber}${opts.court ? `, ${opts.court}` : ""}`, font, 11, 26);
  line(`${ordinal(opts.seq)} Production — ${opts.batesFrom} through ${opts.batesTo}`, bold, 11, 26);
  y -= 14;
  line("Counsel:");
  y -= 4;

  const body = `Please see the enclosed ${ordinal(opts.seq).toLowerCase()} production, Bates numbered ${opts.batesFrom} through ${opts.batesTo}. If the production is too large to email, it can be found at the following link:`;
  // simple word wrap
  const words = body.split(" ");
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, 11) > 612 - 2 * M) { line(cur); cur = w; }
    else cur = test;
  }
  if (cur) line(cur);
  y -= 8;

  // clickable link
  const linkSize = 11;
  const linkW = font.widthOfTextAtSize(opts.link, linkSize);
  page.drawText(opts.link, { x: M, y, size: linkSize, font, color: rgb(0.1, 0.2, 0.6) });
  const annot = doc.context.obj({
    Type: PDFName.of("Annot"), Subtype: PDFName.of("Link"),
    Rect: [M, y - 3, M + linkW, y + linkSize + 2],
    Border: [0, 0, 0],
    A: { Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(opts.link) },
  });
  page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(annot)]));
  y -= linkSize + 26;

  line("Respectfully,");
  y -= 22;
  line(FIRM.attorney.displayName, bold, 11);
  line(`State Bar No. ${FIRM.attorney.barNumber}`, font, 10);
  line(FIRM.email, font, 10);

  return doc.save();
}