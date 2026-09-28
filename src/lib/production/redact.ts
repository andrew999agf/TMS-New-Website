import "server-only";
import { PDFDocument } from "pdf-lib";

/**
 * TRUE redaction. Drawing a black box over text hides it visually but the
 * text is still inside the PDF — opposing counsel could copy-paste right
 * through the box. So every page that carries a redaction is re-rendered to
 * a flat image (box already burned in) and that image REPLACES the page's
 * content. The text on that page is genuinely gone from the outgoing copy.
 *
 * This only ever runs on the staged copy being built — the original client
 * document is never touched, so nothing is ever lost: re-stage from the
 * original any time.
 */
export async function rasterizeRedactedPages(bytes: Uint8Array, pageNumbers: number[], maxDim = 2200): Promise<Uint8Array> {
  const targets = [...new Set(pageNumbers)].filter((n) => n >= 1);
  if (!targets.length) return bytes;

  await (await import("@/lib/documents/pdf-worker")).ensurePdfWorker();
  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ]);
  const src = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  const out = await PDFDocument.load(bytes, { ignoreEncryption: true });

  for (const n of targets) {
    if (n > src.numPages || n > out.getPageCount()) continue;
    const page = await src.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, maxDim / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    // White base so transparent regions don't go black in the JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    const jpg = canvas.toBuffer("image/jpeg", 90);

    const img = await out.embedJpg(jpg);
    const oldPage = out.getPage(n - 1);
    const { width, height } = oldPage.getSize();
    // Replace: insert a fresh page of the same size carrying only the image,
    // then remove the original page behind it.
    const fresh = out.insertPage(n - 1, [width, height]);
    fresh.drawImage(img, { x: 0, y: 0, width, height });
    out.removePage(n); // the old page, shifted one slot right by the insert
  }
  await src.cleanup().catch(() => {});
  return out.save();
}
