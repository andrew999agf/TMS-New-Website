"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import {
  LayoutDashboard, MessageSquare, FolderOpen, Clock, Scale, FileText, Gavel, Search as SearchIcon,
  Plus, Loader2, Trash2, ExternalLink, Upload, Check, X, ListChecks, DollarSign, Send, FileSearch,
} from "lucide-react";
import {
  updatePortalMatter, addPortalTask, togglePortalTask, deletePortalTask,
  addPortalMessage, registerPortalDoc, deletePortalDoc,
} from "@/app/admin/(panel)/case-portal/actions";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { POSTURES, PARTY_ROLES } from "@/lib/portal";

export type MatterData = {
  id: number; groupId: number; groupName: string;
  title: string; clioMatter: string; posture: string; status: string; notes: string;
  companyId: number | null; companyName: string | null;
  exhibitSetId: number | null; exhibitSetName: string | null; shareFolderId: number | null;
};
export type TaskRow = { id: number; kind: "client" | "firm"; title: string; done: boolean };
export type MessageRow = { id: number; author: string; fromClient: boolean; body: string; createdAt: string };
export type DocRow = { id: number; tab: string; party: string; name: string; sizeBytes: number | null; exhibitDocId: number | null; createdAt: string };
export type TimeData = {
  monthHours: number; monthAmount: number; totalHours: number; totalAmount: number; monthLabel: string;
  entries: { id: number; date: string; description: string; user: string; hours: number; amount: number; nonBillable: boolean; archived: boolean }[];
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]";
const fmtUsd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Tab = "dashboard" | "correspondence" | "documents" | "pleadings" | "discovery" | "exhibits" | "time";

/**
 * One matter's workspace: dashboard (to-dos, this month's time value, links to
 * the firm's other tools), correspondence, client documents, the litigation
 * tabs (pleadings / discovery / exhibits — shown only for litigation posture),
 * and the running time tally read from the time tracker.
 */
export function CasePortalMatter({ matter, companies, tasks, messages, docs, time, clioMatters, shareFolders, blobReady, me }: {
  matter: MatterData;
  companies: { id: number; name: string }[];
  tasks: TaskRow[];
  messages: MessageRow[];
  docs: DocRow[];
  time: TimeData;
  clioMatters: MatterOption[];
  shareFolders: { id: number; name: string; caseNumber: string }[];
  blobReady: boolean;
  me: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // "Landed in the Exhibit Reviewer" notification after an exhibit upload.
  const [exhibitNotice, setExhibitNotice] = useState<{ setId: number } | null>(null);

  const litigation = matter.posture === "litigation";
  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "correspondence", label: "Correspondence", icon: MessageSquare },
    { id: "documents", label: "Client Documents", icon: FolderOpen },
    ...(litigation
      ? ([
          { id: "pleadings", label: "Pleadings", icon: Gavel },
          { id: "discovery", label: "Discovery", icon: SearchIcon },
          { id: "exhibits", label: "Exhibits", icon: Scale },
        ] as { id: Tab; label: string; icon: typeof LayoutDashboard }[])
      : []),
    { id: "time", label: "Time", icon: Clock },
  ];

  const patch = (p: Parameters<typeof updatePortalMatter>[1]) =>
    start(async () => { const r = await updatePortalMatter(matter.id, p); if (!r.ok) setError(r.error ?? "Couldn't save."); router.refresh(); });

  return (
    <div className="space-y-4">
      {/* Exhibit-reviewer handoff notice */}
      {exhibitNotice && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-600/40 bg-green-600/10 px-4 py-3 text-sm text-green-800">
          <Check size={16} className="shrink-0" />
          <span className="flex-1">A new exhibit was created in the <strong>Exhibit Reviewer</strong> under &ldquo;{matter.exhibitSetName ?? matter.title}&rdquo;.</span>
          <Link href={`/admin/exhibit-reviewer/${exhibitNotice.setId}`} className="inline-flex items-center gap-1.5 rounded-md border border-green-700/40 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-600/10">
            <FileSearch size={13} /> Review the exhibit
          </Link>
          <button onClick={() => setExhibitNotice(null)} className="rounded p-1 text-green-800/70 hover:text-green-800"><X size={14} /></button>
        </div>
      )}
      {error && (
        <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </p>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--c-border)] pb-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.id ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-ink)]"}`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
        <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold ${matter.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-[var(--c-surface-2)] text-[var(--c-ink-muted)]"}`}>
          {matter.status === "open" ? "Open" : "Closed"}
        </span>
      </div>

      {tab === "dashboard" && (
        <DashboardTab matter={matter} companies={companies} tasks={tasks} time={time} clioMatters={clioMatters} shareFolders={shareFolders} pending={pending} onPatch={patch} />
      )}
      {tab === "correspondence" && <CorrespondenceTab matterId={matter.id} messages={messages} me={me} />}
      {tab === "documents" && <DocsTab matterId={matter.id} tabKey="client" docs={docs} blobReady={blobReady} heading="Client documents" hint="Documents to and from the client — engagement papers, records they provide, drafts for their review." />}
      {tab === "pleadings" && <DocsTab matterId={matter.id} tabKey="pleading" docs={docs} blobReady={blobReady} heading="Pleadings" hint="Petitions, answers, motions, and orders." />}
      {tab === "discovery" && <DocsTab matterId={matter.id} tabKey="discovery" docs={docs} blobReady={blobReady} heading="Discovery" hint="Requests, responses, and productions." />}
      {tab === "exhibits" && (
        <DocsTab matterId={matter.id} tabKey="exhibit" docs={docs} blobReady={blobReady}
          heading="Exhibits" hint="Dropping a file here also creates it in the Exhibit Reviewer under this matter's set, organized by party."
          exhibit={{ setId: matter.exhibitSetId, setName: matter.exhibitSetName, onCreated: (setId) => setExhibitNotice({ setId }) }}
        />
      )}
      {tab === "time" && <TimeTab time={time} clioMatter={matter.clioMatter} />}
    </div>
  );
}

