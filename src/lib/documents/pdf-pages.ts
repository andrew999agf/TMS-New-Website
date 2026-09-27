import "server-only";

/**
 * Server-side PDF page rendering for the discovery review: scanned PDFs have
 * no extractable text, so their pages get rendered to JPEGs and shown to the
 * vision model instead. Built on pdfjs-dist with @napi-rs/canvas (prebuilt
 * native binaries — no system packages needed on Vercel).
 *
 * Everything is defensive: any failure returns [] and the caller falls back
 * to flagging the document for human review rather than crashing a sweep.
 */

export async function renderPdfPages(bytes: Uint8Array, pageNumbers: number[], maxDim = 1400): Promise<string[]> {
  try {
    const [{ getDocument }, { createCanvas }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("@napi-rs/canvas"),
    ]);
    const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const out: string[] = [];
    for (const n of pageNumbers) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxDim / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      out.push(`data:image/jpeg;base64,${canvas.toBuffer("image/jpeg", 80).toString("base64")}`);
    }
    await doc.cleanup().catch(() => {});
    return out;
  } catch {
    return [];
  }
}

/** How many pages a PDF has, or null if it can't be opened. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: bytes }).promise;
    const n = doc.numPages;
    await doc.cleanup().catch(() => {});
    return n;
  } catch {
    return null;
  }
}
