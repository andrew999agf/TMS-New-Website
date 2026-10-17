"use client";

import type { PDFDocumentProxy, PDFWorker } from "pdfjs-dist";
import { diagLog } from "@/lib/client-diag";

type PdfLib = typeof import("pdfjs-dist");
let pdfLibPromise: Promise<PdfLib> | null = null;
/** pdf.js itself, loaded once per page (the legacy build, compiled for wide
 *  browser support — the standard v6 build needs JS engine APIs many current
 *  browsers don't ship yet). */
export function loadPdfjs(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    pdfLibPromise = (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfLib>).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return lib;
    });
  }
  return pdfLibPromise;
}

/**
 * One pdf.js loader for a whole tab, built for thousands of pages:
 *
 *  - a small pool of pdf.js workers shared by every document (before this,
 *    each document spun up its own worker — 1,264 documents meant 1,264
 *    worker threads and the page froze);
 *  - at most a few document loads in flight at once, the rest queued, with
 *    the reader and anything the user just clicked jumping the queue;
 *  - an open-document cap: documents nobody has touched for a while are
 *    closed and reopened on demand, so memory stays flat as you scroll.
 */

const MAX_IN_FLIGHT = 4;
const WORKERS = 3;
const MAX_OPEN = 40;
const IDLE_MS = 3_000;

type Entry = { promise: Promise<PDFDocumentProxy>; doc: PDFDocumentProxy | null; task: { destroy: () => Promise<void> } | null; lastUsed: number; failed?: string };
type Job = { url: string; priority: boolean; run: () => void };

export type PdfLoader = {
  get: (url: string, priority?: boolean) => Promise<PDFDocumentProxy>;
  clear: () => void;
  stats: () => Record<string, unknown>;
};

let workers: PDFWorker[] = [];
let workerIdx = 0;
async function pickWorker(lib: Awaited<ReturnType<typeof loadPdfjs>>): Promise<PDFWorker> {
  if (!workers.length) workers = Array.from({ length: WORKERS }, () => new lib.PDFWorker());
  return workers[workerIdx++ % workers.length];
}

export function createPdfLoader(label: string): PdfLoader {
  const open = new Map<string, Entry>();
  const queue: Job[] = [];
  let inFlight = 0;
  let loaded = 0, failed = 0, evicted = 0;
  const failures: string[] = [];

  const pump = () => {
    while (inFlight < MAX_IN_FLIGHT && queue.length) {
      const job = queue.shift()!;
      inFlight++;
      job.run();
    }
  };

  const evict = () => {
    if (open.size <= MAX_OPEN) return;
    const now = Date.now();
    const idle = [...open.entries()].filter(([, e]) => e.doc && now - e.lastUsed > IDLE_MS).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [url, e] of idle) {
      if (open.size <= MAX_OPEN) break;
      open.delete(url);
      evicted++;
      try { void e.task?.destroy(); } catch { /* already gone */ }
    }
  };

  const load = (url: string, priority: boolean): Promise<PDFDocumentProxy> =>
    new Promise<PDFDocumentProxy>((resolve, reject) => {
      const job: Job = {
        url, priority,
        run: () => {
          void (async () => {
            try {
              const lib = await loadPdfjs();
              const worker = await pickWorker(lib);
              const task = lib.getDocument({
                url, worker,
                wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/", cMapUrl: "/pdfjs/cmaps/", standardFontDataUrl: "/pdfjs/standard_fonts/",
              });
              const doc = await task.promise;
              const e = open.get(url);
              if (e) { e.doc = doc; e.task = task; e.lastUsed = Date.now(); }
              loaded++;
              resolve(doc);
            } catch (err) {
              failed++;
              const msg = `${url.split("/").slice(-2).join("/")}: ${(err as Error)?.message ?? err}`;
              failures.push(msg);
              if (failures.length > 20) failures.shift();
              diagLog(`pdf-${label}`, `load failed ${msg}`);
              const e = open.get(url);
              if (e) e.failed = String((err as Error)?.message ?? err);
              open.delete(url);
              reject(err);
            } finally {
              inFlight--;
              pump();
              evict();
            }
          })();
        },
      };
      if (priority) queue.unshift(job); else queue.push(job);
      pump();
    });

  return {
    get(url, priority = false) {
      const e = open.get(url);
      if (e) {
        e.lastUsed = Date.now();
        // Promote a queued load the user is now waiting on.
        if (priority) { const i = queue.findIndex((j) => j.url === url); if (i > 0) queue.unshift(...queue.splice(i, 1)); }
        return e.promise;
      }
      const promise = load(url, priority);
      open.set(url, { promise, doc: null, task: null, lastUsed: Date.now() });
      return promise;
    },
    clear() {
      for (const e of open.values()) { if (e.task) { try { void e.task.destroy(); } catch { /* ignore */ } } }
      open.clear();
      queue.splice(0, queue.length);
    },
    stats() {
      return { tab: label, open: open.size, queued: queue.length, inFlight, loaded, failed, evicted, workers: workers.length, recentFailures: failures.slice(-8) };
    },
  };
}
