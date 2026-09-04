"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, CheckSquare, ChevronDown, BookOpen, List as ListIcon, LayoutGrid, Film, FileText, Eye, ZoomIn, ZoomOut } from "lucide-react";

export type SharedDoc = {
  id: number; side: string; number: number | null; label: string; title: string; description: string; bates: string; pageCount: number | null;
  isVideo?: boolean;
};

const SIDE_LABEL: Record<string, string> = { plaintiff: "Plaintiff's Exhibits", defendant: "Defendant's Exhibits", joint: "Joint Exhibits" };

/**
 * The exhibit list on a share link: view any exhibit, or select some (or all)
 * and download them as a ZIP. "Check all" then unchecking a few, then "Download
 * checked", works as expected.
 */
export function SharedExhibitList({ docs, viewBase, fileBase, zipBase, bookBase, namesOnly = false }: { docs: SharedDoc[]; viewBase: string; fileBase: string; zipBase: string; bookBase: string; namesOnly?: boolean }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<"checked" | "all" | null>(null);
  const [grid, setGrid] = useState(false);
  // Grid zoom: 0 = rows of four … 3 = one huge exhibit filling the width.
  const [zoom, setZoom] = useState(0);
  const GRID_COLS = [
    "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
    "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3",
    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2",
    "grid-cols-1",
  ] as const;
  const barRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(
    () => ["plaintiff", "defendant", "joint"].map((s) => ({ side: s, items: docs.filter((d) => d.side === s) })).filter((g) => g.items.length),
    [docs],
  );
  const allChecked = docs.length > 0 && sel.size === docs.length;
  const someChecked = sel.size > 0 && sel.size < docs.length;

  const toggle = (id: number) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(docs.map((d) => d.id)));

  const download = (href: string) => { setMenu(null); const a = document.createElement("a"); a.href = href; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); };
  const idsQ = () => `?ids=${[...sel].join(",")}`;
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(null); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="mt-8">
      {/* Selection + download toolbar */}
      <div ref={barRef} className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5">
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
        <span className="text-xs text-[var(--c-ink-muted)]">{sel.size} of {docs.length} selected</span>
        {/* List / grid toggle */}
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
          <button onClick={() => setGrid(false)} title="List view" className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${!grid ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)]"}`}><ListIcon size={13} /> <span className="hidden sm:inline">List</span></button>
          <button onClick={() => setGrid(true)} title="Grid view — first-page thumbnails" className={`inline-flex items-center gap-1.5 border-l border-[var(--c-border)] px-2.5 py-1.5 text-xs font-medium ${grid ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)]"}`}><LayoutGrid size={13} /> <span className="hidden sm:inline">Grid</span></button>
        </div>
        {/* Grid zoom — make the documents bigger, up to one filling the width. */}
        {grid && !namesOnly && (
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
            <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} title="Smaller — more exhibits per row" className="px-2.5 py-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] disabled:opacity-40"><ZoomOut size={14} /></button>
            <button onClick={() => setZoom((z) => Math.min(3, z + 1))} disabled={zoom === 3} title="Bigger — zoom in on the documents" className="border-l border-[var(--c-border)] px-2.5 py-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] disabled:opacity-40"><ZoomIn size={14} /></button>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Download checked — ZIP, with a caret for the single-PDF-book option */}
          <div className="relative inline-flex">
            <button
              onClick={() => download(`${zipBase}${idsQ()}`)}
              disabled={sel.size === 0}
              className="inline-flex items-center gap-1.5 rounded-l-md border border-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-40"
            >
              <CheckSquare size={14} /> Download checked{sel.size ? ` (${sel.size})` : ""}
            </button>
            <button onClick={() => setMenu(menu === "checked" ? null : "checked")} disabled={sel.size === 0} title="More download options" className="rounded-r-md border border-l-0 border-[var(--c-accent)] px-1.5 py-1.5 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-40"><ChevronDown size={14} /></button>
            {menu === "checked" && (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg">
                <button onClick={() => download(`${bookBase}${idsQ()}`)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--c-accent)]/10"><BookOpen size={14} className="text-[var(--c-accent)]" /> Download all checked to single PDF book</button>
              </div>
            )}
          </div>

          {/* Download all — ZIP, with a caret for the single-PDF-book option */}
          <div className="relative inline-flex">
            <button
              onClick={() => download(zipBase)}
              disabled={docs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-l-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
            >
              <Download size={14} /> Download all ({docs.length})
            </button>
            <button onClick={() => setMenu(menu === "all" ? null : "all")} disabled={docs.length === 0} title="More download options" className="rounded-r-md bg-[var(--c-accent)] px-1.5 py-1.5 text-white hover:brightness-110 disabled:opacity-40"><ChevronDown size={14} /></button>
            {menu === "all" && (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg">
                <button onClick={() => download(bookBase)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--c-accent)]/10"><BookOpen size={14} className="text-[var(--c-accent)]" /> Download all to single PDF book</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-[var(--c-ink-muted)]">No exhibits have been shared yet.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.side}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">{SIDE_LABEL[g.side] ?? "Exhibits"}</h2>
              {grid ? (
                <div className={`grid gap-4 ${namesOnly ? GRID_COLS[0] : GRID_COLS[zoom]}`}>
                  {g.items.map((d) => (
                    <SharedGridCard key={d.id} d={d} viewBase={viewBase} fileBase={fileBase} checked={sel.has(d.id)} onToggle={() => toggle(d.id)} />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)]">
                  {g.items.map((d) => (
                    <li key={d.id} className={`flex items-start gap-3 px-4 py-3 ${sel.has(d.id) ? "bg-[var(--c-accent)]/5" : "bg-[var(--c-surface)]"}`}>
                      <input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--c-accent)]" aria-label={`Select ${d.label || d.title}`} />
                      <Link href={`${viewBase}/${d.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="mt-0.5 inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 py-1 text-xs font-bold text-[var(--c-accent)]">{d.label || (d.number ?? "—")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[var(--c-ink)]">{d.title || "Exhibit"}</span>
                          {/* In opposing-counsel view show nothing but the name — no
                              description, Bates, or page count. */}
                          {!namesOnly && d.description && <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--c-ink-muted)]">{d.description}</span>}
                          {!namesOnly && (d.bates || d.pageCount || d.isVideo) && <span className="mt-0.5 block text-[11px] text-[var(--c-ink-muted)]">{d.bates}{d.bates && (d.pageCount || d.isVideo) ? " · " : ""}{d.isVideo ? "Video" : d.pageCount ? `${d.pageCount} pp` : ""}</span>}
                        </span>
                      </Link>
                      {!namesOnly && (
                        <Link
                          href={`${viewBase}/${d.id}`}
                          className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white"
                        >
                          <Eye size={13} /> <span className="hidden sm:inline">Review exhibit</span><span className="sm:hidden">View</span>
                        </Link>
                      )}
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

/**
 * One grid cell: the exhibit's first page as a thumbnail (lazy-mounted only
 * while near the viewport, so hundreds of PDFs don't render at once). Clicking
 * the card opens the exhibit; the corner checkbox joins the same selection the
 * list view and download buttons use.
 */
function SharedGridCard({ d, viewBase, fileBase, checked, onToggle }: {
  d: SharedDoc; viewBase: string; fileBase: string; checked: boolean; onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((entries) => { for (const e of entries) setNear(e.isIntersecting); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`relative flex flex-col overflow-hidden rounded-lg border bg-[var(--c-surface)] transition-shadow hover:shadow-md ${checked ? "border-[var(--c-accent)] ring-1 ring-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
      <Link href={`${viewBase}/${d.id}`} title={`${d.label || d.number || ""} ${d.title || ""}`.trim() || "Exhibit"} className="flex flex-col">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-white">
          {d.isVideo ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-[#16130f] text-[#e8e2d6]">
              <Film size={30} className="opacity-70" />
              <span className="text-[10px] uppercase tracking-wide opacity-60">Video</span>
            </div>
          ) : near ? (
            <iframe
              src={`${fileBase}/${d.id}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&view=FitH&page=1`}
              title={d.title || d.label || "Exhibit"}
              className="pointer-events-none absolute inset-0 h-full w-full border-0"
              loading="lazy"
              tabIndex={-1}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--c-ink-muted)]"><FileText size={28} className="opacity-40" /></div>
          )}
          {/* Transparent layer so the click always lands on the card, not the PDF. */}
          <span className="absolute inset-0" aria-hidden />
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--c-border)] px-2.5 py-2">
          <span className="inline-flex min-w-[2.75rem] shrink-0 items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-xs font-bold text-[var(--c-accent)]">{d.label || (d.number ?? "—")}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--c-ink)]">{d.title || "Exhibit"}</span>
        </div>
      </Link>
      {/* Selection checkbox — floats over the top-right corner of the thumbnail. */}
      <label
        onClick={(e) => e.stopPropagation()}
        title={checked ? "Uncheck" : "Check to include in the download"}
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--c-border)] bg-white/90 shadow-sm backdrop-blur-sm hover:border-[var(--c-accent)]"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 accent-[var(--c-accent)]"
          aria-label={`Select ${d.label || d.title || "exhibit"}`}
        />
      </label>
    </div>
  );
}
