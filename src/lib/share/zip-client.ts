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

export type ZipInput = { id: number; name: string; size: number | null; url: string };
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

async function openSink(name: string): Promise<Sink> {
  const w = window as Window & { showSaveFilePicker?: (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (c: Uint8Array | { type: "write"; position: number; data: Uint8Array }) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> }> };
  if (w.showSaveFilePicker) {
    const handle = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }] });
    const writable = await handle.createWritable();
    return { seekable: true, write: (c) => writable.write(c), patch: (position, data) => writable.write({ type: "write", position, data }), close: () => writable.close(), abort: () => writable.abort() };
  }
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
async function pullResumable(url: string, expected: number | null, onChunk: (c: Uint8Array) => Promise<void>, onProgress: (got: number, total: number | null) => void, signal: AbortSignal): Promise<{ bytes: number; crc: number }> {
  let got = 0, crc = 0, total = expected && expected > 0 ? expected : null, attempts = 0;
  for (;;) {
    if (signal.aborted) throw new Error("cancelled");
    attempts++;
    let res: Response;
    try {
      res = await fetch(url, { headers: got > 0 ? { Range: `bytes=${got}-` } : {}, signal, cache: "no-store" });
    } catch (err) {
      if (signal.aborted) throw new Error("cancelled");
      if (attempts >= MAX_ATTEMPTS) throw new Error(`network error after ${attempts} tries: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * attempts)));
      continue;
    }
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
      void err;
    }
    if (total == null || got >= total) {
      if (total != null && got > total) throw new Error("received more bytes than the file's size");
      return { bytes: got, crc };
    }
    if (attempts >= MAX_ATTEMPTS) throw new Error(`transfer kept breaking (${got} of ${total} bytes after ${attempts} tries)`);
  }
}

/* --------------------------------- zip -------------------------------- */
type Central = { name: Uint8Array; crc: number; size: number; offset: number; flags: number; time: number; date: number };

async function writeArchive(sink: Sink, files: ZipInput[], report: (p: Partial<ZipProgress> & { fileIndex: number; fileName: string; bytesDone: number }) => void, signal: AbortSignal) {
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
    const { bytes, crc } = await pullResumable(f.url, f.size, (c) => out(c), (got) => report({ fileIndex: i, fileName: f.name, bytesDone: got }), signal);
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
  const totalBytes = opts.files.reduce((n, f) => n + (f.size ?? 0), 0);
  let bytesBefore = 0, written = 0;
  for (let g = 0; g < groups.length; g++) {
    const files = groups[g];
    const name = groups.length > 1 ? `${stem} (part ${g + 1} of ${groups.length}).zip` : `${stem}.zip`;
    const sink = await openSink(name);
    try {
      let fileBase = 0, lastIdx = -1;
      await writeArchive(sink, files, (p) => {
        if (p.fileIndex !== lastIdx) { fileBase = files.slice(0, p.fileIndex).reduce((n, f) => n + (f.size ?? 0), 0); lastIdx = p.fileIndex; }
        opts.onProgress?.({ phase: "fetching", fileIndex: opts.files.indexOf(files[p.fileIndex]), fileCount: opts.files.length, fileName: p.fileName, bytesDone: bytesBefore + fileBase + p.bytesDone, bytesTotal: totalBytes, archive: g + 1, archives: groups.length });
      }, signal);
      opts.onProgress?.({ phase: "finishing", fileIndex: opts.files.length - 1, fileCount: opts.files.length, fileName: "", bytesDone: bytesBefore + files.reduce((n, f) => n + (f.size ?? 0), 0), bytesTotal: totalBytes, archive: g + 1, archives: groups.length });
      await sink.close();
      written += files.length;
      bytesBefore += files.reduce((n, f) => n + (f.size ?? 0), 0);
    } catch (err) {
      try { await sink.abort(); } catch { /* ignore */ }
      throw err;
    }
  }
  opts.onProgress?.({ phase: "done", fileIndex: opts.files.length - 1, fileCount: opts.files.length, fileName: "", bytesDone: totalBytes, bytesTotal: totalBytes, archive: groups.length, archives: groups.length });
  return { archives: groups.length, files: written, bytes: totalBytes };
}
