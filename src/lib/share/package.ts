import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { shareFiles, shareFolders, sharePackages, shareRecipients, type SharePackagePart } from "@/db/schema";
import { storeZip } from "./zip-store";

/**
 * Prepared download packages.
 *
 * Big productions (tens of gigabytes, a thousand photos) cannot be zipped
 * while a recipient waits — not by the server inside its time limit, and
 * not by a browser tab that must stay open for an hour. So the firm's side
 * packs the folder ahead of time into numbered ZIP parts stored next to the
 * originals, and the recipient downloads plain files with their browser's
 * own download manager: pause, resume, close the tab, come back.
 *
 * The plan is deterministic (files in folder order, parts filled to the
 * cap), so when the folder changes only the parts whose contents changed
 * are rebuilt. A package is "fresh" when its signature matches the folder's
 * current files; otherwise it is stale and rebuilds — on request, or on its
 * own once the folder has been quiet for a while.
 */

export const PART_BYTES = Math.max(1, Number(process.env.SHARE_PACKAGE_PART_MB) || 2048) * 1024 * 1024;
const PART_FILES = 5000;
const UNKNOWN_SIZE = 5 * 1024 * 1024;
const LEASE_MS = 6 * 60_000;
const MAX_TRIES = 4;
const RETRY_COOLDOWN_MS = 2 * 60_000;
const MIN_PART_BYTES = 256 * 1024 * 1024;
/** A stale package rebuilds on its own once the folder has been quiet this long. */
export const AUTO_REBUILD_QUIET_MS = 10 * 60_000;
/** Folders at least this big get a package prepared automatically — the
 *  moment they are shared, uploaded to, or opened by a recipient — so nobody
 *  has to ask the firm for anything. Below it, the browser-built ZIP is fine. */
export const AUTO_PACKAGE_BYTES = Math.max(1, Number(process.env.SHARE_PACKAGE_AUTO_MB) || 1536) * 1024 * 1024;

export type PlanFile = { id: number; filename: string; url: string; sizeBytes: number | null };
export type PackageRow = typeof sharePackages.$inferSelect;
export type PackageState = "none" | "building" | "ready" | "stale" | "failed";

