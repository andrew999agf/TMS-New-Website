"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder as FolderIcon, FolderOpen, FileText, Download, Trash2, Loader2, Eye, Pencil, FolderPlus, Link2, Check, ListOrdered } from "lucide-react";
import { compareNatural } from "@/lib/share/sort";

export type TreeFile = { id: number; path: string; sizeBytes: number | null; by?: string; at?: string };
export type DirInfo = Record<string, { by?: string; at?: string }>;
type Leaf = TreeFile & { base: string };
type FolderNode = { name: string; children: Map<string, FolderNode>; files: Leaf[] };

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtWhen = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/** Italic "created by / uploaded by X · date" — quiet, skipped when unknown. */
function Attribution({ by, at, verb }: { by?: string; at?: string; verb: string }) {
  if (!by && !at) return null;
  return (
    <span className="text-[10px] italic text-[var(--c-ink-muted)]">
      {by ? `${verb} ${by}` : ""}{by && at ? " · " : ""}{fmtWhen(at)}
    </span>
  );
}

function ensureDir(root: FolderNode, parts: string[]): FolderNode {
  let node = root;
  for (const p of parts) {
    let child = node.children.get(p);
    if (!child) { child = { name: p, children: new Map(), files: [] }; node.children.set(p, child); }
    node = child;
  }
  return node;
}

function buildTree(files: TreeFile[], dirs: string[]): FolderNode {
  const root: FolderNode = { name: "", children: new Map(), files: [] };
  for (const d of dirs) { const parts = d.split("/").filter(Boolean); if (parts.length) ensureDir(root, parts); }
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    const base = parts.pop() ?? f.path;
    ensureDir(root, parts).files.push({ ...f, base });
  }
  return root;
}

function countFiles(node: FolderNode): number {
  let n = node.files.length;
  for (const c of node.children.values()) n += countFiles(c);
  return n;
}

function collectFileIds(node: FolderNode): number[] {
  const ids = node.files.map((f) => f.id);
  for (const c of node.children.values()) ids.push(...collectFileIds(c));
  return ids;
}

type Ctx = {
  hrefFor: (id: number) => string;
  target?: "_blank";
  showDownload: boolean;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  onDeleteDir?: (path: string) => void;
  deletingDir?: string | null;
  onRenameDir?: (path: string, currentName: string) => void;
  onRenameFile?: (id: number, currentName: string) => void;
  onAddSubdir?: (parentPath: string) => void;
  /** When provided, each folder gets a "download this folder as a ZIP" link. */
  dirZipHref?: (path: string) => string;
  /** When provided, each folder gets a "Word table of contents" link. */
  dirTocHref?: (path: string) => string;
  /** When provided, each file gets a "Copy link" button. Called on click only,
   *  so it can safely read window.location. */
  copyLinkFor?: (id: number) => string;
  onPreview?: (file: { id: number; base: string }) => void;
  dirInfo?: DirInfo;
  // multi-select (optional)
  selectable?: boolean;
  selected?: Set<number>;
  onToggleSelect?: (ids: number[], checked: boolean) => void;
  // drag-drop upload (optional)
  onUpload?: (destPath: string, dt: DataTransfer) => void;
  overPath: string | null;
  setOver: (e: React.DragEvent, path: string) => void;
  doDrop: (e: React.DragEvent, path: string) => void;
  // expand/collapse (hoisted so it survives refreshes and can be driven open)
  openSet: Set<string>;
  toggleOpen: (path: string) => void;
};

