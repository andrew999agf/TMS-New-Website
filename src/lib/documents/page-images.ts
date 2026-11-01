import "server-only";
import { and, asc, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { discoveryDocs, discoveryPageImages, discoveryRenderJobs, discoverySets, shareFiles, shareFolders } from "@/db/schema";

/**
 * Page pictures for the Discovery Reviewer's red tab.
 *
 * Why: pdf.js in the browser must walk every page object of a scan before it
 * can show page 1, and a scanner's PDF spreads those objects through the
 * whole file — so a 3,000-page, 300 MB production was being downloaded in
 * full, through the sign-in proxy, every time the tab opened. Reading one
 * page meant the same again.
 *
 * Now each page is rendered ONCE here, on the server, to two JPEGs (a grid
 * thumbnail and a reading size) stored in Blob and indexed by (document,
 * page). The grid and the reader load one small picture per page, cached by
 * the browser, and never open the original. The original is never modified.
 *
 * Work is chunked and resumable (like text indexing): a sweep renders as
 * many pages as fit in its budget, records progress on the job row, and the
 * next sweep continues where it stopped. Run by the tab while it is open and
 * by the minute cron while it isn't.
 */

export const THUMB_W = 320;   // grid cell is ≤ 300 CSS px wide
export const READ_W = 1600;   // reader fits ~940 px; 1600 stays sharp to ~1.7× zoom
const JPEG_Q_THUMB = 72;
const JPEG_Q_READ = 80;
const MAX_BYTES = 1200 * 1024 * 1024; // the function holds the file in memory
const LOCK_MS = 90_000;
const UPLOAD_PARALLEL = 6;

export type RenderJob = { docKey: string; setId: number; name: string; pageCount: number | null; rendered: number; status: string; error: string };
export type RenderStatus = {
  jobs: RenderJob[];
  /** Pages still to render across the case's PDFs. */
  pagesLeft: number;
  pagesTotal: number;
  done: boolean;
  current?: string;
};

type Target = { docKey: string; name: string; url: string | null; contentType: string | null; sizeBytes: number | null; pageCount: number | null };
const isPdf = (ct: string | null, name: string) => (!!ct && ct.includes("pdf")) || /\.pdf$/i.test(name);

/** Red-tab PDFs of one case: the firm's own uploads and the client's portal uploads. */
async function targetsFor(setId: number): Promise<Target[]> {
  const [set] = await db!.select({ matter: discoverySets.matter }).from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) return [];
  const out: Target[] = [];
  const docs = await db!.select({ id: discoveryDocs.id, name: discoveryDocs.name, url: discoveryDocs.url, contentType: discoveryDocs.contentType, sizeBytes: discoveryDocs.sizeBytes, pageCount: discoveryDocs.pageCount }).from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
  for (const d of docs) if (isPdf(d.contentType, d.name)) out.push({ docKey: `doc:${d.id}`, name: d.name, url: d.url, contentType: d.contentType, sizeBytes: d.sizeBytes, pageCount: d.pageCount });
  if (set.matter) {
    const folders = await db!.select({ id: shareFolders.id }).from(shareFolders).where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
    if (folders.length) {
      const files = await db!.select({ id: shareFiles.id, filename: shareFiles.filename, url: shareFiles.url, contentType: shareFiles.contentType, sizeBytes: shareFiles.sizeBytes, pageCount: shareFiles.pageCount }).from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
      for (const f of files) if (isPdf(f.contentType, f.filename)) out.push({ docKey: `share:${f.id}`, name: f.filename.split("/").pop() || f.filename, url: f.url, contentType: f.contentType, sizeBytes: f.sizeBytes, pageCount: f.pageCount });
    }
  }
  return out;
}

/** Make sure every red-tab PDF has a job row; return the rows. Big documents
 *  first — they are the ones the browser can't handle on its own. */
async function syncJobs(setId: number): Promise<{ targets: Target[]; jobs: Map<string, typeof discoveryRenderJobs.$inferSelect> }> {
  const targets = await targetsFor(setId);
  const existing = await db!.select().from(discoveryRenderJobs).where(eq(discoveryRenderJobs.setId, setId));
  const jobs = new Map(existing.map((j) => [j.docKey, j]));
  for (const t of targets) {
    if (jobs.has(t.docKey)) continue;
    const [row] = await db!.insert(discoveryRenderJobs).values({ docKey: t.docKey, setId, name: t.name, pageCount: t.pageCount, status: "pending" }).onConflictDoNothing().returning();
    if (row) jobs.set(t.docKey, row);
  }
  targets.sort((a, b) => (b.pageCount ?? b.sizeBytes ?? 0) - (a.pageCount ?? a.sizeBytes ?? 0));
  return { targets, jobs };
}

