"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, FolderPlus, Loader2 } from "lucide-react";
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
        onUpload={caps.upload && blobReady ? onUpload : undefined}
      />
    </div>
  );
}
