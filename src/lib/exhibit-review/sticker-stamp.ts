import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { STICKER_W, STICKER_H, wrapTitle, type StickerSpec } from "./stickers";

const hexRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

/**
 * Draw the sticker on page 1 of a PDF: a rounded colored label with a thin
 * black edge, the party line(s), the exhibit number large, and the cause
 * number small — the look of a printed exhibit label. Position and size come
 * from the spec (fractions of the page), so the same settings land in the
 * same corner whatever the page size.
 */
export async function stampSticker(src: Uint8Array, spec: StickerSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(src, { ignoreEncryption: true });
  const page = pdf.getPage(0);
  const { width: pw, height: ph } = page.getSize();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const s = spec.scale;
  const w = STICKER_W * s, h = STICKER_H * s;
  const x = Math.min(Math.max(0, spec.x * pw), pw - w);
  const yTop = Math.min(Math.max(0, spec.y * ph), ph - h);
  const y = ph - yTop - h; // pdf-lib's origin is bottom-left
  const r = 4 * s;

  // Rounded rectangle. drawSvgPath reads path coordinates top-down from the
  // origin it is given, so hand it the page top as origin and top-left coords.
  const sy = yTop;
  const path = `M ${x + r} ${sy} H ${x + w - r} Q ${x + w} ${sy} ${x + w} ${sy + r} V ${sy + h - r} Q ${x + w} ${sy + h} ${x + w - r} ${sy + h} H ${x + r} Q ${x} ${sy + h} ${x} ${sy + h - r} V ${sy + r} Q ${x} ${sy} ${x + r} ${sy} Z`;
  page.drawSvgPath(path, { x: 0, y: ph, color: hexRgb(spec.hex), borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 * s });

  const pad = 5 * s;
  const innerW = w - pad * 2;
  const black = rgb(0, 0, 0);
  const centered = (text: string, size: number, font: typeof bold, baseline: number) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: x + (w - tw) / 2, y: baseline, size, font, color: black });
  };

  // Title: shrink the font until the longest wrapped line fits.
  let titleSize = 7 * s;
  let lines = wrapTitle(spec.title, 22);
  for (let i = 0; i < 6; i++) {
    const widest = Math.max(...lines.map((l) => bold.widthOfTextAtSize(l, titleSize)));
    if (widest <= innerW) break;
    titleSize *= 0.92;
    lines = wrapTitle(spec.title, Math.floor(22 * (7 * s) / titleSize));
  }
  const titleLH = titleSize * 1.15;
  const caseSize = 5.5 * s;
  const hasCase = !!spec.caseLine;
  // Number fills what is left between the title block and the case line.
  const numSize = Math.max(9 * s, Math.min(18 * s, h - pad * 2 - lines.length * titleLH - (hasCase ? caseSize * 1.6 : 0) - 2 * s));

  let cursor = y + h - pad - titleSize; // baseline of first title line
  for (const l of lines) { centered(l, titleSize, bold, cursor); cursor -= titleLH; }
  const numBaseline = y + pad + (hasCase ? caseSize * 1.6 : 0) + (cursor + titleLH - (y + pad + (hasCase ? caseSize * 1.6 : 0)) - numSize) / 2 + numSize * 0.22;
  {
    let ns = numSize;
    while (bold.widthOfTextAtSize(spec.number, ns) > innerW && ns > 6) ns *= 0.9;
    centered(spec.number, ns, bold, numBaseline);
  }
  if (hasCase) {
    let cs = caseSize;
    while (reg.widthOfTextAtSize(spec.caseLine, cs) > innerW && cs > 3.5) cs *= 0.92;
    centered(spec.caseLine, cs, reg, y + pad * 0.8);
  }
  return pdf.save();
}
