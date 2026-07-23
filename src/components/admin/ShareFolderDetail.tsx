"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  Upload, Trash2, Loader2, Mail, Send, RotateCw, Ban, Check,
  Archive, ArchiveRestore, Pencil, AlertTriangle, Link2,
} from "lucide-react";
import { SHARE_TYPES, shareType, audienceStyle, recipientWarnings, classifyEmail } from "@/lib/share/types";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { ShareFileTree } from "./ShareFileTree";
import {
  registerShareFile, deleteFile, addRecipient, resendInvite, setRecipientRevoked,
  archiveFolder, deleteFolder, updateFolder,
} from "@/app/admin/(panel)/share-folders/actions";

export type FolderData = { id: number; caseNumber: string; name: string; matter: string; court: string; type: string; notes: string; archived: boolean };
export type FileRow = { id: number; url: string; filename: string; contentType: string | null; sizeBytes: number | null; createdAt: string };
export type RecipientRow = { id: number; email: string; name: string; token: string; invitedAt: string; lastAccessAt: string | null; expiresAt: string | null; revoked: boolean };

const FIRM_DOMAIN = "texaslawsmith.com";
const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export function ShareFolderDetail({ folder, files, recipients, matters, blobReady }: { folder: FolderData; files: FileRow[]; recipients: RecipientRow[]; matters: MatterOption[]; blobReady: boolean }) {
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

      <FilesSection folderId={folder.id} files={files} blobReady={blobReady} />

      <RecipientsSection folderId={folder.id} typeKey={folder.type} recipients={recipients} />
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

type PickedFile = { file: File; path: string };
const isJunk = (name: string) => name === ".DS_Store" || name === "Thumbs.db" || name.startsWith("._");

/** Read every File out of a dropped item list, walking into folders (and their
 *  subfolders) via the webkitGetAsEntry API. Entries must be captured
 *  synchronously during the drop, so we grab them before any await. */
async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const roots: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  if (roots.length === 0) {
    // Browser without the entry API — fall back to the flat file list.
    return Array.from(dt.files).filter((f) => !isJunk(f.name)).map((f) => ({ file: f, path: f.name }));
  }
  const out: PickedFile[] = [];
  const readDir = (reader: FileSystemDirectoryReader) =>
    new Promise<FileSystemEntry[]>((resolve, reject) => {
      const acc: FileSystemEntry[] = [];
      const step = () => reader.readEntries((batch) => { if (!batch.length) return resolve(acc); acc.push(...batch); step(); }, reject);
      step();
    });
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      if (!isJunk(file.name)) out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      const children = await readDir((entry as FileSystemDirectoryEntry).createReader());
      for (const child of children) await walk(child, `${prefix}${entry.name}/`);
    }
  }
  for (const r of roots) await walk(r, "");
  return out;
}

function FilesSection({ folderId, files, blobReady }: { folderId: number; files: FileRow[]; blobReady: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function handleDelete(id: number) {
    if (!confirm("Remove this file?")) return;
    setDeletingId(id);
    deleteFile(id).then(() => { setDeletingId(null); router.refresh(); }).catch(() => setDeletingId(null));
  }

  // React has no typed prop for directory selection — set the attributes directly.
  useEffect(() => {
    const el = folderInput.current;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
  }, []);

  async function uploadAll(picked: PickedFile[]) {
    const items = picked.filter((p) => !isJunk(p.file.name));
    if (items.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (let i = 0; i < items.length; i++) {
        const { file, path } = items[i];
        setProgress(`Uploading ${i + 1} of ${items.length}: ${path}`);
        const blob = await upload(`share/${folderId}/${path}`, file, {
          access: "public",
          handleUploadUrl: "/api/admin/share-upload",
          clientPayload: String(folderId),
        });
        await registerShareFile(folderId, { url: blob.url, pathname: blob.pathname, filename: path, contentType: file.type || blob.contentType, size: file.size });
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

  function fromInput(list: FileList | null): PickedFile[] {
    return Array.from(list ?? []).map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (!blobReady || busy) return;
    const picked = await filesFromDrop(e.dataTransfer);
    await uploadAll(picked);
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-[var(--c-ink)]">Documents ({files.length})</h3>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"} ${!blobReady ? "opacity-60" : ""}`}
      >
        <Upload size={22} className="mx-auto mb-1.5 text-[var(--c-ink-muted)]" />
        <p className="text-sm text-[var(--c-ink-muted)]">Drag files or whole folders here, or{" "}
          <button onClick={() => fileInput.current?.click()} disabled={!blobReady || busy} className="font-medium text-[var(--c-accent)] disabled:opacity-50">browse files</button>
          {" "}·{" "}
          <button onClick={() => folderInput.current?.click()} disabled={!blobReady || busy} className="font-medium text-[var(--c-accent)] disabled:opacity-50">choose a folder</button>.
        </p>
        <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Folders keep their structure (e.g. subfolder/file.pdf).</p>
        {!blobReady && <p className="mt-1 text-xs text-amber-600">Connect a Blob store to enable uploads.</p>}
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => uploadAll(fromInput(e.target.files))} />
        <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => uploadAll(fromInput(e.target.files))} />
        {progress && <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><Loader2 size={13} className="animate-spin" /> {progress}</p>}
        {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      </div>

      {files.length > 0 && (
        <div className="mt-3">
          <ShareFileTree
            files={files.map((f) => ({ id: f.id, path: f.filename, sizeBytes: f.sizeBytes, url: f.url }))}
            mode="admin"
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        </div>
      )}
    </section>
  );
}

/* ------------------------------- recipients ------------------------------- */

function RecipientsSection({ folderId, typeKey, recipients }: { folderId: number; typeKey: string; recipients: RecipientRow[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-[var(--c-ink)]">Shared with ({recipients.filter((r) => !r.revoked).length})</h3>
      <AddRecipient folderId={folderId} typeKey={typeKey} />
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

function AddRecipient({ folderId, typeKey }: { folderId: number; typeKey: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
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
      const res = await addRecipient(folderId, email, name, hasDanger ? ack : true);
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
          <input value={email} onChange={(e) => { setEmail(e.target.value); setAck(false); }} placeholder="name@example.com" className={`${input} w-full`} />
        </label>
        <label className="text-xs flex-1 min-w-[10rem]"><span className="mb-1 block text-[var(--c-ink-muted)]">Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className={`${input} w-full`} />
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
          {r.revoked && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">revoked</span>}
          {!r.revoked && r.expiresAt && new Date(r.expiresAt) < new Date() && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">expired</span>}
        </div>
        <p className="text-[11px] text-[var(--c-ink-muted)]">
          Invited {fmtDate(r.invitedAt)} · {r.lastAccessAt ? `last opened ${fmtDate(r.lastAccessAt)}` : "not opened yet"}
          {r.expiresAt && ` · ${new Date(r.expiresAt) < new Date() ? "expired" : `expires ${fmtDate(r.expiresAt)}`}`}
        </p>
      </div>
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
