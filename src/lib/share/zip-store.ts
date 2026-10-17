import "server-only";
import { Readable, Transform } from "stream";
import { createHash } from "crypto";
import { createRequire } from "module";
import { put, head, del } from "@vercel/blob";

// archiver is CommonJS; load it via require so the bundler doesn't trip on its
// default export interop (same as lib/share/zip.ts).
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver") as {
  ZipArchive: new (opts?: { store?: boolean; zlib?: { level?: number } }) => import("archiver").Archiver;
};

export type StoreZipEntry = { name: string; url: string; size: number | null };
export type StoredZip = { url: string; pathname: string; size: number; sha256: string };

/**
 * Pack `entries` into one stored (uncompressed) ZIP and stream it straight
 * into Blob storage with a multipart upload — nothing is held in memory or on
 * disk beyond a few buffers, whatever the archive's size.
 *
 * Strict by design: a prepared package must be complete, so any file that
 * cannot be fetched, or arrives short of its known length, fails the whole
 * part (the caller retries later). The finished object is read back with a
 * HEAD request and its length compared with the bytes we wrote before the
 * part is reported as stored.
 */
export async function storeZip(entries: StoreZipEntry[], pathname: string, opts: { onProgress?: (bytesWritten: number, entryIndex: number) => void; signal?: AbortSignal } = {}): Promise<StoredZip> {
  const archive = new ZipArchive({ store: true });
  const hash = createHash("sha256");
  let written = 0;
  // Count and hash INSIDE the pipeline. A 'data' listener on a stream that
  // someone else will consume later switches it to flowing mode and whatever
  // it emits before that consumer attaches is lost — silently short archives.
  const counter = new Transform({ transform(c: Buffer, _enc, cb) { hash.update(c); written += c.length; cb(null, c); } });

  let failure: Error | null = null;
  const fail = (err: Error) => { if (!failure) failure = err; archive.abort(); counter.destroy(err); };

  // Feed entries one at a time; a fetch failure aborts the archive so the
  // upload fails (the SDK sees the stream error) instead of producing a
  // ZIP with a file quietly missing.
  const feeder = (async () => {
    try {
      const used = new Set<string>();
      for (let i = 0; i < entries.length; i++) {
        if (opts.signal?.aborted) throw new Error("cancelled");
        const e = entries[i];
        let name = (e.name || "file").replace(/\\/g, "/").replace(/^\/+/, "");
        if (used.has(name)) { const dot = name.lastIndexOf("."); const stem = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : ""; let k = 2; while (used.has(`${stem} (${k})${ext}`)) k++; name = `${stem} (${k})${ext}`; }
        used.add(name);
        let res: Response | null = null;
        let lastErr = "";
        for (let attempt = 1; attempt <= 3 && !res; attempt++) {
          try {
            const r = await fetch(e.url, { cache: "no-store", signal: opts.signal });
            if (r.ok && r.body) res = r; else { lastErr = `storage answered ${r.status}`; await r.body?.cancel().catch(() => {}); }
          } catch (err) { lastErr = (err as Error).message; }
          if (!res && attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
        }
        if (!res || !res.body) throw new Error(`Could not fetch "${name}" (${lastErr || "no response"})`);
        const expected = Number(res.headers.get("content-length") || 0) || e.size || 0;
        let got = 0;
        const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
        const meter = new Transform({ transform(c: Buffer, _enc, cb) { got += c.length; opts.onProgress?.(written, i); cb(null, c); } });
        const done = new Promise<void>((resolve, reject) => {
          archive.once("entry", () => resolve());
          body.once("error", reject);
          meter.once("error", reject);
        });
        body.pipe(meter);
        archive.append(meter, { name });
        await done;
        if (expected > 0 && got !== expected) throw new Error(`"${name}" arrived short (${got} of ${expected} bytes)`);
      }
      await archive.finalize();
    } catch (err) {
      fail(err as Error);
    }
  })();

  archive.on("error", (err: Error) => fail(err));
  archive.on("warning", (err: Error) => fail(err));
  archive.pipe(counter);

  let blob: { url: string; pathname: string };
  try {
    blob = await put(pathname, counter, { access: "public", multipart: true, contentType: "application/zip", addRandomSuffix: false, allowOverwrite: true, abortSignal: opts.signal });
  } catch (err) {
    await feeder.catch(() => {});
    throw failure ?? err;
  }
  await feeder;
  if (failure) throw failure;

  // Read the stored object back: its length must be exactly what we wrote.
  let meta: { size: number } | null = null;
  for (let i = 0; i < 4 && !meta; i++) { meta = await head(blob.url).catch(() => null); if (!meta) await new Promise((r) => setTimeout(r, 1500)); }
  if (!meta || meta.size !== written) {
    try { await del(blob.url); } catch { /* best-effort cleanup */ }
    throw new Error(`Stored archive length mismatch (${meta ? meta.size : "unreadable"} vs ${written} written)`);
  }
  return { url: blob.url, pathname: blob.pathname, size: written, sha256: hash.digest("hex") };
}
