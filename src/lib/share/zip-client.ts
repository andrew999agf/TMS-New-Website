/**
 * Browser-side ZIP download for shared folders.
 *
 * Why: a ZIP streamed from the hosted server is cut off whenever the server's
 * time limit hits mid-stream, and a cut-off ZIP has no directory at the end —
 * Windows reports it as empty. Building the archive HERE, from per-file
 * downloads that resume automatically if a transfer breaks, means an archive
 * is only ever saved when every file in it is complete. Nothing is ever
 * silently left out: if a file can't be fetched after many tries, the whole
 * archive is abandoned and the user is told.
 *
 * Format: stored (no compression — these are PDFs, photos and video), UTF-8
 * names, no ZIP64. An archive that would pass 3.8 GB is split into numbered
 * archives at file boundaries, so Windows' built-in extractor (which handles
 * ZIP64 badly) always gets plain ZIPs. When the browser offers a save-file
 * picker, the archive streams to disk and headers are patched in place; else
 * it goes through a disk-backed blob download with data descriptors.
 */

import { diagLog } from "@/lib/client-diag";

export type ZipInput = { id: number; name: string; size: number | null; url: string };

/* ---------------------------- diagnostics ---------------------------- */
/** What happened on each download attempt in this page, for the Diagnostics
 *  report / "Copy details". Names and sizes only — never links or tokens. */
