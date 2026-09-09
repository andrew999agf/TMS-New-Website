"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, CheckSquare, List as ListIcon, LayoutGrid, FileText, Eye, Film, ImageIcon, ZoomIn, ZoomOut } from "lucide-react";

export type DirFile = {
  id: number;
  /** Path relative to the shared directory, e.g. "2026/Contract.pdf". */
  rel: string;
  sizeBytes: number | null;
  createdAt: string;
  kind: "pdf" | "image" | "video" | "other";
};

const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const baseName = (rel: string) => rel.split("/").pop() ?? rel;
const subDir = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/**
 * The public viewer behind a directory share link: the files of ONE folder
 * (and its sub-folders), grouped by sub-folder, with list/grid views, a grid
 * zoom, per-file viewing, and check-and-download or download-all ZIPs.
 */
export function SharedDirView({ files, fileBase, zipBase }: { files: DirFile[]; fileBase: string; zipBase: string }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [grid, setGrid] = useState(false);
  // Grid zoom sets a minimum card width; auto-fill measures the real screen
  // (desktop, tablet, phone) and packs as many columns as fit, so the full
  // width is always used. min(…, 100%) keeps narrow phones at one column.
  const [zoom, setZoom] = useState(0);
  const GRID_MIN = [170, 250, 370, 620] as const;
  const gridCols = { gridTemplateColumns: `repeat(auto-fill, minmax(min(${GRID_MIN[zoom]}px, 100%), 1fr))` };

  const groups = useMemo(() => {
    const m = new Map<string, DirFile[]>();
    for (const f of files) {
      const g = subDir(f.rel);
      m.set(g, [...(m.get(g) ?? []), f]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [files]);

  const allChecked = files.length > 0 && sel.size === files.length;
  const someChecked = sel.size > 0 && sel.size < files.length;
  const toggle = (id: number) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(files.map((f) => f.id)));
  const download = (href: string) => { const a = document.createElement("a"); a.href = href; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); };

  return (
    <div className="mt-8">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--c-ink)]">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onChange={toggleAll}
            className="h-4 w-4 accent-[var(--c-accent)]"
          />
          {allChecked ? "Uncheck all" : "Check all"}
        </label>
        <span className="text-xs text-[var(--c-ink-muted)]">{sel.size} of {files.length} selected</span>
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
          <button onClick={() => setGrid(false)} title="List view" className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${!grid ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)]"}`}><ListIcon size={13} /> <span className="hidden sm:inline">List</span></button>
          <button onClick={() => setGrid(true)} title="Grid view — thumbnails" className={`inline-flex items-center gap-1.5 border-l border-[var(--c-border)] px-2.5 py-1.5 text-xs font-medium ${grid ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)]"}`}><LayoutGrid size={13} /> <span className="hidden sm:inline">Grid</span></button>
        </div>
        {grid && (
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
            <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} title="Smaller" className="px-2.5 py-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] disabled:opacity-40"><ZoomOut size={14} /></button>
            <button onClick={() => setZoom((z) => Math.min(3, z + 1))} disabled={zoom === 3} title="Bigger" className="border-l border-[var(--c-border)] px-2.5 py-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] disabled:opacity-40"><ZoomIn size={14} /></button>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => download(`${zipBase}?ids=${[...sel].join(",")}`)}
            disabled={sel.size === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-40"
          >
            <CheckSquare size={14} /> Download checked{sel.size ? ` (${sel.size})` : ""}
          </button>
          <button
            onClick={() => download(zipBase)}
            disabled={files.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            <Download size={14} /> Download all ({files.length})
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-[var(--c-ink-muted)]">This folder is empty.</p>
      ) : (
        <div className="space-y-8">
          {groups.map(([g, items]) => (
            <section key={g || "(top)"}>
              {(groups.length > 1 || g) && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">{g || "Top level"}</h2>
              )}
              {grid ? (
                <div className="grid gap-3" style={gridCols}>
                  {items.map((f) => <DirGridCard key={f.id} f={f} fileBase={fileBase} checked={sel.has(f.id)} onToggle={() => toggle(f.id)} />)}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)]">
                  {items.map((f) => (
                    <li key={f.id} className={`flex items-center gap-3 px-4 py-3 ${sel.has(f.id) ? "bg-[var(--c-accent)]/5" : "bg-[var(--c-surface)]"}`}>
                      <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} className="h-4 w-4 shrink-0 accent-[var(--c-accent)]" aria-label={`Select ${baseName(f.rel)}`} />
                      <FileText size={15} className="shrink-0 text-[var(--c-accent)]" />
                      <a href={`${fileBase}/${f.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--c-ink)] hover:text-[var(--c-accent)]">{baseName(f.rel)}</a>
                      <span className="hidden shrink-0 text-[11px] text-[var(--c-ink-muted)] sm:block">{fmtSize(f.sizeBytes)}</span>
                      <span className="hidden shrink-0 text-[11px] text-[var(--c-ink-muted)] sm:block">{fmtWhen(f.createdAt)}</span>
                      <a href={`${fileBase}/${f.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white">
                        <Eye size={13} /> <span className="hidden sm:inline">View</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** One grid cell: a real thumbnail for PDFs and images (lazy-mounted), an icon
 *  otherwise. Clicking opens the file; the corner box joins the selection. */
function DirGridCard({ f, fileBase, checked, onToggle }: { f: DirFile; fileBase: string; checked: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((entries) => { for (const e of entries) setNear(e.isIntersecting); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const href = `${fileBase}/${f.id}`;
  return (
    <div ref={ref} className={`relative flex flex-col overflow-hidden rounded-lg border bg-[var(--c-surface)] transition-shadow hover:shadow-md ${checked ? "border-[var(--c-accent)] ring-1 ring-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex flex-col" title={f.rel}>
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-white">
          {!near ? (
            <div className="flex h-full items-center justify-center text-[var(--c-ink-muted)]"><FileText size={28} className="opacity-40" /></div>
          ) : f.kind === "pdf" ? (
            <iframe src={`${href}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&view=FitH&page=1`} title={baseName(f.rel)} className="pointer-events-none absolute inset-0 h-full w-full border-0" loading="lazy" tabIndex={-1} />
          ) : f.kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={href} alt={baseName(f.rel)} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : f.kind === "video" ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-[#16130f] text-[#e8e2d6]">
              <Film size={30} className="opacity-70" />
              <span className="text-[10px] uppercase tracking-wide opacity-60">Video</span>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[var(--c-ink-muted)]">
              <ImageIcon size={28} className="opacity-40" />
              <span className="text-[10px] uppercase tracking-wide opacity-60">{baseName(f.rel).split(".").pop()?.toUpperCase()}</span>
            </div>
          )}
          <span className="absolute inset-0" aria-hidden />
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--c-border)] px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--c-ink)]">{baseName(f.rel)}</span>
          <span className="shrink-0 text-[10px] text-[var(--c-ink-muted)]">{fmtSize(f.sizeBytes)}</span>
        </div>
      </a>
      <label onClick={(e) => e.stopPropagation()} title={checked ? "Uncheck" : "Check to include in the download"} className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--c-border)] bg-white/90 shadow-sm backdrop-blur-sm hover:border-[var(--c-accent)]">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-[var(--c-accent)]" aria-label={`Select ${baseName(f.rel)}`} />
      </label>
    </div>
  );
}
