import "server-only";
import { Readable } from "stream";
import { createRequire } from "module";

// archiver is CommonJS; load it via require so the bundler doesn't trip on its
// default export interop.
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver") as {
  ZipArchive: new (opts?: { zlib?: { level?: number } }) => import("archiver").Archiver;
};

/**
 * Stream a set of remote files (Blob URLs) into a single ZIP download, keeping
 * their folder structure via the entry `name` (e.g. "Discovery/Batch 1/a.pdf").
 * Files are fetched and appended one at a time so memory and open connections
 * stay bounded even for large productions.
 */
/** Stream a set of in-memory buffers into a single ZIP download. */
export function zipBuffers(entries: { name: string; data: Buffer }[], zipName: string): Response {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  (async () => {
    try {
      for (const e of entries) {
        const done = new Promise<void>((r) => archive.once("entry", () => r()));
        archive.append(e.data, { name: e.name });
        await done;
      }
      await archive.finalize();
    } catch { archive.abort(); }
  })();
  const web = Readable.toWeb(archive as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
  const safe = zipName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new Response(web, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function zipResponse(files: { url: string; name: string }[], zipName: string): Response {
  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      const used = new Set<string>();
      for (const f of files) {
        let name = f.name || "file";
        // Avoid collisions if two entries resolve to the same path.
        if (used.has(name)) { const dot = name.lastIndexOf("."); const stem = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : ""; let i = 2; while (used.has(`${stem} (${i})${ext}`)) i++; name = `${stem} (${i})${ext}`; }
        used.add(name);
        const res = await fetch(f.url);
        if (!res.ok || !res.body) continue;
        const done = new Promise<void>((r) => archive.once("entry", () => r()));
        archive.append(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), { name });
        await done;
      }
      await archive.finalize();
    } catch {
      archive.abort();
    }
  })();

  const web = Readable.toWeb(archive as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
  const safe = zipName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new Response(web, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