type FileDiag = { name: string; expected: number | null; got: number; attempts: number; statuses: string[]; ms: number; ok: boolean; error?: string };
type RunDiag = { startedAt: string; zipName: string; files: number; bytes: number; sink: string; archives: number; perFile: FileDiag[]; result: string; ms?: number };
const runs: RunDiag[] = [];
export function zipDiagState(): Record<string, unknown> {
  const out: Record<string, unknown> = { runsThisPage: runs.length, saveFilePicker: typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function" };
  runs.slice(-3).forEach((r, i) => {
    const slow = [...r.perFile].filter((f) => f.ms > 0 && f.got > 0).sort((a, b) => a.got / a.ms - b.got / b.ms).slice(0, 3);
    out[`run${runs.length - Math.min(3, runs.length) + i + 1}`] = {
      startedAt: r.startedAt, zip: r.zipName, files: r.files, MB: Math.round(r.bytes / 1048576), archives: r.archives, sink: r.sink, result: r.result, seconds: r.ms != null ? Math.round(r.ms / 1000) : undefined,
      completed: r.perFile.filter((f) => f.ok).length,
      retried: r.perFile.filter((f) => f.attempts > 1).map((f) => `${f.name} ×${f.attempts} [${f.statuses.join(",")}]`).slice(0, 10),
      failed: r.perFile.filter((f) => !f.ok && f.error).map((f) => `${f.name}: ${f.error} (${f.got}/${f.expected ?? "?"} bytes, ${f.attempts} tries, ${f.statuses.join(",")})`).slice(0, 10),
      slowest: slow.map((f) => `${f.name} ${(f.got / 1048576 / (f.ms / 1000)).toFixed(1)} MB/s`),
    };
  });
  return out;
}
export type ZipProgress = { phase: "fetching" | "finishing" | "done" | "error"; fileIndex: number; fileCount: number; fileName: string; bytesDone: number; bytesTotal: number; archive: number; archives: number; message?: string };

const ARCHIVE_CAP = 3.8 * 1024 ** 3;
const MAX_ATTEMPTS = 15;

/* ------------------------------ CRC-32 ------------------------------ */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crcUpdate(crc: number, buf: Uint8Array): number { let c = crc ^ 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/* ------------------------------- sinks ------------------------------- */
type Sink = {
  seekable: boolean;
  write: (chunk: Uint8Array) => Promise<void>;
  patch?: (position: number, chunk: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

type FileHandle = { createWritable: () => Promise<{ write: (c: Uint8Array | { type: "write"; position: number; data: Uint8Array }) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> };
type PickerWindow = Window & {
  showSaveFilePicker?: (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle>;
  showDirectoryPicker?: (o: { mode: "readwrite"; startIn?: string }) => Promise<{ getFileHandle: (name: string, o: { create: boolean }) => Promise<FileHandle> }>;
};

/** The user closed a save/folder dialog — not a failure, but not a download either. */
export const DIALOG_CLOSED = "save dialog closed";

/**
 * Where archives go. The browser only lets a page open a save dialog right
 * after a click, so a download that needs several archives asks ONCE for a
 * folder (Chrome/Edge) and writes every part into it; a single archive asks
 * for a file. Browsers without those dialogs get ordinary downloads.
 */
async function makeSinkOpener(count: number, firstName: string): Promise<(name: string) => Promise<Sink>> {
  const w = window as PickerWindow;
  const fromHandle = async (handle: FileHandle): Promise<Sink> => {
    const writable = await handle.createWritable();
    return { seekable: true, write: (c) => writable.write(c), patch: (position, data) => writable.write({ type: "write", position, data }), close: () => writable.close(), abort: () => writable.abort() };
  };
  const dialog = async <T,>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (err) { if ((err as Error)?.name === "AbortError") throw new Error(DIALOG_CLOSED); throw err; } };
  if (count > 1 && w.showDirectoryPicker) {
    const dir = await dialog(() => w.showDirectoryPicker!({ mode: "readwrite", startIn: "downloads" }));
    return async (name) => fromHandle(await dir.getFileHandle(name, { create: true }));
  }
  if (count === 1 && w.showSaveFilePicker) {
    const handle = await dialog(() => w.showSaveFilePicker!({ suggestedName: firstName, types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }] }));
    return async () => fromHandle(handle);
  }
  return blobSink;
}

async function blobSink(name: string): Promise<Sink> {
  const blobs: Blob[] = []; let chunks: Uint8Array[] = []; let size = 0;
  const flush = () => { if (chunks.length) { blobs.push(new Blob(chunks as BlobPart[])); chunks = []; size = 0; } };
  return {
    seekable: false,
    write: async (c) => { chunks.push(c.slice()); size += c.byteLength; if (size > 64 * 1024 * 1024) flush(); },
    close: async () => { flush(); const blob = new Blob(blobs, { type: "application/zip" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); },
    abort: async () => { chunks = []; blobs.length = 0; },
  };
}

/* --------------------------- byte helpers ---------------------------- */
const enc = new TextEncoder();
function u16(v: number) { return [v & 0xff, (v >>> 8) & 0xff]; }
function u32(v: number) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }
function dosTime(d: Date) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff; }
function dosDate(d: Date) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff; }

/* --------------------------- resumable fetch -------------------------- */
/** Pull a URL fully, resuming with Range requests whenever the transfer breaks
 *  before the expected size. Calls onChunk in order; returns bytes received. */
async function pullResumable(url: string, expected: number | null, onChunk: (c: Uint8Array) => Promise<void>, onProgress: (got: number, total: number | null) => void, signal: AbortSignal, fd: FileDiag): Promise<{ bytes: number; crc: number }> {
  let got = 0, crc = 0, total = expected && expected > 0 ? expected : null, attempts = 0;
  const note = (s: string) => { fd.statuses.push(s); fd.attempts = attempts; fd.got = got; fd.expected = total; };
  for (;;) {
    if (signal.aborted) throw new Error("cancelled");
    attempts++;
    if (got > 0) diagLog("zip", `resuming ${fd.name} at ${got}${total ? ` of ${total}` : ""} (try ${attempts})`);
    let res: Response;
    try {
      res = await fetch(url, { headers: got > 0 ? { Range: `bytes=${got}-` } : {}, signal, cache: "no-store" });
    } catch (err) {
      if (signal.aborted) throw new Error("cancelled");
      note(`net:${String((err as Error).message).slice(0, 40)}`);
      if (attempts >= MAX_ATTEMPTS) throw new Error(`network error after ${attempts} tries: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * attempts)));
      continue;
    }
    note(String(res.status));
    if (got > 0 && res.status === 200) throw new Error("the server would not resume the file"); // can't rewind the archive
    if (!(res.status === 200 || res.status === 206)) {
      if (attempts >= MAX_ATTEMPTS || res.status === 403 || res.status === 404) throw new Error(`server said ${res.status}`);
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * attempts)));
      continue;
    }
    {
      // The server's own figure wins over the recorded size: a fresh 200
      // carries the true length, a 206 carries it after the slash.
      const cr = res.headers.get("content-range");
      const m = cr && /\/(\d+)$/.exec(cr);
      const cl = res.headers.get("content-length");
      if (m && Number(m[1]) > 0) total = Number(m[1]);
      else if (res.status === 200 && cl && Number(cl) > 0) total = Number(cl);
      if (expected && total && expected !== total) diagLog("zip", `${fd.name}: server length ${total} differs from recorded ${expected}`);
      fd.expected = total;
    }
    if (!res.body) throw new Error("empty response");
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength) { crc = crcUpdate(crc, value); await onChunk(value); got += value.byteLength; onProgress(got, total); }
      }
    } catch (err) {
      if (signal.aborted) throw new Error("cancelled");
      // transfer broke mid-way: loop and resume from `got`
      note(`cut@${got}:${String((err as Error)?.message ?? err).slice(0, 40)}`);
    }
    fd.got = got;
    if (total == null || got >= total) {
      if (total != null && got > total) throw new Error("received more bytes than the file's size");
      return { bytes: got, crc };
    }
    if (attempts >= MAX_ATTEMPTS) throw new Error(`transfer kept breaking (${got} of ${total} bytes after ${attempts} tries)`);
  }
}

/* --------------------------------- zip -------------------------------- */
type Central = { name: Uint8Array; crc: number; size: number; offset: number; flags: number; time: number; date: number };

async function writeArchive(sink: Sink, files: ZipInput[], report: (p: Partial<ZipProgress> & { fileIndex: number; fileName: string; bytesDone: number }) => void, signal: AbortSignal, run: RunDiag) {
  let offset = 0;
  const central: Central[] = [];
  const out = async (c: Uint8Array) => { await sink.write(c); offset += c.byteLength; };
  const now = new Date();
  const seen = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    // Unique entry names (two uploads with the same path).
    let nameStr = f.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (seen.has(nameStr)) { const dot = nameStr.lastIndexOf("."); const stem = dot > 0 ? nameStr.slice(0, dot) : nameStr; const ext = dot > 0 ? nameStr.slice(dot) : ""; let k = 2; while (seen.has(`${stem} (${k})${ext}`)) k++; nameStr = `${stem} (${k})${ext}`; }
    seen.add(nameStr);
    const name = enc.encode(nameStr);
    const flags = (sink.seekable ? 0 : 0x08) | 0x800; // data descriptor only when we can't patch; UTF-8 names
    const headerOffset = offset;
    const header = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(0), ...u16(dosTime(now)), ...u16(dosDate(now)), ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...name]);
    await out(header);
    report({ fileIndex: i, fileName: f.name, bytesDone: 0 });
    const fd: FileDiag = { name: f.name, expected: f.size, got: 0, attempts: 0, statuses: [], ms: 0, ok: false };
    run.perFile.push(fd);
    const t0 = performance.now();
    let pulled: { bytes: number; crc: number };
    try { pulled = await pullResumable(f.url, f.size, (c) => out(c), (got) => report({ fileIndex: i, fileName: f.name, bytesDone: got }), signal, fd); }
    catch (err) { fd.ms = performance.now() - t0; fd.error = String((err as Error)?.message ?? err); throw err; }
    fd.ms = performance.now() - t0; fd.ok = true;
    const { bytes, crc } = pulled;
    if (bytes > 0xffffffff) throw new Error(`${f.name} is over 4 GB — too large for a ZIP without ZIP64`);
    if (sink.seekable && sink.patch) {
      await sink.patch(headerOffset + 14, new Uint8Array([...u32(crc), ...u32(bytes), ...u32(bytes)]));
    } else {
      await out(new Uint8Array([...u32(0x08074b50), ...u32(crc), ...u32(bytes), ...u32(bytes)]));
    }
    central.push({ name, crc, size: bytes, offset: headerOffset, flags, time: dosTime(now), date: dosDate(now) });
  }
  const cdStart = offset;
  for (const c of central) {
    await out(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(c.flags), ...u16(0), ...u16(c.time), ...u16(c.date), ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset), ...c.name]));
  }
  const cdSize = offset - cdStart;
  await out(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]));
}

/** Plan archives of at most ARCHIVE_CAP (whole files; a single oversize file
 *  gets its own archive and will fail with a clear message). */
export function planArchives(files: ZipInput[]): ZipInput[][] {
  const groups: ZipInput[][] = [];
  let cur: ZipInput[] = [], bytes = 0;
  for (const f of files) {
    const s = f.size && f.size > 0 ? f.size : 5 * 1024 * 1024;
    if (cur.length && bytes + s > ARCHIVE_CAP) { groups.push(cur); cur = []; bytes = 0; }
    cur.push(f); bytes += s;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Download `files` as one ZIP (or a few, past 3.8 GB). Resolves only when
 * every archive is complete and saved; throws otherwise (nothing partial is
 * left behind — an abandoned archive is deleted / dropped).
 */
export async function downloadZip(opts: { files: ZipInput[]; zipName: string; onProgress?: (p: ZipProgress) => void; signal?: AbortSignal }): Promise<{ archives: number; files: number; bytes: number }> {
  const signal = opts.signal ?? new AbortController().signal;
  const groups = planArchives(opts.files);
  const stem = opts.zipName.replace(/\.zip$/i, "");
  const openSink = await makeSinkOpener(groups.length, `${stem}.zip`);
  const totalBytes = opts.files.reduce((n, f) => n + (f.size ?? 0), 0);
  const run: RunDiag = { startedAt: new Date().toISOString(), zipName: opts.zipName, files: opts.files.length, bytes: totalBytes, sink: "?", archives: groups.length, perFile: [], result: "running" };
  runs.push(run); if (runs.length > 5) runs.shift();
  const started = performance.now();
  diagLog("zip", `start ${opts.zipName}: ${opts.files.length} files, ${Math.round(totalBytes / 1048576)} MB, ${groups.length} archive(s)`);
  let bytesBefore = 0, written = 0;
  try {
  for (let g = 0; g < groups.length; g++) {
    const files = groups[g];
    const name = groups.length > 1 ? `${stem} (part ${g + 1} of ${groups.length}).zip` : `${stem}.zip`;
    const sink = await openSink(name);
    run.sink = sink.seekable ? "save-file picker (streamed to disk)" : "browser download (in-memory blob)";
    try {
      let fileBase = 0, lastIdx = -1;
      await writeArchive(sink, files, (p) => {
        if (p.fileIndex !== lastIdx) { fileBase = files.slice(0, p.fileIndex).reduce((n, f) => n + (f.size ?? 0), 0); lastIdx = p.fileIndex; }
        opts.onProgress?.({ phase: "fetching", fileIndex: opts.files.indexOf(files[p.fileIndex]), fileCount: opts.files.length, fileName: p.fileName, bytesDone: bytesBefore + fileBase + p.bytesDone, bytesTotal: totalBytes, archive: g + 1, archives: groups.length });
      }, signal, run);
      opts.onProgress?.({ phase: "finishing", fileIndex: opts.files.length - 1, fileCount: opts.files.length, fileName: "", bytesDone: bytesBefore + files.reduce((n, f) => n + (f.size ?? 0), 0), bytesTotal: totalBytes, archive: g + 1, archives: groups.length });
      await sink.close();
      written += files.length;
      bytesBefore += files.reduce((n, f) => n + (f.size ?? 0), 0);
    } catch (err) {
      try { await sink.abort(); } catch { /* ignore */ }
      throw err;
    }
  }
  } catch (err) {
    run.ms = performance.now() - started;
    run.result = /abort|cancel/i.test(String((err as Error)?.message)) ? "cancelled by user" : `failed: ${String((err as Error)?.message ?? err)}`;
    diagLog("zip", `${run.result} after ${Math.round(run.ms / 1000)} s`);
    throw err;
  }
  run.ms = performance.now() - started; run.result = "saved";
  diagLog("zip", `saved ${opts.zipName} in ${Math.round(run.ms / 1000)} s`);
  opts.onProgress?.({ phase: "done", fileIndex: opts.files.length - 1, fileCount: opts.files.length, fileName: "", bytesDone: totalBytes, bytesTotal: totalBytes, archive: groups.length, archives: groups.length });
  return { archives: groups.length, files: written, bytes: totalBytes };
}
