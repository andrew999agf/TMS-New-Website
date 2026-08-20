import "server-only";
import { PDFDocument } from "pdf-lib";
import { getDocumentProxy, extractImages } from "unpdf";
import sharp from "sharp";
import { classifyPixels, keepColor } from "./color";

/**
 * Build a "print-optimized" copy of a scanned exhibit PDF: pages that are
 * effectively black-and-white (see ./color) are re-saved as true grayscale, so
 * a printer's own color/mono auto-detection bills them as black-and-white.
 * Pages with genuine color are copied through untouched and stay in color.
 *
 * This is non-destructive — the original file is never modified; the result is
 * saved as a separate file the user hands to the printer.
 *
 * Only single-image (scanned) pages are converted. Anything we can't be certain
 * about — multi-image pages, vector/text pages, unreadable pages — is passed
 * through as-is. That keeps the guarantee that a color page is never flattened
 * to gray, at the cost of leaving a rare page in color that could have been mono.
 */

/** Skip the whole job above this size to protect server memory. */
const MAX_INPUT_BYTES = 300 * 1024 * 1024;
/** Grayscale JPEG quality for converted pages — crisp text, small files. */
const GRAY_QUALITY = 88;

export interface PrintCopyResult {
  status: "ok" | "skipped" | "error";
  /** Reason when status !== "ok". */
  reason?: string;
  bytes?: Uint8Array;
  pageCount: number;
  /** 1-based page numbers that stay in color. */
  colorPages: number[];
  /** 1-based page numbers the detector was UNSURE about (borderline). They are
   *  kept in color here (the safe default) and surfaced for the user to confirm
   *  color vs. grayscale. A page with a manual override is never listed. */
  reviewPages: number[];
  /** Pages actually converted to grayscale. */
  converted: number;
}

/** Manual per-page decisions that override the detector, keyed by 1-based page
 *  number as a string: { "3": "gray", "5": "color" }. */
export type ColorOverrides = Record<string, "gray" | "color">;

function largest(imgs: { width: number; height: number; channels: number; data: Uint8Array }[]) {
  let best = imgs[0];
  for (const im of imgs) if (im.width * im.height > best.width * best.height) best = im;
  return best;
}

export async function buildPrintOptimized(source: Uint8Array | Buffer, overrides: ColorOverrides = {}): Promise<PrintCopyResult> {
  const src = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (src.byteLength > MAX_INPUT_BYTES) {
    return { status: "skipped", reason: "File is too large to prepare a print copy.", pageCount: 0, colorPages: [], reviewPages: [], converted: 0 };
  }

  let srcDoc: PDFDocument;
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    srcDoc = await PDFDocument.load(src, { ignoreEncryption: true });
    pdf = await getDocumentProxy(src);
  } catch {
    return { status: "error", reason: "Couldn't read the PDF.", pageCount: 0, colorPages: [], reviewPages: [], converted: 0 };
  }

  const pageCount = srcDoc.getPageCount();
  const out = await PDFDocument.create();
  const colorPages: number[] = [];
  const reviewPages: number[] = [];
  let converted = 0;

  for (let p = 1; p <= pageCount; p++) {
    const override = overrides[String(p)];
    // Default action: copy the original page through unchanged.
    const passthrough = async () => {
      const [copied] = await out.copyPages(srcDoc, [p - 1]);
      out.addPage(copied);
    };
    // Re-save the page (single scanned image) as grayscale.
    const grayscale = async (img: { width: number; height: number; channels: number; data: Uint8Array }) => {
      const grayJpg = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: img.channels as 3 | 4 } })
        .grayscale()
        .jpeg({ quality: GRAY_QUALITY })
        .toBuffer();
      const srcPage = srcDoc.getPage(p - 1);
      const { width, height } = srcPage.getSize();
      const rotation = srcPage.getRotation();
      const embedded = await out.embedJpg(grayJpg);
      const page = out.addPage([width, height]);
      page.setRotation(rotation);
      page.drawImage(embedded, { x: 0, y: 0, width, height });
      converted++;
    };

    try {
      const imgs = (await extractImages(pdf, p)) as unknown as { width: number; height: number; channels: number; data: Uint8Array }[];
      const img = imgs && imgs.length ? largest(imgs) : null;
      const singleImage = !!img && imgs.length === 1 && img.channels >= 3;

      // A manual decision wins over the detector.
      if (override === "color") { colorPages.push(p); await passthrough(); continue; }
      if (override === "gray") {
        if (singleImage) { await grayscale(img!); } else { await passthrough(); }
        continue;
      }

      if (!img || img.channels < 3) { await passthrough(); continue; }

      const verdict = classifyPixels(img.data, img.width, img.height, img.channels).verdict;
      if (verdict === "borderline") {
        // Unsure — keep it in color for now and flag it for the user.
        colorPages.push(p); reviewPages.push(p); await passthrough(); continue;
      }
      if (keepColor(verdict)) { colorPages.push(p); await passthrough(); continue; }

      // Confidently B&W. Only rebuild single scanned-image pages; otherwise pass
      // through so we never drop overlaid content.
      if (singleImage) { await grayscale(img); } else { await passthrough(); }
    } catch {
      // Any trouble on a page: keep the original page rather than fail the file.
      try { await passthrough(); } catch { /* skip an unrecoverable page */ }
    }
  }

  if (out.getPageCount() === 0) {
    return { status: "error", reason: "No pages could be processed.", pageCount, colorPages, reviewPages, converted };
  }
  const bytes = await out.save();
  return { status: "ok", bytes, pageCount, colorPages, reviewPages, converted };
}
