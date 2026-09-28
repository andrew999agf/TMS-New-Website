import "server-only";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs, shareFiles, productionDocs, shareFolders, discoverySets } from "@/db/schema";

/**
 * Chunked, resumable text indexing for every document pile the firm holds:
 * discovery documents (both buckets), client-portal uploads, and the staged/
 * produced Bates copies. Documents are STREAMED page by page (never loaded
 * whole), so 700-page combined litigation PDFs index fine. Progress lives on
 * the row (page_text grows, text_status flips to "done"), so a dropped
 * connection or redeploy loses nothing — and every failure records WHY on
 * the row (text_error), so "couldn't be indexed" is never a dead end.
 *
 * READ-ONLY with respect to the documents themselves: this only copies text
 * OUT of a PDF into the database. The stored file is never modified.
 */

/** Sanity ceiling only — streaming means size barely matters. */
export const INDEX_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

/** If ranged streaming can't open the file, fall back to a full fetch up to
 *  this size (memory-bound in a serverless function). */
const FULL_FETCH_MAX = 200 * 1024 * 1024;

const PAGE_CHAR_CAP = 8_000;
const TOTAL_CHAR_CAP = 4_000_000; // ~700 dense pages before later pages stop indexing
const MAX_PAGES = 2_000;

export type IndexTargetKind = "discovery" | "share" | "production";

type Row = {
  kind: IndexTargetKind;
  id: number;
  name: string;
  url: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  pageText: string[];
  textStatus: string;
  textError: string;
};

export type FailedDoc = { kind: IndexTargetKind; id: number; name: string; sizeBytes: number | null; reason: string };

export type IndexSweepResult = {
  total: number;        // indexable documents in this case
  indexed: number;      // finished ("done")
  remaining: number;
  failed: number;
  done: boolean;        // nothing left this sweep can progress
  current?: string;     // the document being worked when the budget ran out
  /** What failed and why — the staff-visible diagnosis. */
  failedDocs: FailedDoc[];
};

const isPdf = (ct: string | null, name: string) => (!!ct && ct.includes("pdf")) || /\.pdf$/i.test(name);
const asPages = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map((p) => (typeof p === "string" ? p : "")) : []);
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, PAGE_CHAR_CAP);

function reasonFrom(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as Error)?.message ?? e ?? "unknown error");
  if (name === "PasswordException" || /password/i.test(msg)) return "password-protected PDF — remove the security and re-upload, or ask for an unsecured copy";
  if (name === "InvalidPDFException" || /invalid pdf/i.test(msg)) return "file is not a readable PDF (corrupt or mislabeled)";
  if (name === "MissingPDFException" || /missing pdf/i.test(msg)) return "stored file could not be fetched";
  return `${name || "error"}: ${msg}`.slice(0, 200);
}

async function saveProgress(row: Row, pages: string[], pageCount: number | null, status: string, error = "") {
  const patch = { pageText: pages, textStatus: status, textError: error.slice(0, 500), ...(pageCount != null ? { pageCount } : {}) };
  if (row.kind === "discovery") await db!.update(discoveryDocs).set(patch).where(eq(discoveryDocs.id, row.id));
  else if (row.kind === "share") await db!.update(shareFiles).set(patch).where(eq(shareFiles.id, row.id));
  else await db!.update(productionDocs).set({ pageText: pages, textStatus: status, textError: error.slice(0, 500) }).where(eq(productionDocs.id, row.id));
}

type PdfProxy = { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }>; cleanup: () => void }> };

/** Open a PDF for reading: ranged streaming first (no memory footprint),
 *  full download as the fallback for hosts that refuse ranged reads. */
