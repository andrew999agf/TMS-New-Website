"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  Upload, Trash2, Loader2, Mail, Send, RotateCw, Ban, Check,
  Archive, ArchiveRestore, Pencil, AlertTriangle, Link2, FolderPlus, Eye,
} from "lucide-react";
import { Lock } from "lucide-react";
import { SHARE_TYPES, SHARE_PERMISSIONS, RECIPIENT_KINDS, shareType, audienceStyle, recipientWarnings, classifyEmail, defaultKindForType, kindLabel, folderSupportsWorkspace, expiryDaysForType, type ShareFolderMeta } from "@/lib/share/types";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { ShareFileTree, type DirInfo } from "./ShareFileTree";
import { ShareFilePreview, type PreviewFile } from "./ShareFilePreview";
import { ShareFolderCreateDialog } from "./ShareFolderCreateDialog";
import { LinkTreeDialog } from "./ShareLinkTree";
import { ListTree } from "lucide-react";
import { FolderWorkspaceEditor } from "./ShareWorkspace";
import { filesFromDrop, fromInput, isJunk, countDropItems, type PickedFile } from "@/lib/share/drop";
import {
  registerShareFile, deleteFile, deleteFiles, deleteDir, renameDir, addRecipient, resendInvite, setRecipientRevoked, setRecipientPermission, setRecipientExpiry, createDir, clearUpload,
  archiveFolder, deleteFolder, updateFolder, setFolderFileLinks,
} from "@/app/admin/(panel)/share-folders/actions";
import { Download } from "lucide-react";

export type FolderData = { id: number; caseNumber: string; name: string; matter: string; court: string; type: string; notes: string; meta: ShareFolderMeta; requireAuth: boolean; archived: boolean };
export type FileRow = { id: number; url: string; filename: string; contentType: string | null; sizeBytes: number | null; createdAt: string; by: string };
export type RecipientRow = { id: number; email: string; name: string; token: string; invitedAt: string; lastAccessAt: string | null; expiresAt: string | null; permission: string; kind: string; requireAuth: boolean; revoked: boolean };

const FIRM_DOMAIN = "texaslawsmith.com";
const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
// A local YYYY-MM-DD string for <input type="date">.
const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isoToDateInput = (iso: string | null) => (iso ? toDateInput(new Date(iso)) : "");

export type Contact = { email: string; name: string };

