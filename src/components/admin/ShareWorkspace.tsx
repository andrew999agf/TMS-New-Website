"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Loader2, Scale, StickyNote, ListChecks, UserPlus } from "lucide-react";
import { normalizeMeta, type ShareFolderMeta, type ShareTodo } from "@/lib/share/types";
import { updateFolderMeta } from "@/app/admin/(panel)/share-folders/actions";
import { recipientToggleTodo } from "@/app/share/[token]/actions";

export type Contact = { name: string; email: string };

/** Add-a-person input with autocomplete from everyone the system already knows. */
function AssigneeInput({ contacts, exclude, onAdd }: { contacts: Contact[]; exclude: string[]; onAdd: (name: string) => void }) {
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
  const add = (name: string) => { const n = name.trim(); if (n) onAdd(n); setQ(""); setOpen(false); };
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
            <button key={c.email || c.name} type="button" onClick={() => add(c.name)} className="flex w-full flex-col items-start px-2.5 py-1.5 text-left hover:bg-[var(--c-surface2)]">
              <span className="text-xs text-[var(--c-ink)]">{c.name}</span>
              {c.email && <span className="text-[10px] text-[var(--c-ink-muted)]">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.floor(Math.random() * 1e6)}`);

/* ------------------------------ admin editor ------------------------------ */

export function FolderWorkspaceEditor({ folderId, initial, contacts = [] }: { folderId: number; initial: ShareFolderMeta; contacts?: Contact[] }) {
  const [m, setM] = useState<ShareFolderMeta>(normalizeMeta(initial));
  const setTodo = (id: string, patch: Partial<ShareTodo>) => setM((c) => ({ ...c, todos: (c.todos ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const [causeDraft, setCauseDraft] = useState("");
  const [todoDraft, setTodoDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (patch: Partial<ShareFolderMeta>) => setM((c) => ({ ...c, ...patch }));

  function save() {
    setError(null);
    start(async () => {
      const res = await updateFolderMeta(folderId, m);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); } else setError(res.error ?? "Save failed.");
    });
  }

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
                <li key={i} className="flex items-center gap-2 text-sm"><span className="flex-1">{c}</span><button onClick={() => set({ causes: (m.causes ?? []).filter((_, j) => j !== i) })} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={14} /></button></li>
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
                    <span className="flex-1">{t.text}{t.doneBy && <span className="ml-2 text-xs text-green-600">✓ {t.doneBy} · {fmtDate(t.doneAt)}</span>}</span>
                    <button onClick={() => set({ todos: (m.todos ?? []).filter((x) => x.id !== t.id) })} title="Remove task" className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={14} /></button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--c-ink-muted)]"><UserPlus size={11} className="mr-0.5 inline" />To be done by:</span>
                    {(t.assignees ?? []).map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-2 py-0.5 text-[11px]">
                        {a}
                        <button onClick={() => setTodo(t.id, { assignees: (t.assignees ?? []).filter((x) => x !== a) })} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={11} /></button>
                      </span>
                    ))}
                    <AssigneeInput contacts={contacts} exclude={t.assignees ?? []} onAdd={(name) => setTodo(t.id, { assignees: [...(t.assignees ?? []), name] })} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={todoDraft} onChange={(e) => setTodoDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && todoDraft.trim()) { e.preventDefault(); set({ todos: [...(m.todos ?? []), { id: uid(), text: todoDraft.trim() } as ShareTodo] }); setTodoDraft(""); } }} placeholder="Add a task…" className="w-full max-w-sm rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
            <button onClick={() => { if (todoDraft.trim()) { set({ todos: [...(m.todos ?? []), { id: uid(), text: todoDraft.trim() } as ShareTodo] }); setTodoDraft(""); } }} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-sm hover:bg-[var(--c-surface2)]"><Plus size={14} /> Add</button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Recipients who can upload can check these off; the portal records their name and the date.</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}

/* ------------------------------ viewer display ------------------------------ */

export function FolderWorkspaceView({ token, meta, canCheck }: { token: string; meta: ShareFolderMeta; canCheck: boolean }) {
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
                  <span className={done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}>
                    {t.text}
                    {(t.assignees ?? []).length > 0 && <span className="ml-2 text-xs text-[var(--c-ink-muted)] no-underline">— {(t.assignees ?? []).join(", ")}</span>}
                    {done && <span className="ml-2 whitespace-nowrap text-xs text-green-600 no-underline">✓ {t.doneBy} · {fmtDate(t.doneAt)}</span>}
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