/* ------------------------------- dashboard ------------------------------- */

function DashboardTab({ matter, companies, tasks, time, clioMatters, shareFolders, pending, onPatch }: {
  matter: MatterData; companies: { id: number; name: string }[]; tasks: TaskRow[]; time: TimeData;
  clioMatters: MatterOption[]; shareFolders: { id: number; name: string; caseNumber: string }[];
  pending: boolean; onPatch: (p: Parameters<typeof updatePortalMatter>[1]) => void;
}) {
  const router = useRouter();
  const [clio, setClio] = useState(matter.clioMatter);
  const [notes, setNotes] = useState(matter.notes);
  const openClient = tasks.filter((t) => t.kind === "client" && !t.done).length;
  const openFirm = tasks.filter((t) => t.kind === "firm" && !t.done).length;

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between text-[var(--c-ink-muted)]"><DollarSign size={17} /></div>
          <div className="mt-2 font-[family-name:var(--font-display)] text-3xl">{fmtUsd(time.monthAmount)}</div>
          <div className="mt-1 text-sm text-[var(--c-ink-muted)]">Time value — {time.monthLabel} ({time.monthHours} hrs)</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between text-[var(--c-ink-muted)]"><Clock size={17} /></div>
          <div className="mt-2 font-[family-name:var(--font-display)] text-3xl">{fmtUsd(time.totalAmount)}</div>
          <div className="mt-1 text-sm text-[var(--c-ink-muted)]">All-time value ({time.totalHours} hrs)</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between text-[var(--c-ink-muted)]"><ListChecks size={17} /></div>
          <div className="mt-2 font-[family-name:var(--font-display)] text-3xl">{openClient + openFirm}</div>
          <div className="mt-1 text-sm text-[var(--c-ink-muted)]">Open to-dos ({openClient} client · {openFirm} firm)</div>
        </div>
      </div>

      {/* Matter settings + tool links */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${card} p-5`}>
          <h3 className="mb-3 font-[family-name:var(--font-ui)] text-sm font-semibold">Matter settings</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Posture</span>
              <select value={matter.posture} onChange={(e) => onPatch({ posture: e.target.value })} className={`${input} w-full`}>
                {POSTURES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Status</span>
              <select value={matter.status} onChange={(e) => onPatch({ status: e.target.value })} className={`${input} w-full`}>
                <option value="open">Open</option><option value="closed">Closed</option>
              </select>
            </label>
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Company</span>
              <select value={matter.companyId ?? ""} onChange={(e) => onPatch({ companyId: e.target.value ? Number(e.target.value) : null })} className={`${input} w-full`}>
                <option value="">— Group level —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Clio matter</span>
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1"><MatterCombobox matters={clioMatters} value={clio} onChange={setClio} placeholder="Search matter…" /></span>
                {clio !== matter.clioMatter && <button onClick={() => onPatch({ clioMatter: clio })} disabled={pending} className="rounded-md border border-[var(--c-accent)] px-2 py-1.5 text-xs text-[var(--c-accent)]">Save</button>}
              </div>
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
            Switching posture to <strong>Litigation</strong> adds the Pleadings, Discovery, and Exhibits tabs. The Clio matter number is what ties this portal to the Time Tracker&apos;s entries.
          </p>
        </section>

        <section className={`${card} p-5`}>
          <h3 className="mb-3 font-[family-name:var(--font-ui)] text-sm font-semibold">Connected tools</h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Scale size={15} className="shrink-0 text-[var(--c-accent)]" />
              <span className="min-w-0 flex-1 truncate">Exhibit Reviewer: {matter.exhibitSetName ? <strong>{matter.exhibitSetName}</strong> : <span className="text-[var(--c-ink-muted)]">created automatically on the first exhibit upload</span>}</span>
              {matter.exhibitSetId && matter.exhibitSetName && (
                <Link href={`/admin/exhibit-reviewer/${matter.exhibitSetId}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs hover:border-[var(--c-accent)]"><ExternalLink size={11} /> Open</Link>
              )}
            </div>
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="shrink-0 text-[var(--c-accent)]" />
              <span className="shrink-0">Share folder:</span>
              <select value={matter.shareFolderId ?? ""} onChange={(e) => onPatch({ shareFolderId: e.target.value ? Number(e.target.value) : null })} className={`${input} min-w-0 flex-1 !py-1 text-xs`}>
                <option value="">— none linked —</option>
                {shareFolders.map((f) => <option key={f.id} value={f.id}>{f.name}{f.caseNumber ? ` (${f.caseNumber})` : ""}</option>)}
              </select>
              {matter.shareFolderId && (
                <Link href={`/admin/share-folders/${matter.shareFolderId}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs hover:border-[var(--c-accent)]"><ExternalLink size={11} /> Open</Link>
              )}
            </div>
          </div>
          <h3 className="mb-1 mt-4 font-[family-name:var(--font-ui)] text-sm font-semibold">Notes</h3>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${input} w-full resize-y text-xs`} placeholder="Working notes for this matter…" />
          {notes !== matter.notes && <button onClick={() => onPatch({ notes })} className="mt-1.5 rounded-md border border-[var(--c-accent)] px-2.5 py-1 text-xs text-[var(--c-accent)]">Save notes</button>}
        </section>
      </div>

      {/* To-dos: client vs firm */}
      <div className="grid gap-5 lg:grid-cols-2">
        <TaskList matterId={matter.id} kind="client" heading="For the client to do" tasks={tasks.filter((t) => t.kind === "client")} onChanged={() => router.refresh()} />
        <TaskList matterId={matter.id} kind="firm" heading="Firm checklist" tasks={tasks.filter((t) => t.kind === "firm")} onChanged={() => router.refresh()} />
      </div>
    </div>
  );
}

