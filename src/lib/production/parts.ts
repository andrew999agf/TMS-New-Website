/**
 * A production that is too big for one merged PDF goes out as numbered
 * parts — "3rd Bates - Smith - 2026-10-08 (Part 2 of 3).pdf" — under ONE
 * production, one letter and one opposing-counsel link. The plan is fixed
 * when the production is prepared (which staged copies go in which part, in
 * Bates order, never splitting a document), then the parts are built one
 * server call at a time so each stays inside the server's time and memory
 * budget. Shared by the server actions, the admin page and the OC page.
 */

export type ProductionPart = {
  /** 1-based. */
  n: number;
  /** production_docs ids in this part, in Bates order. */
  docIds: number[];
  /** Planned size (sum of the staged copies) and page count. */
  bytes: number;
  pages: number;
  batesStart: number;
  batesEnd: number;
  /** Filled in once the part's PDF is built and uploaded. */
  url: string | null;
  pathname: string | null;
  name: string;
  sizeBytes: number;
};

/** Staged-copy bytes one part may hold. Well under what one server call can
 *  fetch, merge with pdf-lib and upload within its budget. */
export const PART_BYTES = 100 * 1024 * 1024;

export function planProductionParts(
  docs: { id: number; sizeBytes: number | null; pageCount: number | null; batesStart: number; batesEnd: number }[],
  cap = PART_BYTES,
): ProductionPart[] {
  const parts: ProductionPart[] = [];
  let cur: ProductionPart | null = null;
  for (const d of docs) {
    const bytes = d.sizeBytes ?? 0;
    if (!cur || (cur.docIds.length > 0 && cur.bytes + bytes > cap)) {
      cur = { n: parts.length + 1, docIds: [], bytes: 0, pages: 0, batesStart: 0, batesEnd: 0, url: null, pathname: null, name: "", sizeBytes: 0 };
      parts.push(cur);
    }
    cur.docIds.push(d.id);
    cur.bytes += bytes;
    cur.pages += d.pageCount ?? 0;
    if (d.batesStart > 0) {
      cur.batesStart = cur.batesStart ? Math.min(cur.batesStart, d.batesStart) : d.batesStart;
      cur.batesEnd = Math.max(cur.batesEnd, d.batesEnd);
    }
  }
  return parts;
}

/** Read the parts column defensively (old rows have none). */
export function partsOf(v: unknown): ProductionPart[] {
  if (!Array.isArray(v)) return [];
  return (v as ProductionPart[]).filter((p) => p && Number.isFinite(p.n) && Array.isArray(p.docIds));
}

/** "3rd Bates - Smith - 2026-10-08 (Part 2 of 3).pdf" — no suffix for a
 *  single-part production, so nothing changes for the ordinary case. */
export function partFileName(base: string, n: number, total: number): string {
  if (total <= 1) return base;
  return base.replace(/\.pdf$/i, "") + ` (Part ${n} of ${total}).pdf`;
}

export const partsReady = (parts: ProductionPart[]) => parts.length > 0 && parts.every((p) => !!p.url);