export function ShareFolderDetail({ folder, files, recipients, dirs, dirInfo, matters, contacts, blobReady }: { folder: FolderData; files: FileRow[]; recipients: RecipientRow[]; dirs: string[]; dirInfo?: DirInfo; matters: MatterOption[]; contacts: Contact[]; blobReady: boolean }) {
  const t = shareType(folder.type);
  const s = audienceStyle(t.audience);

  return (
    <div className="space-y-6">
      {/* Banner: unmistakable "what kind of folder this is / who sees it" */}
      <div className={`rounded-lg border-2 px-4 py-3 ${s.banner}`}>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold tracking-wide ${s.badge}`}>{t.short}</span>
          <span className="text-sm font-semibold">{t.label}</span>
          {t.audience === "adversary" && <AlertTriangle size={16} className="text-red-600" />}
        </div>
        <p className="mt-1.5 text-sm font-medium">{t.banner}</p>
      </div>

      <FolderHeader folder={folder} matters={matters} />

      <SecurityToggle folder={folder} recipients={recipients} />

      {folderSupportsWorkspace(folder.type) && (
        <FolderWorkspaceEditor folderId={folder.id} initial={folder.meta} contacts={contacts} />
      )}

      <FilesSection folderId={folder.id} folderName={folder.name} files={files} dirs={dirs} dirInfo={dirInfo} blobReady={blobReady} filePublicToken={folder.meta.fileLinks && folder.meta.publicToken ? folder.meta.publicToken : null} />

      <RecipientsSection folderId={folder.id} typeKey={folder.type} recipients={recipients} contacts={contacts} />
    </div>
  );
}

function SecurityToggle({ folder, recipients }: { folder: FolderData; recipients: RecipientRow[] }) {
  const router = useRouter();
  // The checkbox is framed as "open link" (the inverse of require-sign-in).
  const [open, setOpen] = useState(!folder.requireAuth);
  const [pending, start] = useTransition();
  const [showInfo, setShowInfo] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [fileLinks, setFileLinks] = useState(!!folder.meta.fileLinks);
  const openLinks = recipients.filter((r) => !r.revoked);

  return (
    <div className={`rounded-lg border p-2.5 ${open ? "border-amber-500/50 bg-amber-500/[0.06]" : "border-[var(--c-border)] bg-[var(--c-surface)]"}`}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={open}
          disabled={pending}
          onChange={(e) => { const v = e.target.checked; setOpen(v); if (!v) setShowCopy(false); start(async () => { await updateFolder(folder.id, { requireAuth: !v }); router.refresh(); }); }}
        />
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--c-ink)]">
          {open ? <Link2 size={13} className="text-amber-600" /> : <Lock size={13} className="text-emerald-600" />}
          Anyone with this link can view (no sign-in)
          {pending && <Loader2 size={12} className="inline animate-spin" />}
        </span>
      </label>

      {open ? (
        <div className="mt-1 pl-6">
          <p className="text-[11px] text-amber-700 dark:text-amber-300">Only for non-confidential material — anyone who has the link can open it.</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button onClick={() => setShowInfo((v) => !v)} className="text-[11px] text-[var(--c-accent)] hover:underline">Click here for more information</button>
            <button onClick={() => setShowCopy((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-[var(--c-accent)] hover:underline"><Link2 size={11} /> Click here to copy link</button>
          </div>
          {showInfo && (
            <p className="mt-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
              With sign-in off, this is a private link that opens without any verification, so <strong>anyone who has the URL can view every document here</strong>. Use it only for public, non-confidential material — e.g., discovery produced to opposing counsel or documents to a witness. <strong>Never turn this off for privileged, confidential, client, or co-counsel communications</strong> — leave it checked so recipients must verify with a password or a one-time email code.
            </p>
          )}
          {showCopy && (
            <div className="mt-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-2 shadow-sm">
              {openLinks.length > 0 ? (
                <div className="space-y-1">
                  {openLinks.length > 1 && <p className="text-[10px] text-[var(--c-ink-muted)]">One link per recipient — copy the one you need:</p>}
                  {openLinks.map((r) => <OpenLinkRow key={r.id} r={r} />)}
                </div>
              ) : (
                <p className="text-[11px] text-[var(--c-ink-muted)]">Add a recipient below to generate a shareable link.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-0.5 pl-6 text-[11px] text-[var(--c-ink-muted)]">Recommended. Recipients must verify with a password or a one-time email code before viewing.</p>
      )}

      {/* File links work for open AND secure folders — on a secure folder the
          reader just signs in first. */}
      <label className="mt-2 flex items-start gap-2 border-t border-[var(--c-border)] pt-2 text-[11px] text-[var(--c-ink-muted)]" title="When on, opening a file's preview shows a copyable link at the top. Paste it into a document; the reader clicks it and opens straight to that file (a secure folder will ask them to sign in first).">
        <input type="checkbox" checked={fileLinks} disabled={pending} onChange={(e) => { const v = e.target.checked; setFileLinks(v); start(async () => { await setFolderFileLinks(folder.id, v); router.refresh(); }); }} className="mt-0.5" />
        <span>Give each file a copyable direct link on its preview — for pasting into documents so a reader can click straight to that file. {open ? "Anyone with the link can open it." : "The reader signs in (login or one-time code) first."}</span>
      </label>
    </div>
  );
}

/** One open-link row with a copy button, shown in the security card when sign-in
 *  is off so the admin can grab the link right where they toggled it. */
function OpenLinkRow({ r }: { r: RecipientRow }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/share/${r.token}` : `/share/${r.token}`;
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1">
      <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{r.name || r.email}</span>
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 truncate bg-transparent text-[11px] text-[var(--c-ink)] outline-none" />
      <button
        onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        title="Copy this link"
        className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--c-border)] px-1.5 py-0.5 text-[11px] text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
      >
        {copied ? <Check size={12} className="text-green-600" /> : <Link2 size={12} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ------------------------------ header / meta ------------------------------ */

function FolderHeader({ folder, matters }: { folder: FolderData; matters: MatterOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [caseNumber, setCaseNumber] = useState(folder.caseNumber);
  const [name, setName] = useState(folder.name);
  const [matter, setMatter] = useState(folder.matter);
  const [court, setCourt] = useState(folder.court);
  const [type, setType] = useState(folder.type);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      await updateFolder(folder.id, { caseNumber, name, matter, court, type });
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Client name</span><input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Matter <span className="opacity-70">(Clio list)</span></span><MatterCombobox matters={matters} value={matter} onChange={setMatter} placeholder="Search matter…" /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Case / cause number</span><input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Court / location</span><input value={court} onChange={(e) => setCourt(e.target.value)} className={`${input} w-full`} /></label>
          <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">Folder type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={`${input} w-full`}>
              {SHARE_TYPES.map((tt) => <option key={tt.key} value={tt.key}>{tt.label}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button onClick={save} disabled={pending || !name.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : "Save"}</button>
            <button onClick={() => setEditing(false)} className="text-sm text-[var(--c-ink-muted)]">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--c-ink)]">{folder.name}</h2>
            <div className="mt-0.5 space-y-0.5 text-sm text-[var(--c-ink-muted)]">
              {folder.matter && <p>Matter: {folder.matter}</p>}
              {folder.caseNumber && <p>Case {folder.caseNumber}</p>}
              {folder.court && <p>{folder.court}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]"><Pencil size={13} /> Edit</button>
            <ArchiveButton folder={folder} />
            <DeleteButton folderId={folder.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function ArchiveButton({ folder }: { folder: FolderData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await archiveFolder(folder.id, !folder.archived); router.refresh(); })}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : folder.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
      {folder.archived ? "Restore" : "Archive"}
    </button>
  );
}

function DeleteButton({ folderId }: { folderId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => { if (confirm("Delete this folder, its files, and all invites? This cannot be undone.")) start(async () => { await deleteFolder(folderId); router.push("/admin/share-folders"); }); }}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
    </button>
  );
}