function summarize(targets: Target[], jobs: Map<string, typeof discoveryRenderJobs.$inferSelect>, current?: string): RenderStatus {
  const rows: RenderJob[] = targets.map((t) => { const j = jobs.get(t.docKey); return { docKey: t.docKey, setId: j?.setId ?? 0, name: t.name, pageCount: j?.pageCount ?? t.pageCount, rendered: j?.rendered ?? 0, status: j?.status ?? "pending", error: j?.error ?? "" }; });
  let pagesLeft = 0, pagesTotal = 0;
  for (const r of rows) {
    if (r.status === "failed" || r.status === "skipped") continue;
    const n = r.pageCount ?? 0;
    pagesTotal += n;
    pagesLeft += Math.max(0, n - r.rendered) + (r.pageCount == null ? 1 : 0);
  }
  return { jobs: rows, pagesLeft, pagesTotal, done: pagesLeft === 0, ...(current ? { current } : {}) };
}

export async function renderStatusFor(setId: number): Promise<RenderStatus> {
  const { targets, jobs } = await syncJobs(setId);
  return summarize(targets, jobs);
}

/** Rendered-page counts per document for one case, for the page that builds the grid. */
export async function renderedCountsFor(setId: number): Promise<Record<string, { rendered: number; pageCount: number | null; status: string }>> {
  if (!db) return {};
  const rows = await db.select({ docKey: discoveryRenderJobs.docKey, rendered: discoveryRenderJobs.rendered, pageCount: discoveryRenderJobs.pageCount, status: discoveryRenderJobs.status }).from(discoveryRenderJobs).where(eq(discoveryRenderJobs.setId, setId)).catch(() => []);
  const out: Record<string, { rendered: number; pageCount: number | null; status: string }> = {};
  for (const r of rows) out[r.docKey] = { rendered: r.rendered, pageCount: r.pageCount, status: r.status };
  return out;
}

/** The oldest case with pages left to render (for the cron), or null. */
export async function nextSetNeedingRender(): Promise<number | null> {
  if (!db) return null;
  const [row] = await db.select({ setId: discoveryRenderJobs.setId }).from(discoveryRenderJobs)
    .where(and(inArray(discoveryRenderJobs.status, ["pending", "running"]), or(isNull(discoveryRenderJobs.lockUntil), lt(discoveryRenderJobs.lockUntil, new Date()))))
    .orderBy(asc(discoveryRenderJobs.updatedAt)).limit(1);
  return row?.setId ?? null;
}

function reasonFrom(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as Error)?.message ?? e ?? "unknown error");
  if (name === "PasswordException" || /password/i.test(msg)) return "password-protected PDF — the browser shows it page by page instead";
  if (name === "InvalidPDFException" || /invalid pdf/i.test(msg)) return "file is not a readable PDF";
  return `${name || "error"}: ${msg}`.slice(0, 300);
}

/** Render one document's pages until it is finished or the budget is spent.
 *  Returns true when the document needs no more work. */
