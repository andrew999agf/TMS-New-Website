"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Plus, X, Check, Loader2, Scale, StickyNote, ListChecks, UserPlus, Upload, FolderUp } from "lucide-react";
import { normalizeMeta, type ShareFolderMeta, type ShareTodo } from "@/lib/share/types";
import { updateFolderMeta, createDir, notifyAssignee } from "@/app/admin/(panel)/share-folders/actions";
import { recipientToggleTodo, recipientRegisterFile, recipientClearUpload } from "@/app/share/[token]/actions";
import { fromInput } from "@/lib/share/drop";

export type Contact = { name: string; email: string };

/** Add-a-person input with autocomplete from everyone the system already knows.
 *  Reports the picked/typed name plus the matching email (when we know one) so
 *  the caller can notify the assignee. */
function AssigneeInput({ contacts, exclude, onAdd }: { contacts: Contact[]; exclude: string[]; onAdd: (name: string, email?: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function d(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d); }, []);
  const suggestions = useMemo(() => {
    if (!open) return [];
    const needle = q.trim().toLowerCase();
    const taken = new Set(exclude.map((x) => x.toLowerCase()));
    const seen = new Set<string>();
    return contacts
      .filter((c) => c.name && !taken.has(c.name.toLowerCase()) && (!needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle)))
      .filter((c) => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6);
  }, [contacts, q, open, exclude]);
  const add = (name: string, email?: string) => {
    const n = name.trim();
    if (!n) return;
    // If typed freehand, try to recover an email from the contact book by name.
    const em = email ?? contacts.find((c) => c.name.toLowerCase() === n.toLowerCase())?.email;
    onAdd(n, em || undefined);
    setQ("");
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); add(q); } }}
        placeholder="Add person…"
        className="w-36 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--c-accent)]"
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-md border border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
          {suggestions.map((c) => (
            <button key={c.email || c.name} type="button" onClick={() => add(c.name, c.email)} className="flex w-full flex-col items-start px-2.5 py-1.5 text-left hover:bg-[var(--c-surface2)]">
              <span className="text-xs text-[var(--c-ink)]">{c.name}</span>
              {c.email && <span className="text-[10px] text-[var(--c-ink-muted)]">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Today's date as "YYYY.MM.DD" for the default upload-folder name. */
function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.floor(Math.random() * 1e6)}`);

/* ------------------------------ admin editor ------------------------------ */

export function FolderWorkspaceEditor({ folderId, initial, contacts = [] }: { folderId: number; initial: ShareFolderMeta; contacts?: Contact[] }) {
  const router = useRouter();
  const [m, setM] = useState<ShareFolderMeta>(normalizeMeta(initial));
  const setTodo = (id: string, patch: Partial<ShareTodo>) => setM((c) => ({ ...c, todos: (c.todos ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const [causeDraft, setCauseDraft] = useState("");
  const [todoDraft, setTodoDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);

  const set = (patch: Partial<ShareFolderMeta>) => setM((c) => ({ ...c, ...patch }));

  // Add an assignee to a task and, when we have their email, notify them.
  function addAssignee(t: ShareTodo, name: string, email?: string) {
    setTodo(t.id, { assignees: [...(t.assignees ?? []), name] });
    if (email) {
      notifyAssignee(folderId, t.text, email, name)
        .then((r) => setNote(r.ok ? `Notified ${name}.` : `Added ${name}, but couldn't email them.`))
        .catch(() => setNote(`Added ${name}, but couldn't email them.`))
        .finally(() => setTimeout(() => setNote(null), 3000));
    } else {
      setNote(`Added ${name}. (No email on file — not notified.)`);
      setTimeout(() => setNote(null), 3000);
    }
  }

  // Attach a dated upload folder to a task. The folder is created in the file
  // list below so documents added for the task land there.
  async function attachUploadDir(t: ShareTodo) {
    const suggested = `${todayStamp()} - `;
    const name = (window.prompt("Name the folder where documents for this task will go:", suggested) || "").trim();
    if (!name) return;
    setTodo(t.id, { uploadDir: name });
    const res = await createDir(folderId, name);
    if (res.ok) { router.refresh(); setNote(`Upload folder "${name}" added below.`); }
    else setNote(res.error ?? "Couldn't create the folder.");
    setTimeout(() => setNote(null), 3000);
  }

  // Auto-save every change (add / edit / delete / toggle) to the folder — no Save
  // button to forget. Debounced so typing doesn't fire on every keystroke.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        const res = await updateFolderMeta(folderId, m);
        setStatus(res.ok ? "saved" : "error");
        if (res.ok) setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [m, folderId]);

  const cbClass = "flex items-center gap-2 text-sm font-medium";
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <p className="mb-1 text-sm font-semibold">Folder info &amp; tasks</p>
      <p className="mb-3 text-xs text-[var(--c-ink-muted)]">Turn on only what you need — each section appears in the recipient&apos;s portal only when it&apos;s on and has content.</p>

      {/* Causes of action */}
      <label className={cbClass}><input type="checkbox" checked={!!m.causesEnabled} onChange={(e) => set({ causesEnabled: e.target.checked })} /><Scale size={14} className="text-[var(--c-accent)]" /> Causes of action</label>
      {m.causesEnabled && (
        <div className="mb-3 mt-2 pl-6">
          {(m.causes ?? []).length > 0 && (
            <ul className="mb-2 space-y-1">
              {(m.causes ?? []).map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <input value={c} onChange={(e) => set({ causes: (m.causes ?? []).map((x, j) => (j === i ? e.target.value : x)) })} className="flex-1 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-sm" />
                  <button onClick={() => set({ causes: (m.causes ?? []).filter((_, j) => j !== i) })} title="Delete" className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={causeDraft} onChange={(e) => setCauseDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && causeDraft.trim()) { e.preventDefault(); set({ causes: [...(m.causes ?? []), causeDraft.trim()] }); setCauseDraft(""); } }} placeholder="Add a cause of action…" className="w-full max-w-sm rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
            <button onClick={() => { if (causeDraft.trim()) { set({ causes: [...(m.causes ?? []), causeDraft.trim()] }); setCauseDraft(""); } }} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-sm hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add</button>
          </div>
        </div>
      )}

      {/* Notes */}
      <label className={`${cbClass} mt-3`}><input type="checkbox" checked={!!m.notesEnabled} onChange={(e) => set({ notesEnabled: e.target.checked })} /><StickyNote size={14} className="text-[var(--c-accent)]" /> Notes</label>
      {m.notesEnabled && (
        <div className="mb-3 mt-2 pl-6">
          <textarea value={m.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} rows={3} placeholder="Notes for the recipient…" className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
        </div>
      )}

      {/* To-do tasks */}
      <label className={`${cbClass} mt-3`}><input type="checkbox" checked={!!m.todosEnabled} onChange={(e) => set({ todosEnabled: e.target.checked })} /><ListChecks size={14} className="text-[var(--c-accent)]" /> To-do tasks</label>
      {m.todosEnabled && (
        <div className="mb-3 mt-2 pl-6">
          {(m.todos ?? []).length > 0 && (
            <ul className="mb-2 space-y-1">
              {(m.todos ?? []).map((t) => (
                <li key={t.id} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
                  <div className="flex items-center gap-2 text-sm">
                    <input value={t.text} onChange={(e) => setTodo(t.id, { text: e.target.value })} className="flex-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm" />
                    {t.doneBy && <span className="whitespace-nowrap text-xs text-green-600">✓ {t.doneBy} · {fmtDate(t.doneAt)}</span>}
                    {t.uploadDir ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--c-accent)] bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] text-[var(--c-accent)]" title="Documents added for this task go to this folder below">
                        <FolderUp size={11} /> {t.uploadDir}
                        <button onClick={() => setTodo(t.id, { uploadDir: undefined })} title="Remove upload link (keeps the folder)" className="hover:text-[var(--c-error)]"><X size={11} /></button>
                      </span>
                    ) : (
                      <button onClick={() => attachUploadDir(t)} title="Create a folder below for documents produced by this task" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--c-border)] px-2 py-0.5 text-[11px] text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"><FolderUp size={11} /> Include upload link</button>
                    )}
                    <button onClick={() => set({ todos: (m.todos ?? []).filter((x) => x.id !== t.id) })} title="Delete task" className="shrink-0 text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={14} /></button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--c-ink-muted)]"><UserPlus size={11} className="mr-0.5 inline" />To be done by:</span>
                    {(t.assignees ?? []).map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-2 py-0.5 text-[11px]">
                        {a}
                        <button onClick={() => setTodo(t.id, { assignees: (t.assignees ?? []).filter((x) => x !== a) })} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={11} /></button>
                      </span>
                    ))}
                    <AssigneeInput contacts={contacts} exclude={t.assignees ?? []} onAdd={(name, email) => addAssignee(t, name, email)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={todoDraft} onChange={(e) => setTodoDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && todoDraft.trim()) { e.preventDefault(); set({ todos: [...(m.todos ?? []), { id: uid(), text: todoDraft.trim() } as ShareTodo] }); setTodoDraft(""); } }} placeholder="Add a task…" className="w-full max-w-sm rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
            <button onClick={() => { if (todoDraft.trim()) { set({ todos: [...(m.todos ?? []), { id: uid(), text: todoDraft.trim() } as ShareTodo] }); setTodoDraft(""); } }} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-sm hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add</button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Recipients who can upload can check these off; the portal records their name and the date. Use <span className="whitespace-nowrap"><FolderUp size={10} className="inline" /> Include upload link</span> to add a dated folder for documents the task produces — assignees with an email on file are notified automatically.</p>
        </div>
      )}

      <div className="mt-3 min-h-4 text-xs">
        {note && <span className="text-[var(--c-accent)]">{note}</span>}
        {!note && status === "saving" && <span className="inline-flex items-center gap-1 text-[var(--c-ink-muted)]"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
        {!note && status === "saved" && <span className="inline-flex items-center gap-1 text-green-600"><Check size={12} /> Saved</span>}
        {!note && status === "error" && <span className="text-[var(--c-error)]">Couldn&apos;t save — check your connection.</span>}
      </div>
    </div>
  );
}

