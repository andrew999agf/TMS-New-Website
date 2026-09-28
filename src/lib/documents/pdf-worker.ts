import "server-only";

/**
 * pdfjs on Node runs a "fake worker": pdf.mjs dynamically imports
 * pdf.worker.mjs at open time. Vercel's file tracer cannot see that dynamic
 * import, so the worker file was left out of the serverless bundle and EVERY
 * production PDF open failed with "Setting up fake worker failed: Cannot
 * find module …pdf.worker.mjs". Importing it HERE, with a literal specifier
 * the tracer can follow, puts the file in the bundle — and pre-warming the
 * module means pdfjs finds it instantly. Call before any getDocument().
 */
let loaded: Promise<unknown> | null = null;
export function ensurePdfWorker(): Promise<unknown> {
  // @ts-expect-error -- the worker entry ships no type declarations
  loaded ??= import("pdfjs-dist/legacy/build/pdf.worker.mjs").catch(() => null);
  return loaded;
}
