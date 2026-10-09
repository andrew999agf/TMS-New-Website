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

/** A merged "download as one PDF" from the yellow tab holds at most this
 *  many documents; past it the download comes as PDF 1 of N, 2 of N… */
export const MERGE_MAX_DOCS = 1000;

export function planProductionParts(
  docs: { id: number; sizeBytes: number | null; pageCount: number | null; batesStart: number; batesEnd: number }[],
  cap = PART_BYTES,
  maxDocs = Number.POSITIVE_INFINITY,
): ProductionPart[] {
  const parts: ProductionPart[] = [];
  let cur: ProductionPart | null = null;
  for (const d of docs) {
    const bytes = d.sizeBytes ?? 0;
    if (!cur || (cur.docIds.length > 0 && (cur.bytes + bytes > cap || cur.docIds.length >= maxDocs))) {
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

/* ---- compact id lists for download links ("12-40,45,50-61") ---- */

export function encodeIdRanges(ids: number[]): string {
  const sorted = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return out.join(",");
}

export function decodeIdRanges(raw: string | null | undefined, limit = 50000): number[] {
  const out: number[] = [];
  for (const tok of (raw ?? "").split(",")) {
    const t = tok.trim();
    if (!t) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(t);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (!(a > 0) || b < a) continue;
    for (let n = a; n <= b && out.length < limit; n++) out.push(n);
  }
  return out;
}