/* ------------------------------ viewer display ------------------------------ */

/** Upload control shown on a task that has an upload folder attached — files
 *  land in that folder in the document list below. */
function TaskUploader({ token, dir, blobReady }: { token: string; dir: string; blobReady: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(files: FileList | null) {
    const picked = fromInput(files);
    if (picked.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      for (let i = 0; i < picked.length; i++) {
        const { file, path } = picked[i];
        const base = (path.split("/").pop() as string) || "file";
        setMsg(`Uploading ${i + 1} / ${picked.length}`);
        const blob = await upload(`share-recipient/${dir}/${base}`, file, { access: "public", handleUploadUrl: `/api/share/${token}/upload` });
        const res = await recipientRegisterFile(token, { url: blob.url, pathname: blob.pathname, filename: base, dir, contentType: file.type || blob.contentType, size: file.size }, { total: picked.length, done: i + 1 });
        if (!res.ok) throw new Error(res.error ?? "Upload failed.");
      }
      setMsg("Uploaded.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      recipientClearUpload(token).catch(() => {});
      if (input.current) input.current.value = "";
      setTimeout(() => setMsg(null), 2500);
    }
  }

  if (!blobReady) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-accent)] px-2 py-0.5 text-[11px] text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-50">
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload
      </button>
      {msg && <span className="text-[11px] text-[var(--c-ink-muted)]">{msg}</span>}
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => run(e.target.files)} />
    </span>
  );
}