/* --------------------------------- files ---------------------------------- */

function FilesSection({ folderId, folderName, files, dirs, dirInfo, blobReady, filePublicToken }: { folderId: number; folderName: string; files: FileRow[]; dirs: string[]; dirInfo?: DirInfo; blobReady: boolean; filePublicToken: string | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingDir, setDeletingDir] = useState<string | null>(null);
  const [dialogParent, setDialogParent] = useState<string | null>(null); // null=closed, ""=top-level, path=sub
  const [creatingDir, setCreatingDir] = useState(false);
  const [revealPath, setRevealPath] = useState<string | null>(null); // just-created folder to expand & scroll to
  const [showLinkTree, setShowLinkTree] = useState(false);
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const urlById = useMemo(() => new Map(files.map((f) => [f.id, f.url])), [files]);

  // Drop selections that no longer exist (after a delete/refresh).
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
    if (ids.length) window.open(`/admin/share-folders/${folderId}/zip?ids=${ids.join(",")}`, "_blank");
  }
  function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Are you sure you want to delete ${ids.length} file${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    deleteFiles(folderId, ids).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't delete."); setSelected(new Set()); router.refresh(); }).catch(() => setError("Couldn't delete."));
  }

  function addFolder(name: string) {
    const clean = name.trim();
    if (!clean) return;
    const full = dialogParent ? `${dialogParent}/${clean}` : clean;
    setCreatingDir(true);
    createDir(folderId, full).then((r) => {
      if (!r.ok) { setError(r.error ?? "Couldn't create folder."); }
      else { setRevealPath(null); setTimeout(() => setRevealPath(full), 0); } // re-trigger even if same name recreated
      setCreatingDir(false); setDialogParent(null); router.refresh();
    }).catch(() => { setError("Couldn't create the folder — try again."); setCreatingDir(false); setDialogParent(null); });
  }

  function handleDelete(id: number) {
    if (!confirm("Remove this file?")) return;
    setDeletingId(id);
    deleteFile(id).then(() => { setDeletingId(null); router.refresh(); }).catch(() => setDeletingId(null));
  }

  function handleDeleteDir(path: string) {
    if (!confirm(`Delete the folder “${path}” and everything inside it? This can't be undone.`)) return;
    setDeletingDir(path);
    deleteDir(folderId, path).then(() => { setDeletingDir(null); router.refresh(); }).catch(() => setDeletingDir(null));
  }

  function handleRenameDir(path: string, currentName: string) {
    const name = window.prompt("Rename this folder:", currentName);
    if (name == null || !name.trim() || name.trim() === currentName) return;
    renameDir(folderId, path, name.trim()).then((r) => { if (!r.ok) setError(r.error ?? "Couldn't rename."); router.refresh(); }).catch(() => setError("Couldn't rename."));
  }

  useEffect(() => {
    const el = folderInput.current;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
  }, []);

  // Warn before leaving while an upload is running — in-flight files aren't on
  // the server yet. Already-finished uploads are saved and unaffected.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // A growable, concurrent upload queue. Several files upload at once (much
  // faster for many photos/videos), and each file is independent — if one
  // fails, the rest still go in and we report which failed. Uploads are still
  // authorized exactly as before (each goes through /api/admin/share-upload).
  const UPLOAD_CONCURRENCY = 4;
  const queueRef = useRef<{ file: File; rel: string }[]>([]);
  const totalRef = useRef(0);
  const doneRef = useRef(0);
  const failedRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  const baseName = (p: string) => p.split("/").pop() || p;

  async function uploadWorker() {
    while (queueRef.current.length) {
      const item = queueRef.current.shift()!;
      try {
        const blob = await upload(`share/${folderId}/${item.rel}`, item.file, { access: "public", handleUploadUrl: "/api/admin/share-upload", clientPayload: String(folderId) });
        const res = await registerShareFile(folderId, { url: blob.url, pathname: blob.pathname, filename: item.rel, contentType: item.file.type || blob.contentType, size: item.file.size }, { total: totalRef.current, done: doneRef.current + 1 });
        if (!res.ok) throw new Error(res.error ?? "record failed");
      } catch {
        failedRef.current.push(baseName(item.rel));
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
    clearUpload(folderId).catch(() => {});
    if (fileInput.current) fileInput.current.value = "";
    if (folderInput.current) folderInput.current.value = "";
    setError(failed.length ? `${failed.length} file${failed.length === 1 ? "" : "s"} didn't upload (${failed.slice(0, 4).join(", ")}${failed.length > 4 ? ", …" : ""}). Everything else went in — you can re-add just the failed one${failed.length === 1 ? "" : "s"}.` : null);
    if (queueRef.current.length) drainQueue(); // picked up files dropped during teardown
  }

  function enqueue(destPath: string, picked: PickedFile[]) {
    const items = picked.filter((p) => !isJunk(p.file.name));
    if (items.length === 0) return;
    for (const { file, path } of items) queueRef.current.push({ file, rel: destPath ? `${destPath}/${path}` : path });
    totalRef.current += items.length;
    setProgress(`Uploading ${Math.min(doneRef.current + 1, totalRef.current)} / ${totalRef.current}`);
    drainQueue();
  }

  async function onUpload(destPath: string, dt: DataTransfer) {
    if (!blobReady) return;
    const dropped = countDropItems(dt); // sync — before the await neuters the list
    let picked: PickedFile[] = [];
    try { picked = await filesFromDrop(dt); } catch { picked = []; }
    if (picked.length === 0) {
      if (dropped > 0) setError("Couldn't read the folder that was dropped. Try the “Add folder” button instead, or drag the files themselves rather than the folder.");
      return;
    }
    enqueue(destPath, picked);
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-[var(--c-ink)]">Documents ({files.length})</h3>

      {/* One folder-like surface: a slim toolbar, then the drop-target tree */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <button onClick={() => fileInput.current?.click()} disabled={!blobReady || busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50"><Upload size={13} /> Add files</button>
        <button onClick={() => folderInput.current?.click()} disabled={!blobReady || busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)] disabled:opacity-50"><Upload size={13} /> Add folder</button>
        <button onClick={() => setDialogParent("")} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)]">
          <FolderPlus size={13} /> New folder
        </button>
        {files.length > 0 && (
          <a href={`/admin/share-folders/${folderId}/zip`} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)]"><Download size={13} /> Download all</a>
        )}
        {files.length > 0 && (
          <button onClick={() => setShowLinkTree(true)} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 hover:bg-[var(--c-surface2)]"><ListTree size={13} /> Download link tree</button>
        )}
        {progress && <span className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]"><Loader2 size={13} className="animate-spin" /> {progress}</span>}
      </div>
      <p className="mb-2 text-[11px] text-[var(--c-ink-muted)]">Drag files or whole folders straight onto this list — drop them on a folder to add inside it, or on empty space for the top level.</p>
      {busy && <p className="mb-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">Upload in progress — keep this tab open until it finishes. Files already uploaded are saved; anything still uploading stops if you close the tab.</p>}
      {!blobReady && <p className="mb-2 text-xs text-amber-600">Connect a Blob store to enable uploads.</p>}

      {selected.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--c-accent)] bg-[var(--c-accent)]/5 px-3 py-2 text-sm">
          <span className="font-medium text-[var(--c-ink)]">{selected.size} selected</span>
          <button onClick={bulkDownload} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:bg-[var(--c-surface2)]"><Download size={13} /> Download selected</button>
          <button onClick={bulkDelete} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-600 hover:bg-red-500/10"><Trash2 size={13} /> Delete selected</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Clear</button>
        </div>
      )}

      <ShareFileTree
        files={files.map((f) => ({ id: f.id, path: f.filename, sizeBytes: f.sizeBytes, by: f.by, at: f.createdAt }))}
        dirs={dirs}
        dirInfo={dirInfo}
        hrefFor={(id) => urlById.get(id) ?? "#"}
        target="_blank"
        showDownload
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onPreview={(f) => { const url = urlById.get(f.id); if (url) setPreview({ name: f.base, previewUrl: url, downloadUrl: url, copyLink: filePublicToken ? `${window.location.origin}/share/f/${filePublicToken}/${f.id}` : undefined }); }}
        onDelete={handleDelete}
        deletingId={deletingId}
        onDeleteDir={handleDeleteDir}
        deletingDir={deletingDir}
        onRenameDir={handleRenameDir}
        onAddSubdir={(p) => setDialogParent(p)}
        onUpload={blobReady ? onUpload : undefined}
        revealPath={revealPath}
      />
      {dialogParent !== null && (
        <ShareFolderCreateDialog parent={dialogParent} busy={creatingDir} onCancel={() => setDialogParent(null)} onCreate={addFolder} />
      )}
      {showLinkTree && (
        <LinkTreeDialog folderId={folderId} folderName={folderName} files={files.map((f) => ({ id: f.id, url: f.url, filename: f.filename }))} onClose={() => setShowLinkTree(false)} />
      )}
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => enqueue("", fromInput(e.target.files))} />
      <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => enqueue("", fromInput(e.target.files))} />
      <ShareFilePreview file={preview} onClose={() => setPreview(null)} />
    </section>
  );
}

