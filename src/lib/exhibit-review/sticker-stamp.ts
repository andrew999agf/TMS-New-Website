import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { STICKER_W, STICKER_H, layoutSticker, type StickerSpec } from "./stickers";

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
  const r = 4.5 * s;

  // Rounded rectangle. drawSvgPath reads path coordinates top-down from the
  // origin it is given, so hand it the page top as origin and top-left coords.
  const sy = yTop;
  const path = `M ${x + r} ${sy} H ${x + w - r} Q ${x + w} ${sy} ${x + w} ${sy + r} V ${sy + h - r} Q ${x + w} ${sy + h} ${x + w - r} ${sy + h} H ${x + r} Q ${x} ${sy + h} ${x} ${sy + h - r} V ${sy + r} Q ${x} ${sy} ${x + r} ${sy} Z`;
  page.drawSvgPath(path, { x: 0, y: ph, color: hexRgb(spec.hex), borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.9 * s });

  const measure = (text: string, size: number, isBold: boolean) => (isBold ? bold : reg).widthOfTextAtSize(text, size);
  const L = layoutSticker(spec, measure);
  const black = rgb(0, 0, 0);
  // Positions in the layout are measured from the sticker's top; convert to
  // pdf-lib's bottom-up y for a given baseline/line.
  const Y = (fromTop: number) => y + h - fromTop;
  const drawCentered = (text: string, size: number, font: typeof bold, baselineFromTop: number, tracking = 0) => {
    const width = font.widthOfTextAtSize(text, size) + tracking * Math.max(0, text.length - 1);
    let cx = x + (w - width) / 2;
    if (tracking > 0) {
      for (const ch of text) { page.drawText(ch, { x: cx, y: Y(baselineFromTop), size, font, color: black }); cx += font.widthOfTextAtSize(ch, size) + tracking; }
    } else {
      page.drawText(text, { x: cx, y: Y(baselineFromTop), size, font, color: black });
    }
  };
  L.title.lines.forEach((line, i) => drawCentered(line, L.title.size, bold, L.title.top + L.title.size * 0.95 + i * L.title.lineH, L.title.tracking));
  drawCentered(L.number.text, L.number.size, bold, L.number.baseline);
  if (L.rule) page.drawLine({ start: { x: x + L.pad, y: Y(L.rule.y) }, end: { x: x + w - L.pad, y: Y(L.rule.y) }, thickness: 0.5 * s, color: rgb(0.15, 0.15, 0.15) });
  if (L.caseLine) drawCentered(L.caseLine.text, L.caseLine.size, reg, L.caseLine.baseline);
  return pdf.save();
}
