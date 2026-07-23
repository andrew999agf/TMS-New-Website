"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Folder as FolderIcon, FolderOpen, FileText, Download, Trash2, Loader2 } from "lucide-react";

export type TreeFile = { id: number; path: string; sizeBytes: number | null };
type Leaf = TreeFile & { base: string };
type FolderNode = { name: string; children: Map<string, FolderNode>; files: Leaf[] };

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

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

type Ctx = {
  hrefFor: (id: number) => string;
  target?: "_blank";
  showDownload: boolean;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  // drag-drop upload (optional)
  onUpload?: (destPath: string, dt: DataTransfer) => void;
  overPath: string | null;
  setOver: (e: React.DragEvent, path: string) => void;
  doDrop: (e: React.DragEvent, path: string) => void;
};

export function ShareFileTree({ files, dirs = [], hrefFor, target, showDownload = true, onDelete, deletingId, onUpload }: {
  files: TreeFile[];
  dirs?: string[];
  hrefFor: (fileId: number) => string;
  target?: "_blank";
  showDownload?: boolean;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
  /** When provided, the tree becomes a drop target: drop onto a folder to add
   *  inside it, or onto empty space to add at the top level. */
  onUpload?: (destPath: string, dt: DataTransfer) => void;
}) {
  const root = useMemo(() => buildTree(files, dirs), [files, dirs]);
  const [overPath, setOverPath] = useState<string | null>(null);
  const empty = root.children.size === 0 && root.files.length === 0;

  const setOver = (e: React.DragEvent, path: string) => { if (!onUpload) return; e.preventDefault(); e.stopPropagation(); setOverPath(path); };
  const doDrop = (e: React.DragEvent, path: string) => { if (!onUpload) return; e.preventDefault(); e.stopPropagation(); setOverPath(null); onUpload(path, e.dataTransfer); };
  const ctx: Ctx = { hrefFor, target, showDownload, onDelete, deletingId, onUpload, overPath, setOver, doDrop };

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
  const folders = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.base.localeCompare(b.base));
  return (
    <>
      {folders.map((f) => <FolderRow key={f.name} node={f} depth={depth} basePath={basePath} ctx={ctx} />)}
      {files.map((f) => <FileLeaf key={f.id} file={f} depth={depth} ctx={ctx} />)}
    </>
  );
}

function FolderRow({ node, depth, basePath, ctx }: { node: FolderNode; depth: number; basePath: string; ctx: Ctx }) {
  const [open, setOpen] = useState(depth < 1);
  const fullPath = basePath ? `${basePath}/${node.name}` : node.name;
  const n = countFiles(node);
  const hot = ctx.onUpload && ctx.overPath === fullPath;
  return (
    <div
      onDragOver={(e) => ctx.setOver(e, fullPath)}
      onDrop={(e) => ctx.doDrop(e, fullPath)}
      className={`rounded ${hot ? "bg-[var(--c-accent)]/10 outline outline-1 outline-[var(--c-accent)]" : ""}`}
    >
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--c-surface2)]" style={{ paddingLeft: 8 + depth * 16 }}>
        <ChevronRight size={14} className={`shrink-0 text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? <FolderOpen size={15} className="shrink-0 text-[var(--c-accent)]" /> : <FolderIcon size={15} className="shrink-0 text-[var(--c-accent)]" />}
        <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{n} file{n === 1 ? "" : "s"}</span>
      </button>
      {open && <NodeBody node={node} depth={depth + 1} basePath={fullPath} ctx={ctx} />}
    </div>
  );
}

function FileLeaf({ file, depth, ctx }: { file: Leaf; depth: number; ctx: Ctx }) {
  const href = ctx.hrefFor(file.id);
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--c-surface2)]" style={{ paddingLeft: 8 + depth * 16 + 18 }}>
      <FileText size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
      <a href={href} target={ctx.target} rel={ctx.target ? "noopener noreferrer" : undefined} className="min-w-0 flex-1 truncate text-sm hover:text-[var(--c-accent)]">{file.base}</a>
      <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{fmtSize(file.sizeBytes)}</span>
      {ctx.showDownload && <a href={href} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Download"><Download size={14} /></a>}
      {ctx.onDelete && (
        <button onClick={() => ctx.onDelete!(file.id)} disabled={ctx.deletingId === file.id} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600 disabled:opacity-50" title="Remove">
          {ctx.deletingId === file.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );
}