async function renderOne(setId: number, t: Target, job: typeof discoveryRenderJobs.$inferSelect, budgetMs: number): Promise<boolean> {
  const started = Date.now();
  const fail = async (error: string, status: "failed" | "skipped" = "failed") => {
    await db!.update(discoveryRenderJobs).set({ status, error: error.slice(0, 500), lockUntil: null, updatedAt: new Date() }).where(eq(discoveryRenderJobs.docKey, t.docKey));
    return true;
  };
  if (!t.url) return fail("no stored file", "skipped");
  if (t.sizeBytes && t.sizeBytes > MAX_BYTES) return fail(`file is ${Math.round(t.sizeBytes / 1048576)} MB — over the ${Math.round(MAX_BYTES / 1048576)} MB ceiling for page pictures`, "skipped");
  await db!.update(discoveryRenderJobs).set({ status: "running", lockUntil: new Date(Date.now() + LOCK_MS), attempts: job.attempts + 1, updatedAt: new Date() }).where(eq(discoveryRenderJobs.docKey, t.docKey));

  let doc: PdfDoc | null = null;
  try {
    const res = await fetch(t.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`stored file returned HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await (await import("@/lib/documents/pdf-worker")).ensurePdfWorker();
    const [{ getDocument }, { createCanvas }] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("@napi-rs/canvas")]);
    const opened: PdfDoc = (await getDocument({ data: bytes, useSystemFonts: true }).promise) as unknown as PdfDoc;
    doc = opened;
    const numPages = opened.numPages;
    if (job.pageCount !== numPages) {
      await db!.update(discoveryRenderJobs).set({ pageCount: numPages }).where(eq(discoveryRenderJobs.docKey, t.docKey));
      // The grid lays itself out from the recorded count, so record it on the document too.
      if (t.docKey.startsWith("doc:")) await db!.update(discoveryDocs).set({ pageCount: numPages }).where(and(eq(discoveryDocs.id, Number(t.docKey.slice(4))), isNull(discoveryDocs.pageCount)));
      else await db!.update(shareFiles).set({ pageCount: numPages }).where(and(eq(shareFiles.id, Number(t.docKey.slice(6))), isNull(shareFiles.pageCount)));
    }
    // Resume after the last page that actually has pictures (not the counter —
    // a crash between upload and bookkeeping must not leave a hole).
    const [{ n: have }] = await db!.select({ n: sql<number>`coalesce(max(page), 0)` }).from(discoveryPageImages).where(eq(discoveryPageImages.docKey, t.docKey));
    let rendered = Number(have);
    const uploads: Promise<void>[] = [];
    const base = `discovery/pages/${setId}/${t.docKey.replace(":", "-")}`;
    const flush = async () => { await Promise.all(uploads.splice(0, uploads.length)); };

    for (let n = rendered + 1; n <= numPages; n++) {
      if (Date.now() - started > budgetMs) {
        await flush();
        await db!.update(discoveryRenderJobs).set({ rendered, status: "pending", lockUntil: null, updatedAt: new Date() }).where(eq(discoveryRenderJobs.docKey, t.docKey));
        return false;
      }
      const page = await opened.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = READ_W / vp1.width;
      const vp = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
      const read = canvas.toBuffer("image/jpeg", JPEG_Q_READ);
      const tw = THUMB_W, th = Math.round(canvas.height * (THUMB_W / canvas.width));
      const thumbCanvas = createCanvas(tw, th);
      thumbCanvas.getContext("2d").drawImage(canvas, 0, 0, tw, th);
      const thumb = thumbCanvas.toBuffer("image/jpeg", JPEG_Q_THUMB);
      page.cleanup();
      const pageNo = n, w = canvas.width, h = canvas.height;
      uploads.push((async () => {
        const [tb, rb] = await Promise.all([
          put(`${base}/${pageNo}-t.jpg`, thumb, { access: "public", contentType: "image/jpeg", addRandomSuffix: true }),
          put(`${base}/${pageNo}-r.jpg`, read, { access: "public", contentType: "image/jpeg", addRandomSuffix: true }),
        ]);
        await db!.insert(discoveryPageImages).values({ docKey: t.docKey, page: pageNo, thumbUrl: tb.url, readUrl: rb.url, width: w, height: h })
          .onConflictDoUpdate({ target: [discoveryPageImages.docKey, discoveryPageImages.page], set: { thumbUrl: tb.url, readUrl: rb.url, width: w, height: h } });
      })());
      if (uploads.length >= UPLOAD_PARALLEL) {
        await flush();
        rendered = n;
        if (n % 10 === 0) await db!.update(discoveryRenderJobs).set({ rendered, lockUntil: new Date(Date.now() + LOCK_MS), updatedAt: new Date() }).where(eq(discoveryRenderJobs.docKey, t.docKey));
      }
    }
    await flush();
    await db!.update(discoveryRenderJobs).set({ rendered: numPages, status: "done", error: "", lockUntil: null, updatedAt: new Date() }).where(eq(discoveryRenderJobs.docKey, t.docKey));
    return true;
  } catch (e) {
    console.error(`[page-images] ${t.docKey} "${t.name}":`, e);
    if (job.attempts + 1 >= 3) return fail(reasonFrom(e));
    await db!.update(discoveryRenderJobs).set({ status: "pending", error: reasonFrom(e), lockUntil: null, updatedAt: new Date() }).where(eq(discoveryRenderJobs.docKey, t.docKey));
    return true;
  } finally {
    if (doc) await doc.cleanup().catch(() => {});
  }
}

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; cleanup: () => Promise<unknown> };
type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<unknown> }; cleanup: () => void };

/** One sweep: render pages across the case until the budget is spent. */
export async function renderPagesChunk(setId: number, budgetMs = 45_000): Promise<RenderStatus> {
  if (!db) return { jobs: [], pagesLeft: 0, pagesTotal: 0, done: true };
  const started = Date.now();
  const { targets, jobs } = await syncJobs(setId);
  let current: string | undefined;
  for (const t of targets) {
    const job = jobs.get(t.docKey);
    if (!job || job.status === "done" || job.status === "failed" || job.status === "skipped") continue;
    if (job.lockUntil && job.lockUntil > new Date()) continue; // another sweep has it
    const left = budgetMs - (Date.now() - started);
    if (left < 8_000) { current = t.name; break; }
    current = t.name;
    const finished = await renderOne(setId, t, job, left);
    if (!finished) break;
  }
  const after = await syncJobs(setId);
  const status = summarize(after.targets, after.jobs, current);
  return status.done ? { ...status, current: undefined } : status;
}

/** Picture URLs for one page (null when not rendered yet). */
export async function pageImageFor(docKey: string, page: number): Promise<{ thumbUrl: string; readUrl: string } | null> {
  if (!db) return null;
  const [row] = await db.select({ thumbUrl: discoveryPageImages.thumbUrl, readUrl: discoveryPageImages.readUrl }).from(discoveryPageImages).where(and(eq(discoveryPageImages.docKey, docKey), eq(discoveryPageImages.page, page)));
  return row ?? null;
}
