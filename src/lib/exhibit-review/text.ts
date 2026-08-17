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

export type ExtractedText = {
  /** True page count of the document. */
  pageCount: number;
  /** Text per page (index 0 = page 1), truncated. Empty string = no text layer. */
  pages: string[];
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_PAGE);

export async function extractPdfText(url: string): Promise<ExtractedText> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { pageCount: 0, pages: [] };
    const buf = new Uint8Array(await res.arrayBuffer());

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
  } catch {
    return { pageCount: 0, pages: [] };
  }
}
