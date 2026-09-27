import { PDFDocument, rgb } from "pdf-lib";

/**
 * Page-level staging support: build the PDF that actually goes to the
 * yellow pile from a client document — just the selected pages, with any
 * review-stage REDACTIONS BURNED IN as opaque rectangles (a produced copy
 * must never contain the content under a redaction; highlights and notes
 * are internal work product and are never carried over).
 *
 * Rects are normalized 0-1 with a top-left origin (how the browser drew
 * them); PDF space puts the origin bottom-left, so y flips here.
 *
 * No "server-only" import so the unit tests can exercise it directly.
 */

export type RedactionMark = { page: number; rect: { x: number; y: number; w: number; h: number } };

export async function buildStagedPdf(
  bytes: Uint8Array,
  pages: number[] | null,
  excludePages: number[],
  redactions: RedactionMark[],
): Promise<{ bytes: Uint8Array; includedPages: number[]; totalPages: number } | null> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const excluded = new Set(excludePages);
  const wanted = (pages && pages.length ? pages : Array.from({ length: total }, (_, i) => i + 1))
    .map((p) => Math.floor(p))
    .filter((p) => p >= 1 && p <= total && !excluded.has(p));
  const included = [...new Set(wanted)].sort((a, b) => a - b);
  if (included.length === 0) return null;
  const burns = redactions.filter((r) => included.includes(r.page) && r.rect && r.rect.w > 0 && r.rect.h > 0);

  // Whole document, nothing to burn: byte-identical passthrough (matters for
  // pre-labeled material staged as-is).
  if (included.length === total && burns.length === 0) {
    return { bytes, includedPages: included, totalPages: total };
  }

  const out = included.length === total ? src : await PDFDocument.create();
  if (out !== src) {
    const copied = await out.copyPages(src, included.map((p) => p - 1));
    for (const pg of copied) out.addPage(pg);
  }
  for (const burn of burns) {
    const pg = out.getPage(included.indexOf(burn.page));
    const { width, height } = pg.getSize();
    const r = burn.rect;
    pg.drawRectangle({
      x: Math.max(0, r.x) * width,
      y: height - Math.min(1, r.y + r.h) * height,
      width: Math.min(1, r.w) * width,
      height: Math.min(1, r.h) * height,
      color: rgb(0, 0, 0),
    });
  }
  return { bytes: await out.save(), includedPages: included, totalPages: total };
}

/** "1-3, 7, 9-12" from a sorted page list — for staged-copy names. */
export function compressPageRanges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(i === j ? String(pages[i]) : `${pages[i]}-${pages[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}
