"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, FolderPlus, Loader2, X, ChevronsRight, Download } from "lucide-react";
import { ShareFileTree, type TreeFile } from "./ShareFileTree";
import { filesFromDrop, fromInput, type PickedFile } from "@/lib/share/drop";
import { recipientRegisterFile, recipientMkdir, recipientDeleteFile, recipientDeleteDir, recipientClearUpload } from "@/app/share/[token]/actions";

type Caps = { download: boolean; upload: boolean; delete: boolean };

export function ShareRecipientPanel({ token, files, dirs, caps, blobReady }: { token: string; files: TreeFile[]; dirs: string[]; caps: Caps; blobReady: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [newDir, setNewDir] = useState("");
  const [creatingDir, setCreatingDir] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingDir, setDeletingDir] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: number; base: string } | null>(null);

  useEffect(() => {
    const el = folderInput.current;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
  }, []);

  async function uploadTo(destPath: string, picked: PickedFile[]) {
    if (picked.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (let i = 0; i < picked.length; i++) {
        const { file, path } = picked[i];
        const rel = destPath ? `${destPath}/${path}` : path;
        setProgress(`Uploading ${i + 1} / ${picked.length}`);
        const parts = rel.split("/");
        const base = parts.pop() as string;
        const dir = parts.join("/");
        const blob = await upload(`share-recipient/${rel}`, file, { access: "public", handleUploadUrl: `/api/share/${token}/upload` });
        const res = await recipientRegisterFile(token, { url: blob.url, pathname: blob.pathname, filename: base, dir, contentType: file.type || blob.contentType, size: file.size }, { total: picked.length, done: i + 1 });
        if (!res.ok) throw new Error(res.error ?? "Upload failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
      recipientClearUpload(token).catch(() => {});
      if (fileInput.current) fileInput.current.value = "";
      if (folderInput.current) folderInput.current.value = "";
    }
  }

  async function onUpload(destPath: string, dt: DataTransfer) {
    if (!caps.upload || !blobReady || busy) return;
    await uploadTo(destPath, await filesFromDrop(dt));
  }

  function addFolder() {
    const name = newDir.trim();
    if (!name) return;
    setCreatingDir(true);
    recipientMkdir(token, name).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't create folder."); setNewDir(""); setCreatingDir(false); router.refresh(); }).catch(() => setCreatingDir(false));
  }

  function handleDelete(id: number) {
    if (!confirm("Remove this file?")) return;
    setDeletingId(id);
    recipientDeleteFile(token, id).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't remove."); setDeletingId(null); router.refresh(); }).catch(() => setDeletingId(null));
  }

  function handleDeleteDir(path: string) {
    if (!confirm(`Delete the folder “${path}” and everything inside it?`)) return;
    setDeletingDir(path);
    recipientDeleteDir(token, path).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't remove folder."); setDeletingDir(null); router.refresh(); }).catch(() => setDeletingDir(null));
  }

  return (
    <div className="space-y-2">
      {caps.upload && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button onClick={() => fileInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50"><Upload size={13} /> Add files</button>
            <button onClick={() => folderInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50"><Upload size={13} /> Add folder</button>
            <input value={newDir} onChange={(e) => setNewDir(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFolder(); } }} placeholder="New folder name…" className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5" />
            <button onClick={addFolder} disabled={creatingDir || !newDir.trim()} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50">
              {creatingDir ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />} New folder
            </button>
            {progress && <span className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]"><Loader2 size={13} className="animate-spin" /> {progress}</span>}
          </div>
          <p className="text-[11px] text-[var(--c-ink-muted)]">Drag files or whole folders onto the list below — drop them on a folder to add inside it, or on empty space for the top level.</p>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => uploadTo("", fromInput(e.target.files))} />
          <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => uploadTo("", fromInput(e.target.files))} />
        </>
      )}

      {error && <p className="text-xs text-[var(--c-error)]">{error}</p>}

      <ShareFileTree
        files={files}
        dirs={dirs}
        hrefFor={(id) => `/share/${token}/file/${id}`}
        showDownload={caps.download}
        onDelete={caps.delete ? handleDelete : undefined}
        deletingId={deletingId}
        onDeleteDir={caps.delete ? handleDeleteDir : undefined}
        deletingDir={deletingDir}
        onPreview={(f) => setPreview(f)}
        onUpload={caps.upload && blobReady ? onUpload : undefined}
      />

      <PreviewDrawer token={token} file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

const IMG_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"]);

function PreviewDrawer({ token, file, onClose }: { token: string; file: { id: number; base: string } | null; onClose: () => void }) {
  const [content, setContent] = useState(file);
  useEffect(() => { if (file) setContent(file); }, [file]);
  const open = !!file;
  const cur = content;
  const ext = cur ? (cur.base.split(".").pop()?.toLowerCase() ?? "") : "";
  const url = cur ? `/share/${token}/file/${cur.id}?preview=1` : "";

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        onTransitionEnd={() => { if (!open) setContent(null); }}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(94vw,640px)] flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)] shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
          <button onClick={onClose} title="Close preview" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--c-ink)]">{cur?.base}</span>
          {cur && <a href={`/share/${token}/file/${cur.id}`} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Download"><Download size={16} /></a>}
          <button onClick={onClose} title="Slide back" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><ChevronsRight size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--c-surface2)]">
          {cur && ext === "pdf" && <iframe src={url} title={cur.base} className="h-full w-full border-0" />}
          {cur && IMG_EXT.has(ext) && (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="flex h-full items-center justify-center p-3"><img src={url} alt={cur.base} className="max-h-full max-w-full object-contain" /></div>
          )}
          {cur && ext !== "pdf" && !IMG_EXT.has(ext) && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-[var(--c-ink-muted)]">This file type can&apos;t be previewed in the browser.</p>
              <a href={`/share/${token}/file/${cur.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white"><Download size={14} /> Download to open</a>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