export function ShareFileTree({ files, dirs = [], hrefFor, target, showDownload = true, onDelete, deletingId, onDeleteDir, deletingDir, onRenameDir, onRenameFile, onAddSubdir, dirZipHref, dirTocHref, copyLinkFor, onPreview, onUpload, dirInfo, selectable, selected, onToggleSelect, revealPath }: {
  files: TreeFile[];
  dirs?: string[];
  hrefFor: (fileId: number) => string;
  target?: "_blank";
  showDownload?: boolean;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  onDeleteDir?: (path: string) => void;
  deletingDir?: string | null;
  /** When provided, folders show a rename button. */
  onRenameDir?: (path: string, currentName: string) => void;
  /** When provided, each document shows a rename button. */
  onRenameFile?: (id: number, currentName: string) => void;
  /** When provided, folders show an "Add sub-folder" button. */
  onAddSubdir?: (parentPath: string) => void;
  /** When provided, folders show a download button linking to a ZIP of just
   *  that folder (and everything under it). */
  dirZipHref?: (path: string) => string;
  /** When provided, folders show a button that downloads a Word table of
   *  contents for that folder (and everything under it). */
  dirTocHref?: (path: string) => string;
  /** When provided, each file shows a "Copy link" button that puts that file's
   *  own shareable link on the clipboard. */
  copyLinkFor?: (id: number) => string;
  onPreview?: (file: { id: number; base: string }) => void;
  /** Per-folder "created by / when" attribution, keyed by full path. */
  dirInfo?: DirInfo;
  /** When true, each file (and folder) shows a selection checkbox. */
  selectable?: boolean;
  selected?: Set<number>;
  onToggleSelect?: (ids: number[], checked: boolean) => void;
  /** When provided, the tree becomes a drop target: drop onto a folder to add
   *  inside it, or onto empty space to add at the top level. */
  onUpload?: (destPath: string, dt: DataTransfer) => void;
  /** When set, expand this folder and all its ancestors and scroll it into view
   *  — used to reveal a just-created folder in a large, collapsed tree. */
  revealPath?: string | null;
}) {
  const root = useMemo(() => buildTree(files, dirs), [files, dirs]);
  const [overPath, setOverPath] = useState<string | null>(null);
  // Expand state lives here (not per-row) so it survives a router.refresh() and
  // so a newly created folder can be driven open.
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  const toggleOpen = (path: string) => setOpenSet((prev) => { const n = new Set(prev); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  const empty = root.children.size === 0 && root.files.length === 0;

  useEffect(() => {
    if (!revealPath) return;
    const parts = revealPath.split("/").filter(Boolean);
    setOpenSet((prev) => {
      const n = new Set(prev);
      let acc = "";
      for (const p of parts) { acc = acc ? `${acc}/${p}` : p; n.add(acc); }
      return n;
    });
    // Scroll the folder into view once the expansion has rendered.
    const id = window.setTimeout(() => {
      document.querySelector(`[data-dirpath="${CSS.escape(revealPath)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [revealPath]);

  const setOver = (e: React.DragEvent, path: string) => { if (!onUpload) return; e.preventDefault(); e.stopPropagation(); setOverPath(path); };
  const doDrop = (e: React.DragEvent, path: string) => { if (!onUpload) return; e.preventDefault(); e.stopPropagation(); setOverPath(null); onUpload(path, e.dataTransfer); };
  const ctx: Ctx = { hrefFor, target, showDownload, onDelete, deletingId, onDeleteDir, deletingDir, onRenameDir, onRenameFile, onAddSubdir, dirZipHref, dirTocHref, copyLinkFor, onPreview, dirInfo, selectable, selected, onToggleSelect, onUpload, overPath, setOver, doDrop, openSet, toggleOpen };

  const rootHot = onUpload && overPath === "";
  return (
    <div
      onDragOver={(e) => setOver(e, "")}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOverPath(null); }}
      onDrop={(e) => doDrop(e, "")}
      className={`min-h-[3rem] rounded-lg border p-1.5 text-[var(--c-ink)] transition-colors ${rootHot ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] bg-[var(--c-surface)]"}`}
    >
      {empty ? (
        <p className="px-2 py-6 text-center text-sm text-[var(--c-ink-muted)]">
          {onUpload ? "Drag files or folders here to add them." : "No documents yet."}
        </p>
      ) : (
        <NodeBody node={root} depth={0} basePath="" ctx={ctx} />
      )}
    </div>
  );
}

function NodeBody({ node, depth, basePath, ctx }: { node: FolderNode; depth: number; basePath: string; ctx: Ctx }) {
  // Folders first, then files — each in natural alphanumeric order, so
  // "Exhibit 2" comes before "Exhibit 10" at every level of the tree.
  const folders = [...node.children.values()].sort((a, b) => compareNatural(a.name, b.name));
  const files = [...node.files].sort((a, b) => compareNatural(a.base, b.base));
  return (
    <>
      {folders.map((f) => <FolderRow key={f.name} node={f} depth={depth} basePath={basePath} ctx={ctx} />)}
      {files.map((f) => <FileLeaf key={f.id} file={f} depth={depth} ctx={ctx} />)}
    </>
  );
}

function FolderRow({ node, depth, basePath, ctx }: { node: FolderNode; depth: number; basePath: string; ctx: Ctx }) {
  const fullPath = basePath ? `${basePath}/${node.name}` : node.name;
  const open = ctx.openSet.has(fullPath);
  const setOpen = () => ctx.toggleOpen(fullPath);
  const n = countFiles(node);
  const info = ctx.dirInfo?.[fullPath];
  const hot = ctx.onUpload && ctx.overPath === fullPath;
  return (
    <div
      data-dirpath={fullPath}
      onDragOver={(e) => ctx.setOver(e, fullPath)}
      onDrop={(e) => ctx.doDrop(e, fullPath)}
      className={`rounded ${hot ? "bg-[var(--c-accent)]/10 outline outline-1 outline-[var(--c-accent)]" : ""}`}
    >
      <div className="flex items-center gap-1 rounded pr-1 hover:bg-[var(--c-surface2)]">
        {ctx.selectable && ctx.onToggleSelect && (() => {
          const ids = collectFileIds(node);
          const sel = ids.filter((id) => ctx.selected?.has(id)).length;
          const all = ids.length > 0 && sel === ids.length;
          // Fixed-width slot so empty folders (no checkbox) still line up with
          // folders that have one.
          return (
            <span className="flex w-4 shrink-0 items-center justify-center" style={{ marginLeft: 8 + depth * 16 }}>
              {ids.length > 0 && (
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => { if (el) el.indeterminate = sel > 0 && !all; }}
                  onChange={(e) => ctx.onToggleSelect!(ids, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  title="Select everything in this folder"
                />
              )}
            </span>
          );
        })()}
        <button onClick={setOpen} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-sm" style={{ paddingLeft: ctx.selectable ? 2 : 8 + depth * 16 }}>
          <ChevronRight size={14} className={`shrink-0 text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-90" : ""}`} />
          {open ? <FolderOpen size={15} className="shrink-0 text-[var(--c-accent)]" /> : <FolderIcon size={15} className="shrink-0 text-[var(--c-accent)]" />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{node.name}</span>
            {info && <Attribution by={info.by} at={info.at} verb="created by" />}
          </span>
          <span className="shrink-0 self-center text-[11px] text-[var(--c-ink-muted)]">{n} file{n === 1 ? "" : "s"}</span>
        </button>
        {ctx.dirZipHref && n > 0 && (
          <a
            href={ctx.dirZipHref(fullPath)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
            title={`Download this folder as a ZIP (${n} file${n === 1 ? "" : "s"})`}
          >
            <Download size={13} />
          </a>
        )}
        {ctx.dirTocHref && (
          <a
            href={ctx.dirTocHref(fullPath)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
            title="Word table of contents for this folder (Texas-pleading style)"
          >
            <ListOrdered size={13} />
          </a>
        )}
        {ctx.onAddSubdir && (
          <button onClick={() => ctx.onAddSubdir!(fullPath)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Add a sub-folder inside this folder">
            <FolderPlus size={13} />
          </button>
        )}
        {ctx.onRenameDir && (
          <button onClick={() => ctx.onRenameDir!(fullPath, node.name)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename this folder">
            <Pencil size={13} />
          </button>
        )}
        {ctx.onDeleteDir && (
          <button onClick={() => ctx.onDeleteDir!(fullPath)} disabled={ctx.deletingDir === fullPath} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600 disabled:opacity-50" title="Delete this folder and everything in it">
            {ctx.deletingDir === fullPath ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}
      </div>
      {open && <NodeBody node={node} depth={depth + 1} basePath={fullPath} ctx={ctx} />}
    </div>
  );
}

/** Puts this one file's shareable link on the clipboard, with a brief confirmation. */
function CopyLinkButton({ getLink }: { getLink: () => string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const link = getLink();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API needs a secure context and permission; fall back to a
      // hidden textarea so the button still works.
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      title="Copy this document's link"
      className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        copied
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
      }`}
    >
      {copied ? <Check size={13} /> : <Link2 size={13} />}
      <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
    </button>
  );
}

function FileLeaf({ file, depth, ctx }: { file: Leaf; depth: number; ctx: Ctx }) {
  const href = ctx.hrefFor(file.id);
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--c-surface2)]" style={{ paddingLeft: 8 + depth * 16 + (ctx.selectable ? 2 : 18) }}>
      {ctx.selectable && ctx.onToggleSelect && (
        <input type="checkbox" checked={ctx.selected?.has(file.id) ?? false} onChange={(e) => ctx.onToggleSelect!([file.id], e.target.checked)} className="shrink-0" />
      )}
      <FileText size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
      <span className="flex min-w-0 flex-1 flex-col">
        <a href={href} target={ctx.target} rel={ctx.target ? "noopener noreferrer" : undefined} className="truncate text-sm hover:text-[var(--c-accent)]">{file.base}</a>
        {(file.by || file.at) && <Attribution by={file.by} at={file.at} verb="uploaded by" />}
      </span>
      <span className="shrink-0 self-center text-[11px] text-[var(--c-ink-muted)]">{fmtSize(file.sizeBytes)}</span>
      {ctx.onPreview && (
        <button onClick={() => ctx.onPreview!({ id: file.id, base: file.base })} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] font-medium text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] hover:border-[var(--c-accent)]" title="Preview this document">
          <Eye size={13} /><span className="hidden sm:inline">Preview</span>
        </button>
      )}
      {ctx.showDownload && (
        <a href={href} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] font-medium text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10" title="Download this document">
          <Download size={13} /><span className="hidden sm:inline">Download</span>
        </a>
      )}
      {ctx.copyLinkFor && <CopyLinkButton getLink={() => ctx.copyLinkFor!(file.id)} />}
      {ctx.onRenameFile && (
        <button onClick={() => ctx.onRenameFile!(file.id, file.base)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename this document">
          <Pencil size={13} />
        </button>
      )}
      {ctx.onDelete && (
        <button onClick={() => ctx.onDelete!(file.id)} disabled={ctx.deletingId === file.id} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600 disabled:opacity-50" title="Remove">
          {ctx.deletingId === file.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );
}