const safeName = (s: string) => s.replace(/[—–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, "").replace(/[\\/:*?"<>|]/g, "-").replace(/[^\x20-\x7E]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "documents";
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Files in folder order: by path, naturally (photo 2 before photo 10). */
export function orderFiles<T extends { filename: string; id: number }>(files: T[]): T[] {
  return [...files].sort((a, b) => collator.compare(a.filename, b.filename) || a.id - b.id);
}

/** Fingerprint of the file set — ids, sizes and names in folder order. */
export function signatureOf(files: PlanFile[]): string {
  return orderFiles(files).map((f) => `${f.id}:${f.sizeBytes ?? "?"}:${f.filename}`).join("\n");
}

/** Plan the parts for a file set: folder order, filled to the cap, never
 *  splitting a file. A single oversize file gets a part of its own. */
export function planParts(files: PlanFile[], folderName: string, cap = PART_BYTES): SharePackagePart[] {
  const groups: PlanFile[][] = [];
  let cur: PlanFile[] = [], bytes = 0;
  for (const f of orderFiles(files)) {
    const s = f.sizeBytes && f.sizeBytes > 0 ? f.sizeBytes : UNKNOWN_SIZE;
    if (cur.length && (bytes + s > cap || cur.length >= PART_FILES)) { groups.push(cur); cur = []; bytes = 0; }
    cur.push(f); bytes += s;
  }
  if (cur.length) groups.push(cur);
  const base = safeName(folderName);
  const pad = String(groups.length).length;
  return groups.map((g, i) => ({
    n: i + 1,
    name: groups.length === 1 ? `${base}.zip` : `${base} - Part ${String(i + 1).padStart(pad, "0")} of ${groups.length}.zip`,
    fileIds: g.map((f) => f.id),
    bytes: g.reduce((n, f) => n + (f.sizeBytes ?? 0), 0),
    status: "pending" as const,
    tries: 0,
  }));
}

/** Re-plan against the folder's current files, keeping every finished part
 *  whose contents are unchanged; parts no longer in the plan are deleted. */
function replan(existing: SharePackagePart[], files: PlanFile[], folderName: string, cap: number): { parts: SharePackagePart[]; orphans: string[] } {
  const fresh = planParts(files, folderName, cap);
  const byKey = new Map(existing.filter((p) => p.status === "ready" && p.pathname).map((p) => [p.fileIds.join(","), p]));
  // Attempts on a pending part with the same contents carry over, so a part
  // cut off by the time limit is still recognised as such after a re-plan.
  const pendingTries = new Map(existing.filter((p) => p.status === "pending" && p.tries > 0).map((p) => [p.fileIds.join(","), p]));
  const used = new Set<SharePackagePart>();
  const parts = fresh.map((p) => {
    const key = p.fileIds.join(",");
    const prev = byKey.get(key);
    if (prev && !used.has(prev)) { used.add(prev); return { ...prev, n: p.n, name: p.name, bytes: p.bytes }; }
    const pend = pendingTries.get(key);
    return pend ? { ...p, tries: pend.tries, error: pend.error } : p;
  });
  const orphans = existing.filter((p) => p.pathname && !used.has(p)).map((p) => p.url!).filter(Boolean);
  // A reused part keeps its stored object even if the display name changed;
  // the recipient route serves it under the planned name.
  return { parts, orphans };
}

async function folderFiles(folderId: number): Promise<PlanFile[]> {
  if (!db) return [];
  return db.select({ id: shareFiles.id, filename: shareFiles.filename, url: shareFiles.url, sizeBytes: shareFiles.sizeBytes }).from(shareFiles).where(eq(shareFiles.folderId, folderId));
}

export async function getPackage(folderId: number): Promise<PackageRow | null> {
  if (!db) return null;
  // Tolerates the table not existing yet (first request before the one-time
  // database update has run): no package, rather than a broken page.
  try {
    const [row] = await db.select().from(sharePackages).where(eq(sharePackages.folderId, folderId));
    return row ?? null;
  } catch { return null; }
}

/** What a package is, right now, against the folder's current files. */
export function packageState(pkg: PackageRow | null, files: PlanFile[]): PackageState {
  if (!pkg) return "none";
  if (pkg.status === "building") return "building";
  if (pkg.status === "failed") return "failed";
  return pkg.signature === signatureOf(files) ? "ready" : "stale";
}

/** The parts a recipient may download: a finished package, fresh or stale
 *  (a stale one is still every file it says it is; the page notes newer
 *  documents separately). */
export function downloadableParts(pkg: PackageRow | null): SharePackagePart[] {
  if (!pkg || pkg.status !== "ready") return [];
  return pkg.parts.filter((p) => p.status === "ready" && p.url);
}

/** Ask for a package (or a rebuild). Idempotent: an in-progress build is left
 *  alone; a finished or failed one is re-planned against the current files,
 *  reusing unchanged parts. Returns the row; the caller kicks off `buildStep`. */
export async function requestPackage(folderId: number, by: string | null): Promise<PackageRow | null> {
  if (!db) return null;
  const [folder] = await db.select({ name: shareFolders.name }).from(shareFolders).where(eq(shareFolders.id, folderId));
  if (!folder) return null;
  const files = await folderFiles(folderId);
  const existing = await getPackage(folderId);
  const sig = signatureOf(files);
  if (existing && existing.status === "building" && existing.signature === sig) return existing;
  const cap = existing?.partBytes ?? PART_BYTES;
  const { parts, orphans } = replan(existing?.parts ?? [], files, folder.name, cap);
  if (orphans.length) { try { await del(orphans); } catch { /* best-effort */ } }
  const allReady = parts.length > 0 && parts.every((p) => p.status === "ready");
  const values = {
    folderId, status: allReady ? "ready" : "building", signature: sig, parts, partBytes: cap,
    fileCount: files.length, totalBytes: files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0),
    error: null, lockUntil: null, requestedBy: by, requestedAt: new Date(), updatedAt: new Date(),
    builtAt: allReady ? new Date() : null,
  };
  const [row] = await db.insert(sharePackages).values(values).onConflictDoUpdate({ target: sharePackages.folderId, set: values }).returning();
  return row;
}

/** Remove a folder's package and its stored parts. */
export async function deletePackage(folderId: number): Promise<void> {
  if (!db) return;
  const pkg = await getPackage(folderId);
  if (!pkg) return;
  const urls = pkg.parts.map((p) => p.url).filter((u): u is string => !!u);
  if (urls.length) { try { await del(urls); } catch { /* best-effort */ } }
  await db.delete(sharePackages).where(eq(sharePackages.folderId, folderId));
}

/** Stop a build in progress (keeps finished parts for a later rebuild). */
export async function cancelPackageBuild(folderId: number): Promise<void> {
  if (!db) return;
  await db.update(sharePackages).set({ status: "failed", error: "Stopped by the firm.", lockUntil: null, updatedAt: new Date() }).where(and(eq(sharePackages.folderId, folderId), eq(sharePackages.status, "building")));
}

export type StepResult = { did: "nothing" | "busy" | "built" | "finished" | "failed"; part?: number; parts?: number; note?: string };

/**
 * Advance a package: take the lease, pack pending parts one after another
 * until the time budget runs low, release. Safe to call from a cron tick and
 * from an immediate kick-off at once — the lease makes the second a no-op.
 */
export async function buildStep(folderId: number, budgetMs: number): Promise<StepResult> {
  if (!db) return { did: "nothing", note: "no database" };
  const started = Date.now();
  const now = new Date();
  // Take the lease atomically.
  const [leased] = await db.update(sharePackages)
    .set({ lockUntil: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(sharePackages.folderId, folderId), eq(sharePackages.status, "building"), or(isNull(sharePackages.lockUntil), lt(sharePackages.lockUntil, now))))
    .returning();
  if (!leased) return { did: "busy" };
  const release = (set: Partial<typeof sharePackages.$inferInsert>) => db!.update(sharePackages).set({ ...set, lockUntil: null, updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));

  try {
    // Re-plan if the folder changed since the plan was made.
    const [folder] = await db.select({ name: shareFolders.name }).from(shareFolders).where(eq(shareFolders.id, folderId));
    if (!folder) { await db.delete(sharePackages).where(eq(sharePackages.folderId, folderId)); return { did: "nothing", note: "folder gone" }; }
    let files = await folderFiles(folderId);
    let parts = leased.parts;
    let cap = leased.partBytes || PART_BYTES;
    const sig = signatureOf(files);
    if (sig !== leased.signature) {
      const r = replan(parts, files, folder.name, cap);
      parts = r.parts;
      if (r.orphans.length) { try { await del(r.orphans); } catch { /* best-effort */ } }
      await db.update(sharePackages).set({ parts, signature: sig, fileCount: files.length, totalBytes: files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0), updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
    }
    const fileById = new Map(files.map((f) => [f.id, f]));
    let lastRate = 0; // bytes per ms, from the last part built in this step
    let built = 0;
    for (;;) {
      const next = parts.find((p) => p.status === "pending");
      if (!next) {
        await release({ status: "ready", builtAt: new Date(), error: null, parts });
        return { did: "finished", parts: parts.length };
      }
      // Enough budget for this part? Estimate from the rate observed so far;
      // without one, allow it and let the lease protect against overlap.
      const elapsed = Date.now() - started;
      const predicted = lastRate > 0 ? next.bytes / lastRate : 0;
      if (built > 0 && (elapsed + predicted > budgetMs * 0.85 || budgetMs - elapsed < 20_000)) {
        await release({ parts });
        return { did: "built", part: built, parts: parts.length, note: "budget" };
      }
      // A part that was started before and never finished or failed was cut
      // off by the server's time limit. Halve the part size and re-plan so
      // the pending work is packed in smaller pieces (finished parts stay).
      if (next.tries > 0 && !next.error && next.fileIds.length > 1 && cap > MIN_PART_BYTES) {
        cap = Math.max(MIN_PART_BYTES, Math.floor(cap / 2));
        const r = replan(parts, files, folder.name, cap);
        parts = r.parts;
        if (r.orphans.length) { try { await del(r.orphans); } catch { /* best-effort */ } }
        await db.update(sharePackages).set({ parts, partBytes: cap, updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
        continue;
      }
      if (next.tries >= MAX_TRIES) {
        next.status = "failed";
        await release({ status: "failed", error: `Part ${next.n} (${next.name}) could not be finished inside the server's time limit, even after shrinking the parts.`, parts });
        return { did: "failed", part: next.n, note: "time limit" };
      }
      const entries = next.fileIds.map((id) => fileById.get(id)).filter((f): f is PlanFile => !!f).map((f) => ({ name: f.filename, url: f.url, size: f.sizeBytes }));
      if (entries.length !== next.fileIds.length) {
        // A file vanished mid-plan: re-plan on the next pass.
        files = await folderFiles(folderId);
        const r = replan(parts, files, folder.name, cap);
        parts = r.parts;
        await db.update(sharePackages).set({ parts, signature: signatureOf(files), updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
        continue;
      }
      const buildId = randomBytes(4).toString("hex");
      const pathname = `share-packages/${folderId}/${buildId}/${next.name}`;
      const t0 = Date.now();
      let lastTick = 0;
      try {
        next.tries += 1;
        // Record the attempt before packing, so a hard cut-off is visible next time.
        await db.update(sharePackages).set({ parts, updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
        const stored = await storeZip(entries, pathname, {
          onProgress: (bytes) => {
            // Keep the lease alive and show progress every ~15 s of packing.
            const t = Date.now();
            if (t - lastTick > 15_000) {
              lastTick = t;
              void db!.update(sharePackages).set({ lockUntil: new Date(t + LEASE_MS), parts: parts.map((p) => (p.n === next.n ? { ...p, size: bytes } : p)), updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
            }
          },
        });
        Object.assign(next, { status: "ready", url: stored.url, pathname: stored.pathname, size: stored.size, sha256: stored.sha256, builtAt: new Date().toISOString(), error: undefined });
        lastRate = stored.size / Math.max(1, Date.now() - t0);
        built++;
        await db.update(sharePackages).set({ parts, lockUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
      } catch (err) {
        const msg = (err as Error).message || String(err);
        next.error = msg;
        if (next.tries >= MAX_TRIES) {
          next.status = "failed";
          await release({ status: "failed", error: `Part ${next.n} (${next.name}) could not be built after ${next.tries} tries: ${msg}`, parts });
          return { did: "failed", part: next.n, note: msg };
        }
        // Leave it pending with a cool-down, so a transient storage hiccup is
        // retried a couple of minutes later by the sweep — not hammered
        // within seconds by status polls nudging the builder.
        await db.update(sharePackages).set({ parts, lockUntil: new Date(Date.now() + RETRY_COOLDOWN_MS), updatedAt: new Date() }).where(eq(sharePackages.folderId, folderId));
        return { did: "built", part: built, parts: parts.length, note: `retry later: ${msg}` };
      }
    }
  } catch (err) {
    await release({ status: "failed", error: (err as Error).message || String(err) }).catch(() => {});
    return { did: "failed", note: (err as Error).message };
  }
}

/**
 * Cron sweep: advance every building package within the budget, then
 * queue rebuilds for stale auto packages whose folders have settled.
 */
export async function sweepPackages(budgetMs: number): Promise<{ steps: StepResult[]; queued: number[] }> {
  const out = { steps: [] as StepResult[], queued: [] as number[] };
  if (!db) return out;
  const started = Date.now();
  // Big shared folders with no package yet: start one, no questions asked.
  for (const id of await foldersNeedingPackages(5).catch(() => [] as number[])) {
    if (await ensurePackage(id).catch(() => false)) out.queued.push(id);
  }
  const building = await db.select({ folderId: sharePackages.folderId }).from(sharePackages).where(eq(sharePackages.status, "building")).orderBy(sharePackages.requestedAt);
  for (const b of building) {
    const left = budgetMs - (Date.now() - started);
    if (left < 30_000) break;
    out.steps.push(await buildStep(b.folderId, left));
  }
  // Auto-rebuild stale packages once the folder is quiet.
  const ready = await db.select({ pkg: sharePackages, updatedAt: shareFolders.updatedAt, uploadTotal: shareFolders.uploadTotal })
    .from(sharePackages).innerJoin(shareFolders, eq(shareFolders.id, sharePackages.folderId))
    .where(and(eq(sharePackages.status, "ready"), eq(sharePackages.auto, true)));
  for (const r of ready) {
    if (r.uploadTotal > 0) continue;
    if (r.updatedAt && Date.now() - r.updatedAt.getTime() < AUTO_REBUILD_QUIET_MS) continue;
    const files = await folderFiles(r.pkg.folderId);
    if (signatureOf(files) === r.pkg.signature) continue;
    const row = await requestPackage(r.pkg.folderId, null);
    if (row?.status === "building") out.queued.push(r.pkg.folderId);
  }
  return out;
}

/** The summary the admin page and the status poll show. */
export function summarize(pkg: PackageRow | null, files: PlanFile[]) {
  const state = packageState(pkg, files);
  const parts = pkg?.parts ?? [];
  const done = parts.filter((p) => p.status === "ready").length;
  const current = parts.find((p) => p.status === "pending");
  return {
    state,
    parts: parts.map((p) => ({ n: p.n, name: p.name, files: p.fileIds.length, bytes: p.bytes, size: p.size ?? null, status: p.status, sha256: p.sha256 ?? null, error: p.error ?? null })),
    done, total: parts.length,
    currentPart: current?.n ?? null, currentBytes: current?.size ?? 0,
    fileCount: pkg?.fileCount ?? 0, totalBytes: pkg?.totalBytes ?? 0,
    builtAt: pkg?.builtAt?.toISOString() ?? null, requestedAt: pkg?.requestedAt?.toISOString() ?? null,
    error: pkg?.error ?? null, auto: pkg?.auto ?? true, partBytes: pkg?.partBytes ?? PART_BYTES,
    newerFiles: state === "stale" && pkg ? Math.max(0, files.length - pkg.fileCount) : 0,
    folderBytes: files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0),
    autoBytes: AUTO_PACKAGE_BYTES,
  };
}
export type PackageSummary = ReturnType<typeof summarize>;

/**
 * Make sure a big folder has a package on the way, without anyone asking:
 * called when a recipient opens the folder and by the minute sweep for every
 * shared folder over the threshold. Returns true when a build was started.
 */
export async function ensurePackage(folderId: number): Promise<boolean> {
  if (!db) return false;
  const existing = await getPackage(folderId);
  if (existing) return false; // building, ready, stale (auto-rebuilds) or failed (firm decides)
  const [folder] = await db.select({ meta: shareFolders.meta }).from(shareFolders).where(eq(shareFolders.id, folderId));
  if (!folder || (folder.meta as { autoPackage?: boolean } | null)?.autoPackage === false) return false; // the firm switched it off for this folder
  const files = await folderFiles(folderId);
  const bytes = files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0);
  if (!files.length || bytes < AUTO_PACKAGE_BYTES) return false;
  const row = await requestPackage(folderId, null);
  return row?.status === "building";
}

/** Shared folders over the threshold that have no package yet. */
async function foldersNeedingPackages(limit: number): Promise<number[]> {
  if (!db) return [];
  const rows = await db.execute(sql`
    select f.folder_id as id
    from (select folder_id, sum(coalesce(size_bytes, 0))::bigint as bytes from share_files group by folder_id) f
    join share_folders sf on sf.id = f.folder_id and sf.archived = false
    where f.bytes >= ${AUTO_PACKAGE_BYTES}
      and not exists (select 1 from share_packages p where p.folder_id = f.folder_id)
      and coalesce((sf.meta->>'autoPackage')::boolean, true)
      and exists (select 1 from share_recipients r where r.folder_id = f.folder_id and r.revoked = false and (r.expires_at is null or r.expires_at > now()))
    order by f.bytes desc
    limit ${limit}`);
  return Array.from(rows as unknown as Iterable<{ id: unknown }>).map((r) => Number(r.id));
}

/** Delete the stored parts when a folder is deleted. */
export async function dropPackageForFolder(folderId: number): Promise<void> {
  await deletePackage(folderId).catch(() => {});
}
