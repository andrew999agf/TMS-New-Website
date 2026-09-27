import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, PDFName, PDFString, type PDFFont, type PDFPage } from "pdf-lib";
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

/** How the Bates label looks on the page — the user picks these in the
 *  staging dialog; every field is optional and falls back to the classic
 *  bottom-right / Helvetica / black / 10pt stamp. */
export type StampStyle = {
  position?: "bottom-right" | "bottom-left" | "bottom-center";
  font?: "helvetica" | "helvetica-bold" | "times" | "courier";
  color?: "black" | "red" | "blue" | "gray";
  /** Point size, clamped 6–24. */
  size?: number;
};

export const STAMP_FONTS: Record<NonNullable<StampStyle["font"]>, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  "helvetica-bold": StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
};

const STAMP_COLORS: Record<NonNullable<StampStyle["color"]>, ReturnType<typeof rgb>> = {
  black: rgb(0, 0, 0),
  red: rgb(0.72, 0.11, 0.11),
  blue: rgb(0.1, 0.2, 0.6),
  gray: rgb(0.35, 0.35, 0.35),
};

const stampSize = (style?: StampStyle) => Math.min(24, Math.max(6, Math.round(Number(style?.size) || 10)));

/** Fixed distances from the page's VISUAL bottom edge and corner, identical
 *  on every page no matter its size. */
const STAMP_MARGIN_X = 24;
const STAMP_MARGIN_Y = 14;

/**
 * Draw one Bates label along the bottom edge — plain text, no backing box.
 *
 * Placement is computed in DISPLAY coordinates and then mapped into the
 * page's raw coordinate space: scanned PDFs routinely carry a /Rotate flag
 * (the raw page is sideways and the viewer spins it) and crop boxes that
 * don't start at (0,0). Ignoring either puts a fixed-offset stamp somewhere
 * random — including clean off the visible page. This maps both, so the
 * label always sits the same distance from the visual bottom and corner.
 */
function stampPage(page: PDFPage, font: PDFFont, label: string, style?: StampStyle) {
  const size = stampSize(style);
  const textW = font.widthOfTextAtSize(label, size);
  const color = STAMP_COLORS[style?.color ?? "black"] ?? STAMP_COLORS.black;

  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const box = page.getCropBox(); // the visible area (defaults to the media box)
  const visW = rot === 90 || rot === 270 ? box.height : box.width;

  // Where the label goes on the page AS DISPLAYED (origin: visual bottom-left).
  const vx = style?.position === "bottom-left" ? STAMP_MARGIN_X
    : style?.position === "bottom-center" ? Math.max(STAMP_MARGIN_X, (visW - textW) / 2)
    : Math.max(STAMP_MARGIN_X, visW - textW - STAMP_MARGIN_X);
  const vy = STAMP_MARGIN_Y;

  // Map visual → raw coordinates for the page's rotation, inside the crop box.
  let x = vx, y = vy;
  if (rot === 90) { x = box.width - vy; y = vx; }
  else if (rot === 180) { x = box.width - vx; y = box.height - vy; }
  else if (rot === 270) { x = vy; y = box.height - vx; }
  page.drawText(label, { x: box.x + x, y: box.y + y, size, font, color, rotate: degrees(rot) });
}

export type StampResult = { bytes: Uint8Array; pages: number };

/**
 * Bates-stamp one client document. PDFs get a label on every page; JPEG/PNG
 * photos become a one-page PDF carrying the image. Anything else returns null
 * (produced as-is is not allowed — a Bates number must be visible).
 */
export async function stampToPdf(bytes: Uint8Array, contentType: string | null | undefined, name: string, prefix: string, startNum: number, stamp = true, style?: StampStyle): Promise<StampResult | null> {
  const fontName = STAMP_FONTS[style?.font ?? "helvetica"] ?? StandardFonts.Helvetica;
  if (isPdf(contentType, name)) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    // Pre-labeled material passes through byte-identical; only count pages.
    if (!stamp) return { bytes, pages: doc.getPageCount() };
    const font = await doc.embedFont(fontName);
    const pages = doc.getPages();
    pages.forEach((page, i) => stampPage(page, font, batesLabel(prefix, startNum + i), style));
    return { bytes: await doc.save(), pages: pages.length };
  }
  if (isImage(contentType, name)) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(fontName);
    const img = /png$/i.test(name) || contentType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    // Letter-size page, image fit inside with margins.
    const page = doc.addPage([612, 792]);
    const maxW = 612 - 72, maxH = 792 - 90;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: (612 - w) / 2, y: 792 - 36 - h, width: w, height: h });
    if (stamp) stampPage(page, font, batesLabel(prefix, startNum), style);
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
  line(opts.batesFrom ? `${ordinal(opts.seq)} Production — ${opts.batesFrom} through ${opts.batesTo}` : `${ordinal(opts.seq)} Production`, bold, 11, 26);
  y -= 14;
  line("Counsel:");
  y -= 4;

  const body = opts.batesFrom
    ? `Please see the enclosed ${ordinal(opts.seq).toLowerCase()} production, Bates numbered ${opts.batesFrom} through ${opts.batesTo}. If the production is too large to email, it can be found at the following link:`
    : `Please see the enclosed ${ordinal(opts.seq).toLowerCase()} production. If the production is too large to email, it can be found at the following link:`;
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