"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Folder as FolderIcon, FolderOpen, FileText, Download, Trash2, Loader2 } from "lucide-react";

export type TreeFile = { id: number; path: string; sizeBytes: number | null; url?: string };
type FolderNode = { name: string; children: Map<string, FolderNode>; files: (TreeFile & { base: string })[] };

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function buildTree(files: TreeFile[]): FolderNode {
  const root: FolderNode = { name: "", children: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    const base = parts.pop() ?? f.path;
    let node = root;
    for (const p of parts) {
      let child = node.children.get(p);
      if (!child) { child = { name: p, children: new Map(), files: [] }; node.children.set(p, child); }
      node = child;
    }
    node.files.push({ ...f, base });
  }
  return root;
}

function countFiles(node: FolderNode): number {
  let n = node.files.length;
  for (const c of node.children.values()) n += countFiles(c);
  return n;
}

export function ShareFileTree({ files, mode, token, onDelete, deletingId }: {
  files: TreeFile[];
  mode: "share" | "admin";
  token?: string;
  onDelete?: (id: number) => void;
  deletingId?: number | null;
}) {
  const root = useMemo(() => buildTree(files), [files]);
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 text-[var(--c-ink)]">
      <NodeBody node={root} depth={0} mode={mode} token={token} onDelete={onDelete} deletingId={deletingId} />
    </div>
  );
}

function NodeBody({ node, depth, mode, token, onDelete, deletingId }: {
  node: FolderNode; depth: number; mode: "share" | "admin"; token?: string; onDelete?: (id: number) => void; deletingId?: number | null;
}) {
  const folders = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.base.localeCompare(b.base));
  return (
    <>
      {folders.map((f) => <FolderRow key={f.name} node={f} depth={depth} mode={mode} token={token} onDelete={onDelete} deletingId={deletingId} />)}
      {files.map((f) => <FileLeaf key={f.id} file={f} depth={depth} mode={mode} token={token} onDelete={onDelete} deletingId={deletingId} />)}
    </>
  );
}

function FolderRow({ node, depth, mode, token, onDelete, deletingId }: {
  node: FolderNode; depth: number; mode: "share" | "admin"; token?: string; onDelete?: (id: number) => void; deletingId?: number | null;
}) {
  const [open, setOpen] = useState(depth < 1); // top level open, deeper collapsed
  const n = countFiles(node);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--c-surface2)]"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <ChevronRight size={14} className={`shrink-0 text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? <FolderOpen size={15} className="shrink-0 text-[var(--c-accent)]" /> : <FolderIcon size={15} className="shrink-0 text-[var(--c-accent)]" />}
        <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{n} file{n === 1 ? "" : "s"}</span>
      </button>
      {open && <NodeBody node={node} depth={depth + 1} mode={mode} token={token} onDelete={onDelete} deletingId={deletingId} />}
    </div>
  );
}

function FileLeaf({ file, depth, mode, token, onDelete, deletingId }: {
  file: TreeFile & { base: string }; depth: number; mode: "share" | "admin"; token?: string; onDelete?: (id: number) => void; deletingId?: number | null;
}) {
  const href = mode === "share" ? `/share/${token}/file/${file.id}` : file.url ?? "#";
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--c-surface2)]" style={{ paddingLeft: 8 + depth * 16 + 18 }}>
      <FileText size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
      <a
        href={href}
        target={mode === "admin" ? "_blank" : undefined}
        rel={mode === "admin" ? "noopener noreferrer" : undefined}
        className="min-w-0 flex-1 truncate text-sm hover:text-[var(--c-accent)]"
      >
        {file.base}
      </a>
      <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{fmtSize(file.sizeBytes)}</span>
      {mode === "share" ? (
        <a href={href} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Download"><Download size={14} /></a>
      ) : onDelete ? (
        <button onClick={() => onDelete(file.id)} disabled={deletingId === file.id} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600 disabled:opacity-50" title="Remove">
          {deletingId === file.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      ) : null}
    </div>
  );
}
