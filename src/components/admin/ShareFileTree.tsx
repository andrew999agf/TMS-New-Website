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
  for (const d of dirs) {
    const parts = d.split("/").filter(Boolean);
    if (parts.length) ensureDir(root, parts);
  }
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

export function ShareFileTree({ files, dirs = [], hrefFor, target, showDownload = true, onDelete, deletingId }: {
  files: TreeFile[];
  dirs?: string[];
  hrefFor: (fileId: number) => string;
  target?: "_blank";
  showDownload?: boolean;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
}) {
  const root = useMemo(() => buildTree(files, dirs), [files, dirs]);
  const empty = root.children.size === 0 && root.files.length === 0;
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 text-[var(--c-ink)]">
      {empty ? (
        <p className="px-2 py-3 text-center text-sm text-[var(--c-ink-muted)]">No documents yet.</p>
      ) : (
        <NodeBody node={root} depth={0} hrefFor={hrefFor} target={target} showDownload={showDownload} onDelete={onDelete} deletingId={deletingId} />
      )}
    </div>
  );
}

type RowProps = { hrefFor: (id: number) => string; target?: "_blank"; showDownload: boolean; onDelete?: (id: number) => void; deletingId?: number | null };

function NodeBody({ node, depth, ...rest }: { node: FolderNode; depth: number } & RowProps) {
  const folders = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.base.localeCompare(b.base));
  return (
    <>
      {folders.map((f) => <FolderRow key={f.name} node={f} depth={depth} {...rest} />)}
      {files.map((f) => <FileLeaf key={f.id} file={f} depth={depth} {...rest} />)}
    </>
  );
}

function FolderRow({ node, depth, ...rest }: { node: FolderNode; depth: number } & RowProps) {
  const [open, setOpen] = useState(depth < 1);
  const n = countFiles(node);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--c-surface2)]" style={{ paddingLeft: 8 + depth * 16 }}>
        <ChevronRight size={14} className={`shrink-0 text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? <FolderOpen size={15} className="shrink-0 text-[var(--c-accent)]" /> : <FolderIcon size={15} className="shrink-0 text-[var(--c-accent)]" />}
        <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{n} file{n === 1 ? "" : "s"}</span>
      </button>
      {open && <NodeBody node={node} depth={depth + 1} {...rest} />}
    </div>
  );
}

function FileLeaf({ file, depth, hrefFor, target, showDownload, onDelete, deletingId }: { file: Leaf; depth: number } & RowProps) {
  const href = hrefFor(file.id);
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--c-surface2)]" style={{ paddingLeft: 8 + depth * 16 + 18 }}>
      <FileText size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
      <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined} className="min-w-0 flex-1 truncate text-sm hover:text-[var(--c-accent)]">{file.base}</a>
      <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{fmtSize(file.sizeBytes)}</span>
      {showDownload && <a href={href} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Download"><Download size={14} /></a>}
      {onDelete && (
        <button onClick={() => onDelete(file.id)} disabled={deletingId === file.id} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600 disabled:opacity-50" title="Remove">
          {deletingId === file.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );
}

/** Distinct folder paths present in a set of files + explicit dirs — for a
 *  "upload to…" destination picker. Includes all ancestor paths. */
export function folderPaths(files: { path: string }[], dirs: string[]): string[] {
  const set = new Set<string>();
  const add = (parts: string[]) => { for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/")); };
  for (const d of dirs) add(d.split("/").filter(Boolean));
  for (const f of files) { const p = f.path.split("/").filter(Boolean); p.pop(); if (p.length) add(p); }
  return [...set].sort((a, b) => a.localeCompare(b));
}
