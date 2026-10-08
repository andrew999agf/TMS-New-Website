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
 * Parse an `?ids=1,2,3` download filter. Returns `null` when the parameter is
 * absent or holds no usable id — meaning "no filter, include everything".
 *
 * This exists because the obvious one-liner is quietly wrong: `"".split(",")`
 * yields `[""]`, and `Number("")` is `0`, which *is* finite. A missing `ids`
 * parameter therefore produced the set `{0}`, which matched no file and filtered
 * every document out — breaking "Download all" and "Download recent uploads".
 */
export function parseFileIds(raw: string | null | undefined): Set<number> | null {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

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

export type ZipFile = { url: string; name: string; size?: number | null };

/**
 * Stream a set of remote files (Blob URLs) into one ZIP download. Stored,
 * not deflated: nearly everything here is PDF/JPEG/video that doesn't
 * compress, and deflating 2+ GB inside a serverless function is what ran
 * big downloads into the time limit (a cut-off stream is a ZIP with no
 * central directory — Windows reports it as a folder it "must copy files
 * into"). Files that can't be fetched are listed in "_MISSING FILES.txt"
 * inside the archive instead of silently vanishing.
 */
export function zipResponse(files: ZipFile[], zipName: string): Response {
  const archive = new ZipArchive({ store: true } as { zlib?: { level?: number } });

  (async () => {
    const missing: string[] = [];
    try {
      const used = new Set<string>();
      for (const f of files) {
        let name = f.name || "file";
        // Avoid collisions if two entries resolve to the same path.
        if (used.has(name)) { const dot = name.lastIndexOf("."); const stem = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : ""; let i = 2; while (used.has(`${stem} (${i})${ext}`)) i++; name = `${stem} (${i})${ext}`; }
        used.add(name);
        let res: globalThis.Response | null = null;
        try { res = await fetch(f.url); } catch { res = null; }
        if (!res || !res.ok || !res.body) { missing.push(name); continue; }
        const done = new Promise<void>((r) => archive.once("entry", () => r()));
        archive.append(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), { name });
        await done;
      }
      if (missing.length) {
        const done = new Promise<void>((r) => archive.once("entry", () => r()));
        archive.append(`These files could not be retrieved when this ZIP was made and are NOT included:\n\n${missing.join("\n")}\n`, { name: "_MISSING FILES.txt" });
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

/* ------------------------------ big downloads ------------------------------ */

/** One ZIP is kept under this size so it streams well inside the function's
 *  time limit and never needs ZIP64 (which Windows' built-in extractor
 *  handles badly). Overridable for tests. */
const PART_BYTES = Math.max(1, Number(process.env.SHARE_ZIP_PART_MB) || 900) * 1024 * 1024;
const PART_FILES = 500;
const UNKNOWN_SIZE = 5 * 1024 * 1024; // a file whose size wasn't recorded

export type ZipPart = { files: ZipFile[]; bytes: number };

/** Split a download into ZIPs of at most PART_BYTES / PART_FILES each, in order. */
export function planZipParts(files: ZipFile[]): ZipPart[] {
  const parts: ZipPart[] = [];
  let cur: ZipPart = { files: [], bytes: 0 };
  for (const f of files) {
    const size = f.size && f.size > 0 ? f.size : UNKNOWN_SIZE;
    if (cur.files.length && (cur.bytes + size > PART_BYTES || cur.files.length >= PART_FILES)) {
      parts.push(cur);
      cur = { files: [], bytes: 0 };
    }
    cur.files.push(f);
    cur.bytes += size;
  }
  if (cur.files.length) parts.push(cur);
  return parts;
}

const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The download entry point every ZIP route uses. A set that fits in one
 * ZIP streams straight away. A bigger set gets a small page listing its
 * parts (and a button that downloads them one after another); each part
 * is its own ordinary ZIP, so any of them can be re-fetched alone.
 */
export function zipOrParts(req: Request, files: ZipFile[], zipName: string): Response {
  const parts = planZipParts(files);
  const url = new URL(req.url);
  const want = Number(url.searchParams.get("part"));
  const stem = zipName.replace(/\.zip$/i, "");
  if (parts.length <= 1) return zipResponse(files, zipName);
  if (Number.isInteger(want) && want >= 1 && want <= parts.length) {
    return zipResponse(parts[want - 1].files, `${stem} (part ${want} of ${parts.length}).zip`);
  }
  const total = parts.reduce((n, p) => n + p.bytes, 0);
  const partUrl = (i: number) => { const u = new URL(url); u.searchParams.set("part", String(i)); return u.pathname + u.search; };
  const rows = parts.map((p, i) => `<li><a class="btn" href="${escHtml(partUrl(i + 1))}" download>Part ${i + 1} of ${parts.length}</a><span class="meta">${p.files.length} file${p.files.length === 1 ? "" : "s"} · about ${fmtBytes(p.bytes)}</span></li>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(stem)} — download in parts</title>
<style>
  body{margin:0;font:15px/1.5 Helvetica,Arial,sans-serif;background:#f6f3ee;color:#1a1a1a}
  main{max-width:640px;margin:40px auto;padding:28px;background:#fff;border:1px solid #e3ddd3;border-radius:10px}
  h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#555}
  ul{list-style:none;padding:0;margin:0 0 18px}li{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #eee}
  .btn{display:inline-block;padding:8px 14px;border-radius:6px;background:#7a1f2b;color:#fff;text-decoration:none;font-weight:600;min-width:120px;text-align:center}
  .meta{color:#777;font-size:13px}.all{background:#1a1a1a}.note{font-size:13px;color:#777}
  @media (prefers-color-scheme:dark){body{background:#17151a;color:#eee}main{background:#221f25;border-color:#3a353f}p,.meta,.note{color:#b8b2bd}li{border-color:#3a353f}}
</style></head><body><main>
<h1>${escHtml(stem)}</h1>
<p>This folder is about <strong>${fmtBytes(total)}</strong> across ${files.length} files — too big for one reliable download, so it comes as <strong>${parts.length} ZIP files</strong>. Each one opens on its own; together they hold everything, with the folder structure kept.</p>
<p><a class="btn all" href="#" id="all">Download all ${parts.length} parts</a> <span class="note">(your browser may ask once to allow multiple downloads)</span></p>
<ul>${rows}</ul>
<p class="note">Save every part in the same place. If a download stops early, just click that part again.</p>
</main>
<script>
document.getElementById("all").addEventListener("click",function(e){e.preventDefault();var links=[].slice.call(document.querySelectorAll("li a.btn"));links.forEach(function(a,i){setTimeout(function(){var f=document.createElement("iframe");f.style.display="none";f.src=a.getAttribute("href");document.body.appendChild(f);},i*2500);});this.textContent="Starting "+links.length+" downloads…";});
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
