import "server-only";
import { PDFDocument } from "pdf-lib";

const SIDE_RANK: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };
/** Soft memory guard so a huge set can't OOM the merge. */
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

/**
 * Merge the selected exhibits (optionally filtered to a set of ids) into ONE
 * PDF, in exhibit order — a "single PDF book". Returns the merged bytes and how
 * many exhibits were included / skipped, or null when nothing usable.
 */
export async function mergeExhibits(
  rows: { id: number; side: string; number: number | null; label: string; title: string; url: string | null }[],
  ids: Set<number> | null,
  fileName: string,
): Promise<Response | null> {
  const selected = rows
    .filter((r) => r.url)
    .filter((r) => (ids ? ids.has(r.id) : true))
    .sort((a, b) => (SIDE_RANK[a.side] ?? 9) - (SIDE_RANK[b.side] ?? 9) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id);
  if (selected.length === 0) return null;

  const out = await PDFDocument.create();
  let added = 0;
  let total = 0;
  for (const r of selected) {
    if (total > MAX_TOTAL_BYTES) break;
    try {
      const res = await fetch(r.url as string);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      total += buf.byteLength;
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      added++;
    } catch {
      /* skip an unreadable/encrypted exhibit rather than fail the whole book */
    }
  }
  if (added === 0) return null;

  const bytes = await out.save();
  const safe = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
