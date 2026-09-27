import "server-only";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs, shareFiles, productionDocs, shareFolders, discoverySets } from "@/db/schema";

/**
 * Chunked, resumable text indexing for every document pile the firm holds:
 * discovery documents (both buckets), client-portal uploads, and the staged/
 * produced Bates copies. The upload-time extractor (`extractPdfText`) handles
 * small files inline; anything it skips — big combined litigation PDFs, slow
 * parses — is finished here, a page range at a time, across as many calls as
 * it takes. Progress lives on the row (page_text grows, text_status flips to
 * "done"), so a dropped connection or redeploy loses nothing.
 *
 * READ-ONLY with respect to the documents themselves: this only copies text
 * OUT of a PDF into the database. The stored file is never modified.
 */

/** Sanity ceiling only. Documents are STREAMED page by page (never loaded
 *  whole), so ordinary giants — a 700-page scanned-and-OCR'd production —
 *  index fine; this guards against something absurd. */
export const INDEX_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

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
};

export type IndexSweepResult = {
  total: number;        // indexable documents in this case
  indexed: number;      // finished ("done")
  remaining: number;
  failed: number;
  done: boolean;        // nothing left this sweep can progress
  current?: string;     // the document being worked when the budget ran out
};

const isPdf = (ct: string | null, name: string) => (!!ct && ct.includes("pdf")) || /\.pdf$/i.test(name);
const asPages = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map((p) => (typeof p === "string" ? p : "")) : []);
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, PAGE_CHAR_CAP);

async function saveProgress(row: Row, pages: string[], pageCount: number | null, status: string) {
  const patch = { pageText: pages, textStatus: status, ...(pageCount != null ? { pageCount } : {}) };
  if (row.kind === "discovery") await db!.update(discoveryDocs).set(patch).where(eq(discoveryDocs.id, row.id));
  else if (row.kind === "share") await db!.update(shareFiles).set(patch).where(eq(shareFiles.id, row.id));
  else await db!.update(productionDocs).set({ pageText: pages, textStatus: status }).where(eq(productionDocs.id, row.id));
}

/**
 * Index one document for up to `budgetMs`. Returns true when the document is
 * finished (done or terminally failed), false when it needs another chunk.
 *
 * The document is STREAMED, not loaded whole: pdf.js opens it over ranged
 * HTTP requests and parses one page at a time (each page released before the
 * next), so a 700-page combined litigation PDF indexes fine — the file never
 * has to fit in the serverless function's memory at once. Progress is saved
 * as pages accumulate, so however many chunks it takes, none of the work is
 * repeated.
 */
async function indexOne(row: Row, budgetMs: number): Promise<boolean> {
  const started = Date.now();
  if (!row.url) { await saveProgress(row, [], null, "failed"); return true; }
  if (!isPdf(row.contentType, row.name)) {
    // Photos & other binaries have no text layer; the vision sweep covers them.
    await saveProgress(row, [], null, "done");
    return true;
  }
  if (row.sizeBytes && row.sizeBytes > INDEX_MAX_BYTES) { await saveProgress(row, row.pageText, null, "failed"); return true; }

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let task: ReturnType<typeof getDocument> | null = null;
  try {
    // Ranged streaming; hosts that refuse Range requests just get a plain
    // download through the same pipe. disableAutoFetch keeps pdf.js from
    // greedily pulling the whole file in the background.
    task = getDocument({ url: row.url, useSystemFonts: true, disableAutoFetch: true, rangeChunkSize: 1 << 20 });
    const doc = await task.promise;
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
        const text = clean(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
        page.cleanup(); // release this page's objects before the next one
        pages.push(text);
        total += text.length;
      } catch {
        pages.push("");
      }
    }
    await saveProgress(row, pages, doc.numPages, "done");
    return true;
  } catch {
    // A document that opened before (partial progress exists) hit transient
    // trouble — keep it retryable. One that can't even open is a real failure.
    if (row.pageText.length > 0) return true; // stays pending; next sweep retries
    await saveProgress(row, [], null, "failed");
    return true;
  } finally {
    try { await task?.destroy(); } catch { /* socket cleanup is best-effort */ }
  }
}

/** Every indexable document connected to one discovery case. */
async function targetsFor(setId: number): Promise<Row[]> {
  const [set] = await db!.select().from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) return [];
  const out: Row[] = [];
  const docs = await db!.select().from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
  for (const d of docs) out.push({ kind: "discovery", id: d.id, name: d.name, url: d.url, contentType: d.contentType, sizeBytes: d.sizeBytes, pageText: asPages(d.pageText), textStatus: d.textStatus });
  if (set.matter) {
    const folders = await db!.select({ id: shareFolders.id }).from(shareFolders).where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
    if (folders.length) {
      const files = await db!.select().from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
      for (const f of files) out.push({ kind: "share", id: f.id, name: f.filename, url: f.url, contentType: f.contentType, sizeBytes: f.sizeBytes, pageText: asPages(f.pageText), textStatus: f.textStatus });
    }
  }
  const pdocs = await db!.select().from(productionDocs).where(eq(productionDocs.setId, setId));
  for (const p of pdocs) out.push({ kind: "production", id: p.id, name: p.name, url: p.url, contentType: p.contentType, sizeBytes: p.sizeBytes, pageText: asPages(p.pageText), textStatus: p.textStatus });
  return out;
}

/** A row that already has text but predates text_status counts as done. */
const effectiveStatus = (r: Row) => (r.textStatus === "" && r.pageText.some((p) => p.trim()) ? "done" : r.textStatus);

export async function indexStatusFor(setId: number): Promise<IndexSweepResult> {
  const rows = await targetsFor(setId);
  const st = rows.map(effectiveStatus);
  const indexed = st.filter((s) => s === "done").length;
  const failed = st.filter((s) => s === "failed").length;
  return { total: rows.length, indexed, failed, remaining: rows.length - indexed - failed, done: rows.length === indexed + failed };
}

/** Run one ~35s indexing sweep over the case; call again until done. */
export async function indexTextChunk(setId: number, opts: { retryFailed?: boolean } = {}): Promise<IndexSweepResult> {
  const SWEEP_BUDGET_MS = 35_000;
  const started = Date.now();
  const rows = await targetsFor(setId);
  let current: string | undefined;

  for (const row of rows) {
    const st = effectiveStatus(row);
    if (st === "done") { if (row.textStatus !== "done") await saveProgress(row, row.pageText, null, "done"); continue; }
    if (st === "failed" && !opts.retryFailed) continue;
    const left = SWEEP_BUDGET_MS - (Date.now() - started);
    if (left < 4_000) { current = row.name; break; }
    current = row.name;
    if (st === "failed") row.textStatus = ""; // explicit retry
    await indexOne(row, left);
  }

  const status = await indexStatusFor(setId);
  return { ...status, ...(status.done ? {} : { current }) };
}