/* ------------------------------- recipients ------------------------------- */

function RecipientsSection({ folderId, typeKey, recipients, contacts }: { folderId: number; typeKey: string; recipients: RecipientRow[]; contacts: Contact[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-[var(--c-ink)]">Shared with ({recipients.filter((r) => !r.revoked).length})</h3>
      <AddRecipient folderId={folderId} typeKey={typeKey} contacts={contacts} />
      {recipients.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)]">
          {recipients.map((r) => <RecipientRowItem key={r.id} r={r} />)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--c-ink-muted)]">No one has been invited yet.</p>
      )}
    </section>
  );
}

function AddRecipient({ folderId, typeKey, contacts }: { folderId: number; typeKey: string; contacts: Contact[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [permission, setPermission] = useState("download");
  const [kind, setKind] = useState(defaultKindForType(typeKey));
  const [ack, setAck] = useState(false);
  const [expiry, setExpiry] = useState(toDateInput(new Date(Date.now() + expiryDaysForType(typeKey) * 86_400_000)));
  const [openSug, setOpenSug] = useState(false);
  const sugRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = email.trim().toLowerCase();
    if (!openSug) return [];
    const pool = q ? contacts.filter((c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : contacts;
    // Don't suggest an exact match that's already fully typed.
    return pool.filter((c) => c.email.toLowerCase() !== q).slice(0, 8);
  }, [contacts, email, openSug]);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (sugRef.current && !sugRef.current.contains(e.target as Node)) setOpenSug(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(c: Contact) { setEmail(c.email); setName(c.name); setAck(false); setOpenSug(false); }
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const warnings = useMemo(() => {
    const e = email.trim().toLowerCase();
    if (!classifyEmail(e).domain) return [];
    return recipientWarnings(typeKey, e, FIRM_DOMAIN);
  }, [email, typeKey]);
  const hasDanger = warnings.some((w) => w.level === "danger");

  function submit() {
    setError(null);
    setOkMsg(null);
    if (hasDanger && !ack) { setError("Please confirm the warning below before sharing."); return; }
    start(async () => {
      const res = await addRecipient(folderId, email, name, permission, kind, hasDanger ? ack : true, expiry || undefined);
      if (res.ok) {
        setOkMsg(res.error ?? `Invite sent to ${email.trim().toLowerCase()}.`);
        setEmail(""); setName(""); setAck(false);
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't share.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs flex-1 min-w-[12rem]"><span className="mb-1 block text-[var(--c-ink-muted)]">Email to invite</span>
          <div ref={sugRef} className="relative">
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAck(false); setOpenSug(true); }}
              onFocus={() => setOpenSug(true)}
              placeholder="name@example.com"
              autoComplete="off"
              className={`${input} w-full`}
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
                {suggestions.map((c) => (
                  <button key={c.email} type="button" onClick={() => pick(c)} className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-[var(--c-surface2)]">
                    <span className="text-sm text-[var(--c-ink)]">{c.name || c.email}</span>
                    {c.name && <span className="text-[11px] text-[var(--c-ink-muted)]">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>
        <label className="text-xs flex-1 min-w-[10rem]"><span className="mb-1 block text-[var(--c-ink-muted)]">Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className={`${input} w-full`} />
        </label>
        <label className="text-xs min-w-[9rem]"><span className="mb-1 block text-[var(--c-ink-muted)]">Who is this?</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${input} w-full`}>
            {RECIPIENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label className="text-xs min-w-[13rem]"><span className="mb-1 block text-[var(--c-ink-muted)]">Access level</span>
          <select value={permission} onChange={(e) => setPermission(e.target.value)} className={`${input} w-full`}>
            {SHARE_PERMISSIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="text-xs min-w-[9rem]"><span className="mb-1 block text-[var(--c-ink-muted)]">Access expires</span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} min={toDateInput(new Date())} title="Defaults to the usual window for this folder type — change it if you want a different date" className={`${input} w-full`} />
        </label>
        <button onClick={submit} disabled={pending || !email.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />} Share
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${w.level === "danger" ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300" : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
          {hasDanger && (
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--c-ink)]">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I know who this is — share anyway.
            </label>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      {okMsg && <p className="mt-2 inline-flex items-center gap-1 text-xs text-green-600"><Check size={13} /> {okMsg}</p>}
    </div>
  );
}

function RecipientRowItem({ r }: { r: RecipientRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/share/${r.token}` : "";

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 ${r.revoked ? "opacity-55" : ""}`}>
      <Mail size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-medium text-[var(--c-ink)]">{r.email}</span>
          {r.name && <span className="text-xs text-[var(--c-ink-muted)]">{r.name}</span>}
          {r.kind && <span className="rounded-full border border-[var(--c-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-ink-muted)]">{kindLabel(r.kind)}</span>}
          {r.revoked && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">revoked</span>}
          {!r.revoked && r.expiresAt && new Date(r.expiresAt) < new Date() && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">expired</span>}
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--c-ink-muted)]">
          <span>Invited {fmtDate(r.invitedAt)} · {r.lastAccessAt ? `last opened ${fmtDate(r.lastAccessAt)}` : "not opened yet"} ·</span>
          <span className="inline-flex items-center gap-1">
            Access until
            <input
              type="date"
              value={isoToDateInput(r.expiresAt)}
              min={toDateInput(new Date())}
              disabled={pending}
              onChange={(e) => start(async () => { await setRecipientExpiry(r.id, e.target.value || null); router.refresh(); })}
              title="Change when this link stops working (leave blank for no expiry)"
              className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]"
            />
            {r.expiresAt && new Date(r.expiresAt) < new Date() && <span className="font-medium text-amber-600">(expired)</span>}
          </span>
        </p>
      </div>
      <select
        value={r.permission}
        onChange={(e) => start(async () => { await setRecipientPermission(r.id, e.target.value); router.refresh(); })}
        disabled={pending}
        title="Access level"
        className="shrink-0 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-[11px] disabled:opacity-50"
      >
        {SHARE_PERMISSIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <a href={`/share/${r.token}?admin=1`} target="_blank" rel="noopener noreferrer" title="Preview the folder exactly as this person sees it (no sign-in, not recorded)" className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
        <Eye size={14} />
      </a>
      <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copy the private link" className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
        {copied ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />}
      </button>
      {!r.revoked && (
        <button onClick={() => start(async () => { await resendInvite(r.id); })} disabled={pending} title="Resend the invite email" className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-50">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
        </button>
      )}
      <button
        onClick={() => start(async () => { await setRecipientRevoked(r.id, !r.revoked); router.refresh(); })}
        disabled={pending}
        title={r.revoked ? "Restore access" : "Revoke access"}
        className={`shrink-0 rounded p-1.5 disabled:opacity-50 ${r.revoked ? "text-[var(--c-ink-muted)] hover:text-emerald-600" : "text-[var(--c-ink-muted)] hover:text-red-600"}`}
      >
        {r.revoked ? <RotateCw size={14} /> : <Ban size={14} />}
      </button>
    </li>
  );
}
