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

/**
 * The record-keeping half of pulling pages OUT of a staged Bates copy: given
 * the copy's current per-page arrays and the 1-based pages being dropped,
 * produce every remapped column. Pure so the unit tests can hammer it.
 *  - pageBates: the kept pages KEEP the numbers already stamped on them, so
 *    the run gets a gap (materialized from batesStart when not yet tracked).
 *  - sourcePages: materialized 1:1 for whole-file copies, so the pulled
 *    pages unlock in the red tab.
 *  - aiSections: retitled per kept page, contiguous runs collapsed.
 */
export function remapAfterPull(
  doc: { batesStart: number; pageText: unknown; pageNotes: unknown; aiSections: unknown; sourcePages: unknown; pageBates: unknown },
  total: number,
  drop: number[],
): { kept: number[]; pageText: string[]; pageNotes: string[]; aiSections: { from: number; to: number; title: string }[]; sourcePages: number[]; pageBates: number[] } {
  const dropSet = new Set(drop);
  const kept: number[] = [];
  for (let p = 1; p <= total; p++) if (!dropSet.has(p)) kept.push(p);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const pickStr = (v: unknown): string[] => kept.map((p) => { const x = arr(v)[p - 1]; return typeof x === "string" ? x : ""; });
  const oldBates = arr(doc.pageBates) as number[];
  const pageBates = doc.batesStart > 0 ? kept.map((p) => oldBates[p - 1] ?? doc.batesStart + p - 1) : [];
  const oldSrc = arr(doc.sourcePages) as number[];
  const sourcePages = kept.map((p) => oldSrc[p - 1] ?? p);
  const oldSections = arr(doc.aiSections) as { from: number; to: number; title: string }[];
  const aiSections: { from: number; to: number; title: string }[] = [];
  kept.forEach((p, i) => {
    const t = oldSections.find((s) => s && s.from <= p && p <= s.to)?.title;
    if (!t) return;
    const last = aiSections[aiSections.length - 1];
    if (last && last.title === t && last.to === i) last.to = i + 1;
    else aiSections.push({ from: i + 1, to: i + 1, title: t });
  });
  return { kept, pageText: pickStr(doc.pageText), pageNotes: pickStr(doc.pageNotes), aiSections, sourcePages, pageBates };
}
