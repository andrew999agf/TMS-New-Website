import "server-only";
import { zipResponse } from "@/lib/share/zip";

const SIDE_RANK: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Build a ZIP of the given exhibit rows (optionally filtered to a set of ids),
 * named in exhibit order with a zero-padded sequence. Returns null when nothing
 * matches. Shared by the public and recipient share links.
 */
export function zipExhibits(
  rows: { id: number; side: string; number: number | null; label: string; title: string; url: string | null }[],
  ids: Set<number> | null,
  zipName: string,
): Response | null {
  const selected = rows
    .filter((r) => r.url)
    .filter((r) => (ids ? ids.has(r.id) : true))
    .sort((a, b) => (SIDE_RANK[a.side] ?? 9) - (SIDE_RANK[b.side] ?? 9) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id);
  if (selected.length === 0) return null;
  const files = selected.map((r, i) => {
    const seq = String(i + 1).padStart(3, "0");
    const base = cleanName([r.label, r.title].filter(Boolean).join(" ") || `Exhibit ${r.number ?? r.id}`);
    // Keep the file's real extension (videos aren't PDFs).
    const ext = ((r.url as string).split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "pdf").toLowerCase();
    return { url: r.url as string, name: `${seq} - ${base}.${ext}` };
  });
  return zipResponse(files, zipName);
}
