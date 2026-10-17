/**
 * Browser-side PDF concatenation for big downloads.
 *
 * The server can merge about 100 MB at a time, so a large "one single PDF"
 * download arrives as numbered parts. This joins those parts into one file
 * (or into files of roughly N pages) IN THE BROWSER, streaming the output to
 * disk, so the size is bounded only by the user's disk — the way Acrobat
 * combines files on a desktop. Memory stays at about one part at a time.
 *
 * It relies on the parts being written by pdf-lib WITHOUT object streams
 * (the staged-merge route's ?plain=1): classic "N 0 obj … endobj" objects,
 * direct /Length values, a single flat /Pages node. Each part's objects are
 * copied through with their numbers shifted, its Catalog/Pages/Info dropped,
 * and a new Pages + Catalog + xref written at the end. Anything that doesn't
 * look like that aborts with an error, and the caller falls back to the
 * server's parts.
 */

export type ConcatSink = { write: (chunk: Uint8Array) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> };
export type ConcatPart = { url: string; pages: number; bytes?: number };

const latin1 = new TextDecoder("latin1");
const enc = (s: string) => { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff; return out; };

function indexOfSeq(hay: Uint8Array, needle: string, from: number, to = hay.length): number {
  const n = needle.length;
  outer: for (let i = from; i <= to - n; i++) {
    for (let j = 0; j < n; j++) if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}
function lastIndexOfSeq(hay: Uint8Array, needle: string): number {
  const n = needle.length;
  outer: for (let i = hay.length - n; i >= 0; i--) {
    for (let j = 0; j < n; j++) if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

type ParsedObj = { num: number; dict: string; stream: Uint8Array | null };

/** Read one part: its in-use objects, the order of its pages, and which
 *  object numbers are structural (catalog / pages root / info). */
function parsePart(bytes: Uint8Array): { objects: ParsedObj[]; pageRefs: number[]; skip: Set<number> } {
  const sx = lastIndexOfSeq(bytes, "startxref");
  if (sx < 0) throw new Error("no startxref");
  const xrefOff = parseInt(latin1.decode(bytes.subarray(sx + 9, Math.min(bytes.length, sx + 40))).trim(), 10);
  if (!Number.isFinite(xrefOff) || latin1.decode(bytes.subarray(xrefOff, xrefOff + 4)) !== "xref") throw new Error("part uses a cross-reference stream (not a classic table)");
  // Classic table: "xref\n<start> <count>\n" then 20-byte entries, until "trailer".
  const tr = indexOfSeq(bytes, "trailer", xrefOff);
  if (tr < 0) throw new Error("no trailer");
  const table = latin1.decode(bytes.subarray(xrefOff + 4, tr)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const offsets = new Map<number, number>();
  let cur = 0;
  for (const line of table) {
    const sub = /^(\d+)\s+(\d+)$/.exec(line);
    if (sub) { cur = Number(sub[1]); continue; }
    const ent = /^(\d{10})\s+(\d{5})\s+([nf])/.exec(line);
    if (!ent) continue;
    if (ent[3] === "n") offsets.set(cur, Number(ent[1]));
    cur++;
  }
  const trailerEnd = indexOfSeq(bytes, "startxref", tr);
  const trailerText = latin1.decode(bytes.subarray(tr + 7, trailerEnd));
  const skip = new Set<number>();
  const info = /\/Info\s+(\d+)\s+\d+\s+R/.exec(trailerText);
  if (info) skip.add(Number(info[1]));

  const objects: ParsedObj[] = [];
  let pageRefs: number[] | null = null;
  for (const [num, off] of [...offsets.entries()].sort((a, b) => a[0] - b[0])) {
    const head = latin1.decode(bytes.subarray(off, Math.min(bytes.length, off + 40)));
    const m = /^(\d+)\s+(\d+)\s+obj\b/.exec(head);
    if (!m || Number(m[1]) !== num) throw new Error(`object ${num} not at its offset`);
    const bodyStart = off + m[0].length;
    const iEnd = indexOfSeq(bytes, "endobj", bodyStart);
    if (iEnd < 0) throw new Error(`object ${num} has no endobj`);
    let iStream = indexOfSeq(bytes, "stream", bodyStart, iEnd);
    // "stream" must be the keyword (preceded by whitespace/">>", followed by EOL), not text inside the dict.
    while (iStream >= 0 && !(bytes[iStream + 6] === 0x0a || bytes[iStream + 6] === 0x0d)) iStream = indexOfSeq(bytes, "stream", iStream + 6, iEnd);
    if (iStream >= 0) {
      const dict = latin1.decode(bytes.subarray(bodyStart, iStream)).trim();
      const lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      let length: number;
      if (lenM) length = Number(lenM[1]);
      else {
        const ind = /\/Length\s+(\d+)\s+\d+\s+R/.exec(dict);
        if (!ind) throw new Error(`object ${num}: stream without a usable /Length`);
        const lo = offsets.get(Number(ind[1]));
        if (lo == null) throw new Error(`object ${num}: /Length object missing`);
        const lt = latin1.decode(bytes.subarray(lo, lo + 60));
        const lm = /obj\s*(\d+)/.exec(lt);
        if (!lm) throw new Error(`object ${num}: bad /Length object`);
        length = Number(lm[1]);
      }
      let dataStart = iStream + 6;
      if (bytes[dataStart] === 0x0d) dataStart++;
      if (bytes[dataStart] === 0x0a) dataStart++;
      const stream = bytes.subarray(dataStart, dataStart + length);
      objects.push({ num, dict, stream });
    } else {
      const dict = latin1.decode(bytes.subarray(bodyStart, iEnd)).trim();
      if (/\/Type\s*\/Catalog\b/.test(dict)) { skip.add(num); continue; }
      if (/\/Type\s*\/Pages\b/.test(dict)) {
        if (/\/Parent\s+\d+\s+\d+\s+R/.test(dict)) throw new Error("nested page tree");
        const kids = /\/Kids\s*\[([^\]]*)\]/.exec(dict);
        if (!kids) throw new Error("pages root without /Kids");
        pageRefs = [...kids[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((k) => Number(k[1]));
        skip.add(num);
        continue;
      }
      objects.push({ num, dict, stream: null });
    }
  }
  if (!pageRefs) throw new Error("no pages root");
  return { objects, pageRefs, skip };
}

class OutFile {
  offset = 0;
  xref = new Map<number, number>(); // object number → byte offset
  nextBase = 3; // 1 = Catalog, 2 = Pages
  pageRefs: number[] = [];
  constructor(private sink: ConcatSink) {}
  async write(chunk: Uint8Array) { await this.sink.write(chunk); this.offset += chunk.byteLength; }
  async begin() { await this.write(enc("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")); }
  async addPart(part: { objects: ParsedObj[]; pageRefs: number[]; skip: Set<number> }) {
    const base = this.nextBase;
    const maxNum = part.objects.reduce((m, o) => Math.max(m, o.num), 0);
    const remap = (text: string) => text.replace(/(\d+)\s+(\d+)\s+R\b/g, (_, n, g) => `${Number(n) + base} ${g} R`);
    for (const o of part.objects) {
      const num = o.num + base;
      let dict = remap(o.dict);
      if (/\/Type\s*\/Page\b/.test(dict)) dict = dict.replace(/\/Parent\s+\d+\s+\d+\s+R/, "/Parent 2 0 R");
      this.xref.set(num, this.offset);
      await this.write(enc(`${num} 0 obj\n${dict}\n`));
      if (o.stream) { await this.write(enc("stream\n")); await this.write(o.stream); await this.write(enc("\nendstream\n")); }
      await this.write(enc("endobj\n"));
    }
    for (const r of part.pageRefs) this.pageRefs.push(r + base);
    this.nextBase = base + maxNum + 1;
  }
  async finish() {
    this.xref.set(2, this.offset);
    await this.write(enc(`2 0 obj\n<< /Type /Pages /Kids [ ${this.pageRefs.map((r) => `${r} 0 R`).join(" ")} ] /Count ${this.pageRefs.length} >>\nendobj\n`));
    this.xref.set(1, this.offset);
    await this.write(enc("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
    const size = this.nextBase;
    const startxref = this.offset;
    const lines: string[] = [`xref`, `0 ${size}`, `0000000000 65535 f `];
    for (let n = 1; n < size; n++) {
      const off = this.xref.get(n);
      lines.push(off == null ? `0000000000 65535 f ` : `${String(off).padStart(10, "0")} 00000 n `);
    }
    await this.write(enc(lines.join("\n") + `\ntrailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`));
    await this.sink.close();
  }
}

export async function concatPdfParts(opts: {
  parts: ConcatPart[];
  /** Pages per output file; Infinity (default) for one file. Files split only at part boundaries. */
  maxPages?: number;
  openSink: (fileIndex: number, fileCount: number, pages: number) => Promise<ConcatSink>;
  onProgress?: (message: string, fraction: number) => void;
}): Promise<{ files: number; pages: number }> {
  const maxPages = opts.maxPages && opts.maxPages > 0 ? opts.maxPages : Number.POSITIVE_INFINITY;
  // Group whole parts into files of at most maxPages (a single part can exceed it).
  const groups: ConcatPart[][] = [];
  let cur: ConcatPart[] = [], curPages = 0;
  for (const p of opts.parts) {
    if (cur.length && curPages + p.pages > maxPages) { groups.push(cur); cur = []; curPages = 0; }
    cur.push(p); curPages += p.pages;
  }
  if (cur.length) groups.push(cur);
  const totalParts = opts.parts.length;
  let done = 0, pagesOut = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const groupPages = group.reduce((n, p) => n + p.pages, 0);
    const sink = await opts.openSink(gi, groups.length, groupPages);
    const out = new OutFile(sink);
    try {
      await out.begin();
      for (const part of group) {
        opts.onProgress?.(`Fetching part ${done + 1} of ${totalParts}…`, done / totalParts);
        const res = await fetch(part.url);
        if (!res.ok) throw new Error(`part ${done + 1}: server said ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        opts.onProgress?.(`Joining part ${done + 1} of ${totalParts}…`, (done + 0.5) / totalParts);
        await out.addPart(parsePart(bytes));
        done++;
      }
      opts.onProgress?.(groups.length > 1 ? `Finishing file ${gi + 1} of ${groups.length}…` : "Finishing the PDF…", done / totalParts);
      await out.finish();
      pagesOut += out.pageRefs.length;
    } catch (err) {
      try { await sink.abort?.(); } catch { /* ignore */ }
      throw err;
    }
  }
  return { files: groups.length, pages: pagesOut };
}

/** A sink that streams to a file the user picks (Chrome/Edge), or falls back
 *  to an in-browser Blob download (held in the browser's disk-backed blob
 *  store one part at a time) elsewhere. */
export async function pickSink(suggestedName: string): Promise<ConcatSink> {
  const w = window as Window & { showSaveFilePicker?: (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (c: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> }> };
  if (w.showSaveFilePicker) {
    const handle = await w.showSaveFilePicker({ suggestedName, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
    const writable = await handle.createWritable();
    return { write: (c) => writable.write(c), close: () => writable.close(), abort: () => writable.abort() };
  }
  const partBlobs: Blob[] = [];
  let chunks: Uint8Array[] = [];
  let size = 0;
  const flush = () => { if (chunks.length) { partBlobs.push(new Blob(chunks as BlobPart[])); chunks = []; size = 0; } };
  return {
    write: async (c) => { chunks.push(c.slice()); size += c.byteLength; if (size > 64 * 1024 * 1024) flush(); },
    close: async () => {
      flush();
      const blob = new Blob(partBlobs, { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = suggestedName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    abort: async () => { chunks = []; partBlobs.length = 0; },
  };
}