function TaskList({ matterId, kind, heading, tasks, onChanged }: { matterId: number; kind: "client" | "firm"; heading: string; tasks: TaskRow[]; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const add = () => { const t = text.trim(); if (!t) return; start(async () => { await addPortalTask(matterId, kind, t); setText(""); onChanged(); }); };
  return (
    <section className={`${card} p-5`}>
      <h3 className="mb-3 font-[family-name:var(--font-ui)] text-sm font-semibold">{heading}</h3>
      <div className="mb-3 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Add an item…" className={`${input} flex-1`} />
        <button onClick={add} disabled={pending || !text.trim()} className="rounded-md border border-[var(--c-border)] p-2 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-40">{pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}</button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-xs text-[var(--c-ink-muted)]">Nothing yet.</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--c-surface-2)]">
              <input type="checkbox" checked={t.done} onChange={(e) => void togglePortalTask(t.id, e.target.checked).then(onChanged)} className="mt-0.5 h-4 w-4 accent-[var(--c-accent)]" />
              <span className={`min-w-0 flex-1 text-sm ${t.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{t.title}</span>
              <button onClick={() => void deletePortalTask(t.id).then(onChanged)} className="rounded p-0.5 text-[var(--c-ink-muted)] opacity-0 hover:text-red-600 group-hover:opacity-100"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------- correspondence ---------------------------- */

function CorrespondenceTab({ matterId, messages, me }: { matterId: number; messages: MessageRow[]; me: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const send = () => { const t = text.trim(); if (!t) return; start(async () => { await addPortalMessage(matterId, t); setText(""); router.refresh(); }); };
  return (
    <section className={`${card} flex min-h-[420px] flex-col`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-[var(--c-ink-muted)]">No correspondence yet. Notes here become the matter&apos;s communication record — and the client&apos;s side of the thread when their portal access ships.</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.fromClient ? "" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 ${msg.fromClient ? "border border-[var(--c-border)] bg-[var(--c-bg)]" : "bg-[var(--c-accent)] text-[var(--c-on-accent)]"}`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
              <p className={`mt-1 text-[10px] ${msg.fromClient ? "text-[var(--c-ink-muted)]" : "text-[var(--c-on-accent)]/70"}`}>{msg.author === me ? "You" : msg.author} · {fmtWhen(msg.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 border-t border-[var(--c-border)] p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a note on this matter…" className={`${input} flex-1 resize-y`} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
        <button onClick={send} disabled={pending || !text.trim()} className="btn btn-accent px-3 py-2 text-sm disabled:opacity-40">{pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>
      </div>
    </section>
  );
}

/* -------------------------------- documents ------------------------------ */

function DocsTab({ matterId, tabKey, docs, blobReady, heading, hint, exhibit }: {
  matterId: number; tabKey: "client" | "pleading" | "discovery" | "exhibit"; docs: DocRow[]; blobReady: boolean;
  heading: string; hint: string;
  exhibit?: { setId: number | null; setName: string | null; onCreated: (setId: number) => void };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [party, setParty] = useState<string>("plaintiff");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = docs.filter((d) => d.tab === tabKey);

  async function onFiles(list: FileList | null) {
    if (!list?.length || !blobReady) return;
    setError(null);
    for (const file of Array.from(list)) {
      setBusy(file.name);
      try {
        const blob = await upload(`case-portal/${matterId}/${tabKey}/${file.name}`, file, {
          access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: "case-portal", multipart: true,
        });
        const r = await registerPortalDoc(matterId, {
          tab: tabKey, party: tabKey === "exhibit" ? party : "", name: file.name,
          file: { url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size },
        });
        if (!r.ok) setError(r.error ?? `Couldn't save ${file.name}.`);
        else if (tabKey === "exhibit" && r.exhibitSetId) exhibit?.onCreated(r.exhibitSetId);
      } catch (e) {
        setError(`Couldn't upload ${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    router.refresh();
  }

  const partyLabel = (p: string) => PARTY_ROLES.find((r) => r.id === p)?.label ?? p;

  return (
    <section className={`${card} p-5`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-[family-name:var(--font-ui)] text-sm font-semibold">{heading} ({mine.length})</h3>
        <div className="ml-auto flex items-center gap-2">
          {tabKey === "exhibit" && (
            <label className="text-xs text-[var(--c-ink-muted)]">Party:{" "}
              <select value={party} onChange={(e) => setParty(e.target.value)} className={`${input} !py-1 text-xs`}>
                {PARTY_ROLES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={!blobReady || busy != null} className="btn btn-accent px-3 py-1.5 text-xs disabled:opacity-50">
            {busy ? <><Loader2 size={13} className="animate-spin" /> {busy}</> : <><Upload size={13} /> Add files</>}
          </button>
        </div>
      </div>
      <p className="mb-4 text-[11px] text-[var(--c-ink-muted)]">{hint}</p>
      {!blobReady && <p className="mb-3 text-xs text-amber-600">Connect a Blob store to enable uploads.</p>}
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />

      {mine.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--c-border)] p-6 text-center text-xs text-[var(--c-ink-muted)]">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--c-border)]">
          {mine.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <FileText size={15} className="shrink-0 text-[var(--c-accent)]" />
              <a href={`/admin/case-portal/file/${d.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-[var(--c-ink)] hover:text-[var(--c-accent)]">{d.name}</a>
              {tabKey === "exhibit" && d.party && <span className="shrink-0 rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--c-accent)]">{partyLabel(d.party)}</span>}
              {tabKey === "exhibit" && d.exhibitDocId && exhibit?.setId && (
                <Link href={`/admin/exhibit-reviewer/${exhibit.setId}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-0.5 text-[10px] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]" title="This exhibit lives in the Exhibit Reviewer too">
                  <Scale size={10} /> In Reviewer
                </Link>
              )}
              <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{fmtSize(d.sizeBytes)}</span>
              <span className="hidden shrink-0 text-[11px] text-[var(--c-ink-muted)] sm:block">{fmtWhen(d.createdAt)}</span>
              <button onClick={() => { if (confirm(`Delete ${d.name}?${d.exhibitDocId ? " (Its copy in the Exhibit Reviewer stays.)" : ""}`)) void deletePortalDoc(d.id).then(() => router.refresh()); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------- time --------------------------------- */

function TimeTab({ time, clioMatter }: { time: TimeData; clioMatter: string }) {
  if (!clioMatter) {
    return <p className={`${card} p-6 text-sm text-[var(--c-ink-muted)]`}>Link a Clio matter on the Dashboard tab and the Time Tracker&apos;s entries for that matter will appear here — a running record that survives the tracker&apos;s exports and archives.</p>;
  }
  return (
    <section className={`${card} p-5`}>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span><strong className="font-[family-name:var(--font-display)] text-xl">{fmtUsd(time.monthAmount)}</strong> <span className="text-[var(--c-ink-muted)]">this month ({time.monthHours} hrs)</span></span>
        <span><strong className="font-[family-name:var(--font-display)] text-xl">{fmtUsd(time.totalAmount)}</strong> <span className="text-[var(--c-ink-muted)]">all time ({time.totalHours} hrs)</span></span>
        <span className="ml-auto text-[11px] text-[var(--c-ink-muted)]">Matter {clioMatter} · read from the Time Tracker; archiving there never clears this.</span>
      </div>
      {time.entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--c-border)] p-6 text-center text-xs text-[var(--c-ink-muted)]">No time entries for this matter yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--c-border)] text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]">
                <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Activity</th><th className="py-2 pr-3">By</th>
                <th className="py-2 pr-3 text-right">Hrs</th><th className="py-2 pr-3 text-right">Value</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {time.entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--c-border)]/60">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{e.date}</td>
                  <td className="max-w-[380px] truncate py-2 pr-3" title={e.description}>{e.description || "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-[var(--c-ink-muted)]">{e.user}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.hours}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.nonBillable ? <span className="text-[var(--c-ink-muted)]">n/b</span> : fmtUsd(e.amount)}</td>
                  <td className="py-2 text-right">{e.archived && <span className="rounded bg-[var(--c-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--c-ink-muted)]">exported</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
