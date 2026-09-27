import "server-only";
import { extractPdfText } from "@/lib/exhibit-review/text";

/**
 * Upload-time text indexing for a share-folder file: small PDFs are indexed
 * inline (fast enough not to slow the upload acknowledgment), bigger ones are
 * marked "pending" for the chunked indexer to finish, and photos have no text
 * layer to index. Purely additive — the stored file is never touched.
 */
const INLINE_EXTRACT_BYTES = 15 * 1024 * 1024;

export async function shareFileTextFields(file: { url: string; contentType?: string | null; filename?: string; pathname?: string; size?: number | null }): Promise<{ pageCount: number | null; pageText: string[]; textStatus: string }> {
  const isPdf = (file.contentType ?? "").includes("pdf") || /\.pdf$/i.test(file.filename ?? file.pathname ?? "");
  if (!isPdf) return { pageCount: null, pageText: [], textStatus: "done" };
  if (file.size && file.size > INLINE_EXTRACT_BYTES) return { pageCount: null, pageText: [], textStatus: "pending" };
  const extracted = await extractPdfText(file.url, file.size ?? undefined).catch(() => ({ pageCount: 0, pages: [] as string[] }));
  return extracted.pageCount
    ? { pageCount: extracted.pageCount, pageText: extracted.pages, textStatus: "done" }
    : { pageCount: null, pageText: [], textStatus: "pending" };
}
