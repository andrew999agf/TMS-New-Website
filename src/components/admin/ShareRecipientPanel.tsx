"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, FolderPlus, Loader2 } from "lucide-react";
import { ShareFileTree, folderPaths, type TreeFile } from "./ShareFileTree";
import { filesFromDrop, fromInput, type PickedFile } from "@/lib/share/drop";
import { recipientRegisterFile, recipientMkdir, recipientDeleteFile } from "@/app/share/[token]/actions";

type Caps = { download: boolean; upload: boolean; delete: boolean };

export function ShareRecipientPanel({ token, files, dirs, caps, blobReady }: { token: string; files: TreeFile[]; dirs: string[]; caps: Caps; blobReady: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [dest, setDest] = useState("");
  const [newDir, setNewDir] = useState("");
  const [creatingDir, setCreatingDir] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const destinations = useMemo(() => folderPaths(files, dirs), [files, dirs]);

  useEffect(() => {
    const el = folderInput.current;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
  }, []);

  async function uploadAll(picked: PickedFile[]) {
    if (picked.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (let i = 0; i < picked.length; i++) {
        const { file, path } = picked[i];
        const rel = dest ? `${dest}/${path}` : path;
        setProgress(`Uploading ${i + 1} of ${picked.length}: ${rel}`);
        const parts = rel.split("/");
        const base = parts.pop() as string;
        const dir = parts.join("/");
        const blob = await upload(`share-recipient/${rel}`, file, {
          access: "public",
          handleUploadUrl: `/api/share/${token}/upload`,
        });
        const res = await recipientRegisterFile(token, { url: blob.url, pathname: blob.pathname, filename: base, dir, contentType: file.type || blob.contentType, size: file.size });
        if (!res.ok) throw new Error(res.error ?? "Upload failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
      if (folderInput.current) folderInput.current.value = "";
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (!caps.upload || !blobReady || busy) return;
    await uploadAll(await filesFromDrop(e.dataTransfer));
  }

  function addFolder() {
    const name = newDir.trim();
    if (!name) return;
    setCreatingDir(true);
    recipientMkdir(token, dest ? `${dest}/${name}` : name)
      .then((r) => { if (!r.ok) setError(r.error ?? "Couldn't create folder."); setNewDir(""); setCreatingDir(false); router.refresh(); })
      .catch(() => setCreatingDir(false));
  }

  function handleDelete(id: number) {
    if (!confirm("Remove this file?")) return;
    setDeletingId(id);
    recipientDeleteFile(token, id).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't remove."); setDeletingId(null); router.refresh(); }).catch(() => setDeletingId(null));
  }

  return (
    <div className="space-y-3">
      {caps.upload && (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--c-ink-muted)]">Add to:</span>
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5">
              <option value="">Top level</option>
              {destinations.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input value={newDir} onChange={(e) => setNewDir(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFolder(); } }} placeholder="New folder name…" className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5" />
            <button onClick={addFolder} disabled={creatingDir || !newDir.trim()} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50">
              {creatingDir ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />} New folder
            </button>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${drag ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}
          >
            <Upload size={20} className="mx-auto mb-1.5 text-[var(--c-ink-muted)]" />
            <p className="text-sm text-[var(--c-ink-muted)]">Drag files or folders here, or{" "}
              <button onClick={() => fileInput.current?.click()} disabled={busy} className="font-medium text-[var(--c-accent)] disabled:opacity-50">browse files</button>
              {" "}·{" "}
              <button onClick={() => folderInput.current?.click()} disabled={busy} className="font-medium text-[var(--c-accent)] disabled:opacity-50">choose a folder</button>.
            </p>
            <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Whole folders keep their structure{dest ? ` — added under “${dest}”` : ""}.</p>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => uploadAll(fromInput(e.target.files))} />
            <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => uploadAll(fromInput(e.target.files))} />
            {progress && <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><Loader2 size={13} className="animate-spin" /> {progress}</p>}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-[var(--c-error)]">{error}</p>}

      <ShareFileTree
        files={files}
        dirs={dirs}
        hrefFor={(id) => `/share/${token}/file/${id}`}
        showDownload={caps.download}
        onDelete={caps.delete ? handleDelete : undefined}
        deletingId={deletingId}
      />
    </div>
  );
}
