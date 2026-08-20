"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, CheckSquare } from "lucide-react";

export type SharedDoc = {
  id: number; side: string; number: number | null; label: string; title: string; description: string; bates: string; pageCount: number | null;
};

const SIDE_LABEL: Record<string, string> = { plaintiff: "Plaintiff's Exhibits", defendant: "Defendant's Exhibits", joint: "Joint Exhibits" };

/**
 * The exhibit list on a share link: view any exhibit, or select some (or all)
 * and download them as a ZIP. "Check all" then unchecking a few, then "Download
 * checked", works as expected.
 */
export function SharedExhibitList({ docs, viewBase, zipBase }: { docs: SharedDoc[]; viewBase: string; zipBase: string }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const groups = useMemo(
    () => ["plaintiff", "defendant", "joint"].map((s) => ({ side: s, items: docs.filter((d) => d.side === s) })).filter((g) => g.items.length),
    [docs],
  );
  const allChecked = docs.length > 0 && sel.size === docs.length;
  const someChecked = sel.size > 0 && sel.size < docs.length;

  const toggle = (id: number) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(docs.map((d) => d.id)));

  const download = (href: string) => { const a = document.createElement("a"); a.href = href; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); };

  return (
    <div className="mt-8">
      {/* Selection + download toolbar */}
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
        <span className="text-xs text-[var(--c-ink-muted)]">{sel.size} of {docs.length} selected</span>
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
            disabled={docs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            <Download size={14} /> Download all ({docs.length})
          </button>
        </div>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-[var(--c-ink-muted)]">No exhibits have been shared yet.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.side}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">{SIDE_LABEL[g.side] ?? "Exhibits"}</h2>
              <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)]">
                {g.items.map((d) => (
                  <li key={d.id} className={`flex items-start gap-3 px-4 py-3 ${sel.has(d.id) ? "bg-[var(--c-accent)]/5" : "bg-[var(--c-surface)]"}`}>
                    <input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--c-accent)]" aria-label={`Select ${d.label || d.title}`} />
                    <Link href={`${viewBase}/${d.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 py-1 text-xs font-bold text-[var(--c-accent)]">{d.label || (d.number ?? "—")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-[var(--c-ink)]">{d.title || "Exhibit"}</span>
                        {d.description && <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--c-ink-muted)]">{d.description}</span>}
                        {(d.bates || d.pageCount) && <span className="mt-0.5 block text-[11px] text-[var(--c-ink-muted)]">{d.bates}{d.bates && d.pageCount ? " · " : ""}{d.pageCount ? `${d.pageCount} pp` : ""}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
