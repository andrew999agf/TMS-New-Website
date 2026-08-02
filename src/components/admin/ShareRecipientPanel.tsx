"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, FolderPlus, Loader2, Download, Trash2 } from "lucide-react";
import { ShareFileTree, type TreeFile } from "./ShareFileTree";
import { ShareFilePreview } from "./ShareFilePreview";
import { ShareFolderCreateDialog } from "./ShareFolderCreateDialog";
import { filesFromDrop, fromInput, countDropItems, type PickedFile } from "@/lib/share/drop";
import { recipientRegisterFile, recipientMkdir, recipientDeleteFile, recipientDeleteFiles, recipientDeleteDir, recipientRenameDir, recipientClearUpload } from "@/app/share/[token]/actions";

type Caps = { download: boolean; upload: boolean; delete: boolean };

export function ShareRecipientPanel({ token, files, dirs, caps, blobReady }: { token: string; files: TreeFile[]; dirs: string[]; caps: Caps; blobReady: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dialogParent, setDialogParent] = useState<string | null>(null); // null=closed, ""=top-level, path=sub
  const [creatingDir, setCreatingDir] = useState(false);
  const [revealPath, setRevealPath] = useState<string | null>(null); // just-created folder to expand & scroll to
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingDir, setDeletingDir] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: number; base: string } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelected((prev) => {
      const present = new Set(files.map((f) => f.id));
      const next = new Set([...prev].filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]);

  function toggleSelect(ids: number[], checked: boolean) {
    setSelected((prev) => { const n = new Set(prev); for (const id of ids) { if (checked) n.add(id); else n.delete(id); } return n; });
  }
  function bulkDownload() {
    const ids = [...selected];
    if (ids.length) window.open(`/share/${token}/zip?ids=${ids.join(",")}`, "_blank");
  }
  function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Are you sure you want to delete ${ids.length} file${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    recipientDeleteFiles(token, ids).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't delete."); setSelected(new Set()); router.refresh(); }).catch(() => setError("Couldn't delete."));
  }

  useEffect(() => {
    const el = folderInput.current;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
  }, []);

  // While an upload is running, warn before the tab/app closes. Files still in
  // flight aren't on the server yet, so leaving now would drop them. (Files that
  // already finished uploading are safely saved and unaffected.)
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // Growable upload queue — dropping more files mid-upload appends to the same
  // queue and the count keeps climbing (e.g. 2/23) instead of being ignored.
  const UPLOAD_CONCURRENCY = 4;
  const queueRef = useRef<{ file: File; rel: string }[]>([]);
  const totalRef = useRef(0);
  const doneRef = useRef(0);
  const failedRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  const baseName = (p: string) => p.split("/").pop() || p;

  // Several files upload at once, and each is independent — one failure no
  // longer aborts the whole batch. Uploads are authorized exactly as before
  // (each goes through /api/share/<token>/upload).
  async function uploadWorker() {
    while (queueRef.current.length) {
      const item = queueRef.current.shift()!;
      const parts = item.rel.split("/");
      const base = parts.pop() as string;
      const dir = parts.join("/");
      try {
        const blob = await upload(`share-recipient/${item.rel}`, item.file, { access: "public", handleUploadUrl: `/api/share/${token}/upload` });
        const res = await recipientRegisterFile(token, { url: blob.url, pathname: blob.pathname, filename: base, dir, contentType: item.file.type || blob.contentType, size: item.file.size }, { total: totalRef.current, done: doneRef.current + 1 });
        if (!res.ok) throw new Error(res.error ?? "record failed");
      } catch {
        failedRef.current.push(base);
      } finally {
        doneRef.current += 1;
        setProgress(`Uploading ${doneRef.current} / ${totalRef.current}${failedRef.current.length ? ` · ${failedRef.current.length} failed` : ""}`);
      }
    }
  }

  async function drainQueue() {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setError(null);
    do {
      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queueRef.current.length) }, () => uploadWorker());
      await Promise.all(workers);
    } while (queueRef.current.length > 0);

    const failed = failedRef.current.slice();
    router.refresh();
    queueRef.current = [];
    totalRef.current = 0; doneRef.current = 0; failedRef.current = [];
    runningRef.current = false;
    setBusy(false);
    setProgress(null);
    recipientClearUpload(token).catch(() => {});
    if (fileInput.current) fileInput.current.value = "";
    if (folderInput.current) folderInput.current.value = "";
    setError(failed.length ? `${failed.length} file${failed.length === 1 ? "" : "s"} didn't upload (${failed.slice(0, 4).join(", ")}${failed.length > 4 ? ", …" : ""}). Everything else went in — please try adding just the failed one${failed.length === 1 ? "" : "s"} again.` : null);
    if (queueRef.current.length) drainQueue();
  }

  function enqueue(destPath: string, picked: PickedFile[]) {
    if (picked.length === 0) return;
    for (const { file, path } of picked) queueRef.current.push({ file, rel: destPath ? `${destPath}/${path}` : path });
    totalRef.current += picked.length;
    setProgress(`Uploading ${Math.min(doneRef.current + 1, totalRef.current)} / ${totalRef.current}`);
    drainQueue();
  }

  async function onUpload(destPath: string, dt: DataTransfer) {
    if (!caps.upload || !blobReady) return;
    const dropped = countDropItems(dt); // sync — before the await neuters the list
    let picked: PickedFile[] = [];
    try { picked = await filesFromDrop(dt); } catch { picked = []; }
    if (picked.length === 0) {
      if (dropped > 0) setError("This device couldn't read the folder you dropped. Use the “Add folder” button above instead, or drag the files themselves (not the folder).");
      return;
    }
    enqueue(destPath, picked);
  }

  function addFolder(name: string) {
    const clean = name.trim();
    if (!clean) return;
    const full = dialogParent ? `${dialogParent}/${clean}` : clean;
    setCreatingDir(true);
    recipientMkdir(token, full).then((r) => {
      if (!r.ok) { setError(r.error ?? "Couldn't create folder."); }
      else { setRevealPath(null); setTimeout(() => setRevealPath(full), 0); }
      setCreatingDir(false); setDialogParent(null); router.refresh();
    }).catch(() => { setError("Couldn't create the folder — try again."); setCreatingDir(false); setDialogParent(null); });
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

  function handleRenameDir(path: string, currentName: string) {
    const name = window.prompt("Rename this folder:", currentName);
    if (name == null || !name.trim() || name.trim() === currentName) return;
    recipientRenameDir(token, path, name.trim()).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't rename folder."); router.refresh(); }).catch(() => setError("Couldn't rename folder."));
  }

  return (
    <div className="space-y-2">
      {caps.upload && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button onClick={() => fileInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50"><Upload size={13} /> Add files</button>
            <button onClick={() => folderInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50"><Upload size={13} /> Add folder</button>
            <button onClick={() => setDialogParent("")} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)]">
              <FolderPlus size={13} /> New folder
            </button>
            {progress && <span className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]"><Loader2 size={13} className="animate-spin" /> {progress}</span>}
          </div>
          <p className="text-[11px] text-[var(--c-ink-muted)]">Drag files or whole folders onto the list below — drop them on a folder to add inside it, or on empty space for the top level.</p>
          {busy && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
              Upload in progress — please keep this page open until it finishes. Documents that have already uploaded are saved; anything still uploading will stop if you close this window or lock the device.
            </p>
          )}
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => enqueue("", fromInput(e.target.files))} />
          <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => enqueue("", fromInput(e.target.files))} />
        </>
      )}

      {error && <p className="text-xs text-[var(--c-error)]">{error}</p>}

      {selected.size > 0 && (caps.download || caps.delete) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--c-accent)] bg-[var(--c-accent)]/5 px-3 py-2 text-sm">
          <span className="font-medium text-[var(--c-ink)]">{selected.size} selected</span>
          {caps.download && <button onClick={bulkDownload} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:bg-[var(--c-surface2)]"><Download size={13} /> Download selected</button>}
          {caps.delete && <button onClick={bulkDelete} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-600 hover:bg-red-500/10"><Trash2 size={13} /> Delete selected</button>}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Clear</button>
        </div>
      )}

      <ShareFileTree
        files={files}
        dirs={dirs}
        hrefFor={(id) => `/share/${token}/file/${id}`}
        showDownload={caps.download}
        selectable={caps.download || caps.delete}
        selected={selected}
        onToggleSelect={toggleSelect}
        onDelete={caps.delete ? handleDelete : undefined}
        deletingId={deletingId}
        onDeleteDir={caps.delete ? handleDeleteDir : undefined}
        deletingDir={deletingDir}
        onRenameDir={caps.delete ? handleRenameDir : undefined}
        onAddSubdir={caps.upload ? (p) => setDialogParent(p) : undefined}
        onPreview={(f) => setPreview(f)}
        onUpload={caps.upload && blobReady ? onUpload : undefined}
        revealPath={revealPath}
      />
      {dialogParent !== null && (
        <ShareFolderCreateDialog parent={dialogParent} busy={creatingDir} onCancel={() => setDialogParent(null)} onCreate={addFolder} />
      )}

      <ShareFilePreview
        file={preview ? { name: preview.base, previewUrl: `/share/${token}/file/${preview.id}?preview=1`, downloadUrl: `/share/${token}/file/${preview.id}` } : null}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