export function FolderWorkspaceView({ token, meta, canCheck, blobReady = false }: { token: string; meta: ShareFolderMeta; canCheck: boolean; blobReady?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const m = normalizeMeta(meta);
  const showCauses = m.causesEnabled && (m.causes ?? []).length > 0;
  const showNotes = m.notesEnabled && (m.notes ?? "").trim().length > 0;
  const showTodos = m.todosEnabled && (m.todos ?? []).length > 0;
  if (!showCauses && !showNotes && !showTodos) return null;

  function toggle(t: ShareTodo, done: boolean) {
    let who = "";
    if (done) {
      who = (window.prompt("Enter your name or initials to mark this done:") || "").trim();
      if (!who) return;
    }
    start(async () => { await recipientToggleTodo(token, t.id, done, who); router.refresh(); });
  }

  const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4";
  return (
    <div className="mt-5 space-y-3">
      {showCauses && (
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]"><Scale size={14} className="text-[var(--c-accent)]" /> Causes of Action</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--c-ink)]">{(m.causes ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {showNotes && (
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]"><StickyNote size={14} className="text-[var(--c-accent)]" /> Notes</p>
          <p className="whitespace-pre-wrap text-sm text-[var(--c-ink)]">{m.notes}</p>
        </div>
      )}
      {showTodos && (
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]"><ListChecks size={14} className="text-[var(--c-accent)]" /> Tasks</p>
          <ul className="space-y-1.5">
            {(m.todos ?? []).map((t) => {
              const done = !!t.doneBy;
              return (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={done} disabled={!canCheck || pending} onChange={(e) => toggle(t, e.target.checked)} className="mt-0.5" />
                  <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}>
                      {t.text}
                      {(t.assignees ?? []).length > 0 && <span className="ml-2 text-xs text-[var(--c-ink-muted)] no-underline">— {(t.assignees ?? []).join(", ")}</span>}
                      {done && <span className="ml-2 whitespace-nowrap text-xs text-green-600 no-underline">✓ {t.doneBy} · {fmtDate(t.doneAt)}</span>}
                    </span>
                    {t.uploadDir && canCheck && <TaskUploader token={token} dir={t.uploadDir} blobReady={blobReady} />}
                  </span>
                </li>
              );
            })}
          </ul>
          {!canCheck && <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Ask {`the firm`} if you need to mark tasks complete.</p>}
        </div>
      )}
    </div>
  );
}
