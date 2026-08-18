import "server-only";

/**
 * Per-page PDF text extraction for the Exhibit Reviewer's content search.
 *
 * Runs at upload time (in a Node server action), reading the file back from its
 * Blob URL and pulling the text page by page with `unpdf` — a dependency-light,
 * serverless-friendly wrapper over pdf.js. The text is stored on the doc row so
 * search is instant and offline afterward; the PDF itself is never re-parsed.
 *
 * Everything here is defensive: a scanned/image-only PDF (no text layer), an
 * encrypted file, or a parse failure yields empty pages rather than throwing, so
 * an exhibit always saves — it just won't be findable by its inner words.
 */

/** Cap per page and overall so one enormous file can't bloat a row. */
const MAX_PAGES = 800;
const MAX_CHARS_PER_PAGE = 8000;
const MAX_TOTAL_CHARS = 1_200_000;

/**
 * Above this size we DON'T attempt extraction at all. Loading a huge PDF into
 * memory (`arrayBuffer()`) and parsing it will exhaust the serverless function's
 * memory or time budget — and when the function is killed for that, it takes the
 * whole "save this exhibit" step down with it, so nothing appears. A PDF this
 * large is almost always a high-resolution scan with no useful text layer
 * anyway, so we skip indexing it: the exhibit still uploads, views, downloads,
 * and is searchable by number/title/description/Bates — just not full-text.
 */
export const MAX_EXTRACT_BYTES = 60 * 1024 * 1024; // 60 MB

/** Hard ceiling on how long extraction may run, so a small-but-pathological file
 *  can't hang the save. On timeout the exhibit saves without a text index. */
const EXTRACT_TIMEOUT_MS = 25_000;

export type ExtractedText = {
  /** True page count of the document. */
  pageCount: number;
  /** Text per page (index 0 = page 1), truncated. Empty string = no text layer. */
  pages: string[];
  /** True when we deliberately skipped indexing (too large / timed out / failed). */
  skipped?: boolean;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_PAGE);
const SKIP: ExtractedText = { pageCount: 0, pages: [], skipped: true };

async function doExtract(url: string): Promise<ExtractedText> {
  const res = await fetch(url);
  if (!res.ok) return SKIP;
  // Bail before reading the body if the server tells us it's too big.
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > MAX_EXTRACT_BYTES) return SKIP;

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_EXTRACT_BYTES) return SKIP;

  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pageArray = Array.isArray(text) ? text : [String(text ?? "")];
  const pages: string[] = [];
  let total = 0;
  for (let i = 0; i < Math.min(pageArray.length, MAX_PAGES); i++) {
    if (total >= MAX_TOTAL_CHARS) break;
    const p = clean(String(pageArray[i] ?? ""));
    pages.push(p);
    total += p.length;
  }
  return { pageCount: totalPages || pageArray.length || 0, pages };
}

/**
 * Extract per-page text, or skip cleanly. `sizeHint` (the known upload size) lets
 * us skip huge files without even fetching them; a timeout guards the rest.
 */
export async function extractPdfText(url: string, sizeHint?: number): Promise<ExtractedText> {
  if (sizeHint && sizeHint > MAX_EXTRACT_BYTES) return SKIP;
  try {
    return await Promise.race([
      doExtract(url),
      new Promise<ExtractedText>((resolve) => setTimeout(() => resolve(SKIP), EXTRACT_TIMEOUT_MS)),
    ]);
  } catch {
    return SKIP;
  }
}