async function openPdf(row: Row): Promise<{ doc: PdfProxy; close: () => Promise<void> }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const task = getDocument({ url: row.url!, useSystemFonts: true, disableAutoFetch: true, rangeChunkSize: 1 << 20 });
    const doc = await task.promise;
    return { doc: doc as unknown as PdfProxy, close: async () => { try { await task.destroy(); } catch { /* best-effort */ } } };
  } catch (streamErr) {
    // Streaming failed — a password error will fail the fallback identically,
    // but a transport quirk (host refusing ranged reads) won't.
    if (row.sizeBytes && row.sizeBytes > FULL_FETCH_MAX) throw streamErr;
    const res = await fetch(row.url!, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`fetch HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > FULL_FETCH_MAX) throw streamErr;
    const task = getDocument({ data: bytes, useSystemFonts: true });
    const doc = await task.promise;
    return { doc: doc as unknown as PdfProxy, close: async () => { try { await task.destroy(); } catch { /* best-effort */ } } };
  }
}

/**
 * Index one document for up to `budgetMs`. Returns true when the document is
 * finished (done or terminally failed), false when it needs another chunk.
 * One page at a time, each released before the next; partial progress saves
 * so no chunk ever repeats work.
 */
async function indexOne(row: Row, budgetMs: number): Promise<boolean> {
  const started = Date.now();
  if (!row.url) { await saveProgress(row, [], null, "failed", "no stored file to read"); return true; }
  if (!isPdf(row.contentType, row.name)) {
    // Photos & other binaries have no text layer to index.
    await saveProgress(row, [], null, "done");
    return true;
  }
  if (row.sizeBytes && row.sizeBytes > INDEX_MAX_BYTES) { await saveProgress(row, row.pageText, null, "failed", `file is ${Math.round(row.sizeBytes / 1048576)} MB — over the 1 GB ceiling`); return true; }

  let handle: Awaited<ReturnType<typeof openPdf>> | null = null;
  try {
    handle = await openPdf(row);
    const doc = handle.doc;
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const pages = [...row.pageText];
    let total = pages.reduce((n, p) => n + p.length, 0);

    for (let n = pages.length + 1; n <= pageCount; n++) {
      if (Date.now() - started > budgetMs) {
        await saveProgress(row, pages, doc.numPages, "pending");
        return false; // resume next chunk right where this one stopped
      }
      if (total >= TOTAL_CHAR_CAP) { pages.push(""); continue; }
      try {
        const page = await doc.getPage(n);
        const tc = await page.getTextContent();
        const text = clean(tc.items.map((it) => ("str" in it && it.str ? it.str : "")).join(" "));
        page.cleanup(); // release this page's objects before the next one
        pages.push(text);
        total += text.length;
      } catch {
        pages.push("");
      }
    }
    await saveProgress(row, pages, doc.numPages, "done");
    return true;
  } catch (e) {
    console.error(`[text-index] ${row.kind}:${row.id} "${row.name}" failed:`, e);
    // A document that opened before (partial progress exists) hit transient
    // trouble — keep it retryable. One that can't even open is a real failure.
    if (row.pageText.length > 0) return true; // stays pending; next sweep retries
    await saveProgress(row, [], null, "failed", reasonFrom(e));
    return true;
  } finally {
    await handle?.close();
  }
}

/** Every indexable document connected to one discovery case. */
async function targetsFor(setId: number): Promise<Row[]> {
  const [set] = await db!.select().from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) return [];
  const out: Row[] = [];
  const docs = await db!.select().from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
  for (const d of docs) out.push({ kind: "discovery", id: d.id, name: d.name, url: d.url, contentType: d.contentType, sizeBytes: d.sizeBytes, pageText: asPages(d.pageText), textStatus: d.textStatus, textError: d.textError });
  if (set.matter) {
    const folders = await db!.select({ id: shareFolders.id }).from(shareFolders).where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
    if (folders.length) {
      const files = await db!.select().from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
      for (const f of files) out.push({ kind: "share", id: f.id, name: f.filename, url: f.url, contentType: f.contentType, sizeBytes: f.sizeBytes, pageText: asPages(f.pageText), textStatus: f.textStatus, textError: f.textError });
    }
  }
  const pdocs = await db!.select().from(productionDocs).where(eq(productionDocs.setId, setId));
  for (const p of pdocs) out.push({ kind: "production", id: p.id, name: p.name, url: p.url, contentType: p.contentType, sizeBytes: p.sizeBytes, pageText: asPages(p.pageText), textStatus: p.textStatus, textError: p.textError });
  return out;
}

/** A row that already has text but predates text_status counts as done. */
const effectiveStatus = (r: Row) => (r.textStatus === "" && r.pageText.some((p) => p.trim()) ? "done" : r.textStatus);

function summarize(rows: Row[]): IndexSweepResult {
  const st = rows.map(effectiveStatus);
  const indexed = st.filter((s) => s === "done").length;
  const failedRows = rows.filter((r) => effectiveStatus(r) === "failed");
  return {
    total: rows.length, indexed, failed: failedRows.length,
    remaining: rows.length - indexed - failedRows.length,
    done: rows.length === indexed + failedRows.length,
    failedDocs: failedRows.slice(0, 10).map((r) => ({ kind: r.kind, id: r.id, name: r.name, sizeBytes: r.sizeBytes, reason: r.textError || "unknown (indexed before diagnostics existed — retry records the reason)" })),
  };
}

export async function indexStatusFor(setId: number): Promise<IndexSweepResult> {
  return summarize(await targetsFor(setId));
}

/** Run one ~35s indexing sweep over the case; call again until done. */
export async function indexTextChunk(setId: number, opts: { retryFailed?: boolean } = {}): Promise<IndexSweepResult> {
  const SWEEP_BUDGET_MS = 35_000;
  const started = Date.now();
  const rows = await targetsFor(setId);
  let current: string | undefined;

  // An explicit retry flips every failed row back to "pending" ON DISK
  // first, so the retry survives across however many chunks the sweep
  // takes — later chunks (and the background heartbeat) see plain pending
  // work instead of skipping "failed" rows they were never asked to retry.
  if (opts.retryFailed) {
    for (const row of rows) {
      if (effectiveStatus(row) === "failed") {
        row.textStatus = "pending";
        row.textError = "";
        await saveProgress(row, row.pageText, null, "pending");
      }
    }
  }

  for (const row of rows) {
    const st = effectiveStatus(row);
    if (st === "done") { if (row.textStatus !== "done") await saveProgress(row, row.pageText, null, "done"); continue; }
    if (st === "failed") continue; // only an explicit retry (above) revives these
    const left = SWEEP_BUDGET_MS - (Date.now() - started);
    if (left < 4_000) { current = row.name; break; }
    current = row.name;
    await indexOne(row, left);
  }

  const status = await indexStatusFor(setId);
  return { ...status, ...(status.done ? {} : { current }) };
}
