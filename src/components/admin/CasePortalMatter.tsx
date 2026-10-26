"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import {
  LayoutDashboard, MessageSquare, FolderOpen, Clock, Scale, FileText, Gavel, Search as SearchIcon,
  Plus, Loader2, Trash2, ExternalLink, Upload, Check, X, ListChecks, DollarSign, Send, FileSearch, Mail, ClipboardList, BellRing, CalendarDays, Users, UserPlus, UserMinus,
} from "lucide-react";
import {
  updatePortalMatter, addPortalTask, togglePortalTask, deletePortalTask,
  addPortalMessage, registerPortalDoc, deletePortalDoc, notifyClientOfUpdate,
  addPortalRequest, updatePortalRequest, deletePortalRequest, sendRequestReminder, addMatterViewer, removeMatterViewer,
} from "@/app/admin/(panel)/case-portal/actions";
import { REQUEST_STATUSES, requestStatus, requestOverdue } from "@/lib/portal";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { useCaseLookup } from "./useCaseLookup";
import { POSTURES, PARTY_ROLES } from "@/lib/portal";

export type MatterData = {
  id: number; groupId: number; groupName: string;
  title: string; clioMatter: string; posture: string; status: string; notes: string; driveFolder: string;
  companyId: number | null; companyName: string | null;
  /** "Michael Manuel — personal" / entity name, for the header. */
  ownerLabel: string;
  exhibitSetId: number | null; exhibitSetName: string | null; shareFolderId: number | null;
};
export type RequestRow = { id: number; title: string; details: string; dueOn: string; status: string; firmNote: string; respondedAt: string | null; remindedAt: string | null; files: { id: number; name: string }[] };
export type TaskRow = { id: number; kind: "client" | "firm"; title: string; done: boolean };
/** Everyone on the file, flagged with whether they have been added to THIS matter. */
export type ViewerRow = { id: number; email: string; name: string; revoked: boolean; added: boolean; lastAccessAt: string | null };
export type MessageRow = { id: number; author: string; fromClient: boolean; body: string; createdAt: string; unread?: boolean };
export type DocRow = { id: number; tab: string; party: string; name: string; sizeBytes: number | null; exhibitDocId: number | null; createdAt: string; requestId?: number | null };
export type TimeData = {
  monthHours: number; monthAmount: number; totalHours: number; totalAmount: number; monthLabel: string;
  entries: { id: number; date: string; description: string; user: string; hours: number; amount: number; nonBillable: boolean; archived: boolean }[];
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]";
const fmtUsd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Tab = "dashboard" | "requests" | "correspondence" | "documents" | "pleadings" | "discovery" | "exhibits" | "time";

/**
 * One matter's workspace: dashboard (to-dos, this month's time value, links to
 * the firm's other tools), correspondence, client documents, the litigation
 * tabs (pleadings / discovery / exhibits — shown only for litigation posture),
 * and the running time tally read from the time tracker.
 */
export function CasePortalMatter({ matter, companies, tasks, messages, docs, requests = [], viewers = [], time, clioMatters, shareFolders, blobReady, me }: {
  matter: MatterData;
  companies: { id: number; name: string }[];
  tasks: TaskRow[];
  messages: MessageRow[];
  docs: DocRow[];
  requests?: RequestRow[];
  viewers?: ViewerRow[];
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
  const activeViewers = viewers.filter((v) => v.added && !v.revoked).length;
  const openReq = requests.filter((r) => r.status === "open").length;
  const unread = messages.filter((m) => m.fromClient && m.unread).length;
  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard; badge?: number; alert?: boolean }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "requests", label: "Documents requested", icon: ClipboardList, badge: openReq, alert: requests.some(requestOverdue) },
    { id: "correspondence", label: "Correspondence", icon: MessageSquare, badge: unread },
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
      {matter.status === "open" && activeViewers === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900" data-testid="no-viewers">
          <Users size={16} className="shrink-0" />
          <span className="flex-1">Nobody has been added to this matter yet, so <strong>no client can see it</strong>. Add the people who should have it below.</span>
          {tab !== "dashboard" && <button onClick={() => setTab("dashboard")} className="rounded-md border border-amber-700/40 px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-500/10">Add people</button>}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--c-border)] pb-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.id ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-ink)]"}`} data-testid={`tab-${t.id}`}>
              <Icon size={13} /> {t.label}
              {t.badge ? <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${tab === t.id ? "bg-white/25 text-white" : t.alert ? "bg-red-600 text-white" : "bg-[var(--c-accent)] text-white"}`}>{t.badge}</span> : null}
            </button>
          );
        })}
        <span className="ml-auto hidden text-[11px] text-[var(--c-ink-muted)] md:inline">{matter.ownerLabel}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--c-surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--c-ink-muted)]" title="People added to this matter" data-testid="viewer-count"><Users size={11} /> {activeViewers}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${matter.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-[var(--c-surface-2)] text-[var(--c-ink-muted)]"}`}>
          {matter.status === "open" ? "Open" : "Closed"}
        </span>
      </div>

      {tab === "dashboard" && (
        <DashboardTab matter={matter} companies={companies} tasks={tasks} viewers={viewers} time={time} clioMatters={clioMatters} shareFolders={shareFolders} pending={pending} onPatch={patch} />
      )}
      {tab === "requests" && <RequestsTab matterId={matter.id} requests={requests} />}
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

function DashboardTab({ matter, companies, tasks, viewers, time, clioMatters, shareFolders, pending, onPatch }: {
  matter: MatterData; companies: { id: number; name: string }[]; tasks: TaskRow[]; viewers: ViewerRow[]; time: TimeData;
  clioMatters: MatterOption[]; shareFolders: { id: number; name: string; caseNumber: string }[];
  pending: boolean; onPatch: (p: Parameters<typeof updatePortalMatter>[1]) => void;
}) {
  const router = useRouter();
  const [clio, setClio] = useState(matter.clioMatter);
  useCaseLookup(clio, (c) => { if (c.matter && c.matter !== clio) setClio(c.matter); });
  const [notes, setNotes] = useState(matter.notes);
  const [drive, setDrive] = useState(matter.driveFolder);
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
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Clio matter (Client ID)</span>
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1"><MatterCombobox matters={clioMatters} value={clio} onChange={setClio} placeholder="Search matter…" /></span>
                {clio !== matter.clioMatter && <button onClick={() => onPatch({ clioMatter: clio })} disabled={pending} className="rounded-md border border-[var(--c-accent)] px-2 py-1.5 text-xs text-[var(--c-accent)]">Save</button>}
              </div>
            </label>
            <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">Working folder (Drive / office server)</span>
              <div className="flex items-center gap-1.5">
                <input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="e.g., 2026-Lit (096-368163-25)" className={`${input} min-w-0 flex-1`} />
                {drive !== matter.driveFolder && <button onClick={() => onPatch({ driveFolder: drive })} disabled={pending} className="rounded-md border border-[var(--c-accent)] px-2 py-1.5 text-xs text-[var(--c-accent)]">Save</button>}
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

      {/* Who on the file can see this matter */}
      <ViewersPanel matterId={matter.id} viewers={viewers} groupId={matter.groupId} />

      {/* To-dos: client vs firm */}
      <div className="grid gap-5 lg:grid-cols-2">
        <TaskList matterId={matter.id} kind="client" heading="For the client to do" tasks={tasks.filter((t) => t.kind === "client")} onChanged={() => router.refresh()} />
        <TaskList matterId={matter.id} kind="firm" heading="Firm checklist" tasks={tasks.filter((t) => t.kind === "firm")} onChanged={() => router.refresh()} />
      </div>
    </div>
  );
}

/**
 * Per-matter access. A matter starts with nobody; the firm adds the parent,
 * the entity's contact, a bookkeeper — whoever should have this one. Existing
 * people on the file are a dropdown; a new email becomes a member with access
 * to this matter only.
 */
function ViewersPanel({ matterId, viewers, groupId }: { matterId: number; viewers: ViewerRow[]; groupId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const added = viewers.filter((v) => v.added);
  const available = viewers.filter((v) => !v.added && !v.revoked);
  const newPerson = pick === "new" || (available.length === 0 && pick === "");
  const canAdd = newPerson ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) : pick !== "";
  function add() {
    setMsg(null); setError(null);
    start(async () => {
      const r = newPerson ? await addMatterViewer(matterId, { email, name, notify }) : await addMatterViewer(matterId, { memberId: Number(pick), notify });
      if (!r.ok) { setError(r.error ?? "Couldn't add them."); return; }
      setMsg(r.already ? `${r.email} already had this matter.` : r.sent ? `${r.email} added${r.isNew ? " and invited" : ""} — emailed a link to this matter.` : `${r.email} added to this matter${notify ? ", but the email couldn't be sent" : ""}.`);
      setPick(""); setEmail(""); setName(""); router.refresh();
    });
  }
  return (
    <section className={`${card} p-5`} data-testid="viewers">
      <div className="mb-1 flex items-center gap-2">
        <Users size={15} className="text-[var(--c-accent)]" />
        <h3 className="font-[family-name:var(--font-ui)] text-sm font-semibold">Who can see this matter</h3>
        <span className="text-[11px] text-[var(--c-ink-muted)]">{added.length === 0 ? "nobody yet" : `${added.length} ${added.length === 1 ? "person" : "people"}`}</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
        Access is per matter. People on this file see only the matters they have been added to — add them here each time a new matter is set up. Manage everyone on the file from the <Link href={`/admin/case-portal/${groupId}`} className="underline hover:text-[var(--c-accent)]">file page</Link>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {available.length > 0 && (
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${input} min-w-[220px]`} data-testid="viewer-pick">
            <option value="">Choose someone on this file…</option>
            {available.map((v) => <option key={v.id} value={v.id}>{v.name ? `${v.name} — ${v.email}` : v.email}</option>)}
            <option value="new">+ Someone new (by email)</option>
          </select>
        )}
        {newPerson && (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${input} w-36`} data-testid="viewer-name" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canAdd) add(); }} placeholder="email@company.com" className={`${input} min-w-[200px] flex-1`} data-testid="viewer-email" />
          </>
        )}
        <button onClick={add} disabled={pending || !canAdd} className="btn btn-accent text-sm disabled:opacity-50" data-testid="viewer-add">{pending ? <Loader2 size={15} className="animate-spin" /> : <><UserPlus size={14} /> Add to this matter</>}</button>
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-[var(--c-ink-muted)]">
        <input type="checkbox" className="accent-[var(--c-accent)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email them a link to this matter
      </label>
      {msg && <p className="mt-2 text-xs text-green-700">{msg}</p>}
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      {added.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">
          {added.map((v) => (
            <li key={v.id} className={`flex flex-wrap items-center gap-2 py-2 ${v.revoked ? "opacity-60" : ""}`} data-testid={`viewer-${v.id}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--c-ink)]">{v.name ? `${v.name} — ` : ""}{v.email}</span>
                <span className="block text-[11px] text-[var(--c-ink-muted)]">{v.revoked ? "Portal access revoked on the file page" : v.lastAccessAt ? `Last visit ${fmtWhen(v.lastAccessAt)}` : "Hasn't signed in yet"}</span>
              </span>
              <button onClick={() => { if (confirm(`Remove ${v.email} from this matter? They keep any other matters they were added to.`)) start(async () => { await removeMatterViewer(matterId, v.id); router.refresh(); }); }} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:border-red-500 hover:text-red-600"><UserMinus size={11} className="mr-1 inline" />Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
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

/** After the firm posts something client-visible, offer to email the client a
 *  link to review it. Only fires on the client-facing surfaces. */
function AskEmailClientDialog({ matterId, kind, count, onClose }: { matterId: number; kind: "docs" | "message"; count: number; onClose: () => void }) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const what = kind === "docs" ? `${count} document${count === 1 ? " was" : "s were"} added to Client documents` : "Your message was posted";
  function sendIt() {
    start(async () => {
      const r = await notifyClientOfUpdate(matterId, kind);
      setResult(r.ok ? (r.sent ? `Emailed ${r.sent} portal member${r.sent === 1 ? "" : "s"} with a link to review.` : "Nobody has been added to this matter yet — add them on the Dashboard tab first.") : ("error" in r && r.error ? r.error : "Couldn't send."));
    });
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-lg bg-[var(--c-surface)] p-6 shadow-2xl">
        <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg"><Mail size={17} className="text-[var(--c-accent)]" /> Email the client?</h3>
        {result ? (
          <>
            <p className="mt-3 text-sm text-[var(--c-ink-muted)]">{result}</p>
            <div className="mt-5 flex justify-end"><button onClick={onClose} className="btn btn-accent px-4 py-2 text-sm">Done</button></div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-[var(--c-ink-muted)]">{what}. Send every active portal member an email with a button to review it in their portal?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} disabled={pending} className="btn btn-outline px-4 py-2 text-sm">No</button>
              <button onClick={sendIt} disabled={pending} className="btn btn-accent px-4 py-2 text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Yes, email them</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CorrespondenceTab({ matterId, messages, me }: { matterId: number; messages: MessageRow[]; me: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  const [pending, start] = useTransition();
  const send = () => { const t = text.trim(); if (!t) return; start(async () => { await addPortalMessage(matterId, t); setText(""); router.refresh(); setAskEmail(true); }); };
  return (
    <section className={`${card} flex min-h-[420px] flex-col`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-[var(--c-ink-muted)]">No correspondence yet. Notes here become the matter&apos;s communication record — and the client&apos;s side of the thread when their portal access ships.</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.fromClient ? "" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 ${msg.fromClient ? "border border-[var(--c-border)] bg-[var(--c-bg)]" : "bg-[var(--c-accent)] text-[var(--c-on-accent)]"}`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
              <p className={`mt-1 text-[10px] ${msg.fromClient ? "text-[var(--c-ink-muted)]" : "text-[var(--c-on-accent)]/70"}`}>{msg.author === me ? "You" : msg.author} · {fmtWhen(msg.createdAt)}{msg.fromClient && msg.unread ? <span className="ml-2 rounded-full bg-[var(--c-accent)] px-1.5 py-0.5 text-[9px] font-bold text-white">NEW</span> : null}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 border-t border-[var(--c-border)] p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a note on this matter…" className={`${input} flex-1 resize-y`} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
        <button onClick={send} disabled={pending || !text.trim()} className="btn btn-accent px-3 py-2 text-sm disabled:opacity-40">{pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>
      </div>
      {askEmail && <AskEmailClientDialog matterId={matterId} kind="message" count={1} onClose={() => setAskEmail(false)} />}
    </section>
  );
}

/* --------------------------- document requests --------------------------- */

const fmtDue = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/**
 * What the firm has asked the client for on this matter. Each request is one
 * line the client sees with its own upload button; uploads land here under
 * the request, the firm marks them accepted or asks for more, and one button
 * emails the client a digest of everything still outstanding.
 */
function RequestItem({ r }: { r: RequestRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  void pending;
    const st = requestStatus(r.status);
    const over = requestOverdue(r);
    const [fn, setFn] = useState(r.firmNote);
    return (
      <li className="py-3" data-testid={`request-${r.id}`}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{r.title}</p>
            {r.details && <p className="text-xs text-[var(--c-ink-muted)]">{r.details}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--c-ink-muted)]">
              {r.dueOn && <span className={`inline-flex items-center gap-1 ${over ? "font-semibold text-red-700" : ""}`}><CalendarDays size={11} /> {over ? "overdue —" : "due"} {fmtDue(r.dueOn)}</span>}
              {r.respondedAt && <span>received {fmtWhen(r.respondedAt)}</span>}
              {r.remindedAt && <span>last reminded {fmtWhen(r.remindedAt)}</span>}
              {r.files.length > 0 && <span>{r.files.length} file{r.files.length === 1 ? "" : "s"}: {r.files.map((f, i) => <a key={f.id} href={`/admin/case-portal/file/${f.id}`} target="_blank" rel="noopener noreferrer" className="text-[var(--c-accent)] hover:underline">{i ? ", " : ""}{f.name}</a>)}</span>}
            </p>
          </div>
          <select value={r.status} onChange={(e) => start(async () => { await updatePortalRequest(r.id, { status: e.target.value }); router.refresh(); })} className={`${input} !py-1 text-xs ${over ? "border-red-400" : ""}`} title="Status">
            {REQUEST_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${over ? "bg-red-100 text-red-800" : st.cls}`}>{over ? "Overdue" : st.label}</span>
          <button onClick={() => { if (confirm(`Remove the request "${r.title}"? Any files sent for it stay in Client documents.`)) start(async () => { await deletePortalRequest(r.id); router.refresh(); }); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={13} /></button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input value={fn} onChange={(e) => setFn(e.target.value)} placeholder="Firm-only note (e.g. partial — still missing March statements)" className={`${input} min-w-0 flex-1 !py-1 text-xs`} />
          {fn !== r.firmNote && <button onClick={() => start(async () => { await updatePortalRequest(r.id, { firmNote: fn }); router.refresh(); })} className="rounded-md border border-[var(--c-accent)] px-2 py-1 text-[11px] text-[var(--c-accent)]">Save</button>}
        </div>
      </li>
    );
  }

function RequestsTab({ matterId, requests }: { matterId: number; requests: RequestRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = requests.filter((r) => r.status === "open");
  const rest = requests.filter((r) => r.status !== "open");
  const add = () => { const t = title.trim(); if (!t) return; start(async () => { const r = await addPortalRequest(matterId, { title: t, details, dueOn }); if (r.ok) { setTitle(""); setDetails(""); setDueOn(""); } else setMsg(r.error ?? "Couldn't add."); router.refresh(); }); };
  const remind = () => start(async () => { const r = await sendRequestReminder(matterId, note); setMsg(r.ok ? (r.sent ? `Reminder for ${r.requests} item${r.requests === 1 ? "" : "s"} emailed to ${r.sent} portal member${r.sent === 1 ? "" : "s"}.` : "Nobody has been added to this matter yet — add them on the Dashboard tab first.") : r.error); setNote(""); router.refresh(); });
  return (
    <div className="space-y-5">
      <section className={`${card} p-5`}>
        <h3 className="mb-1 text-sm font-semibold">Ask the client for a document</h3>
        <p className="mb-3 text-[11px] text-[var(--c-ink-muted)]">Each request becomes a line in the client&apos;s portal with its own upload button, so what comes back is already sorted. Keep the title short and put the specifics in the details.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="What you need — e.g. Rental agreement for the vehicle involved" className={`${input} w-full`} data-testid="req-title" />
          <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={`${input} w-full`} title="Due date (optional)" />
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Details the client will see — which dates, which account, photos are fine, etc. (optional)" className={`${input} w-full resize-y sm:col-span-2`} />
        </div>
        <button onClick={add} disabled={pending || !title.trim()} className="btn btn-accent mt-2 text-sm disabled:opacity-50" data-testid="req-add">{pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add request</button>
      </section>

      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Still needed ({open.length})</h3>
          {open.some(requestOverdue) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">{open.filter(requestOverdue).length} overdue</span>}
        </div>
        {open.length === 0 ? <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Nothing outstanding on this matter.</p> : <ul className="divide-y divide-[var(--c-border)]">{open.map((r) => <RequestItem key={r.id} r={r} />)}</ul>}
        {open.length > 0 && (
          <div className="mt-3 border-t border-[var(--c-border)] pt-3">
            <p className="mb-1 text-xs font-semibold">Remind the client</p>
            <div className="flex flex-wrap items-end gap-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note at the top of the reminder…" className={`${input} min-w-[220px] flex-1 resize-y text-xs`} />
              <button onClick={remind} disabled={pending} className="btn btn-outline text-sm disabled:opacity-50" data-testid="req-remind">{pending ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Email reminder for {open.length} item{open.length === 1 ? "" : "s"}</button>
            </div>
          </div>
        )}
        {msg && <p className="mt-2 text-xs text-[var(--c-ink-muted)]">{msg}</p>}
      </section>

      {rest.length > 0 && (
        <section className={`${card} p-5`}>
          <h3 className="text-sm font-semibold">Received, accepted, or no longer needed ({rest.length})</h3>
          <ul className="divide-y divide-[var(--c-border)]">{rest.map((r) => <RequestItem key={r.id} r={r} />)}</ul>
        </section>
      )}
    </div>
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
  const [dragOver, setDragOver] = useState(false);
  const [askEmail, setAskEmail] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mine = docs.filter((d) => d.tab === tabKey);

  async function onFiles(list: FileList | null) {
    if (!list?.length || !blobReady) return;
    setError(null);
    let okCount = 0;
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
        else {
          okCount++;
          if (tabKey === "exhibit" && r.exhibitSetId) exhibit?.onCreated(r.exhibitSetId);
        }
      } catch (e) {
        setError(`Couldn't upload ${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    router.refresh();
    // Only the Client documents tab is client-visible — offer to email them.
    if (tabKey === "client" && okCount > 0) setAskEmail(okCount);
  }

  const partyLabel = (p: string) => PARTY_ROLES.find((r) => r.id === p)?.label ?? p;

  return (
    <section
      className={`${card} p-5 transition-shadow ${dragOver ? "border-[var(--c-accent)] ring-2 ring-[var(--c-accent)]/40" : ""}`}
      onDragOver={(e) => { if (blobReady && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (blobReady) void onFiles(e.dataTransfer.files); }}
    >
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
      <p className="mb-4 text-[11px] text-[var(--c-ink-muted)]">{hint} Drag &amp; drop files anywhere on this panel, or click &ldquo;Add files.&rdquo;</p>
      {!blobReady && <p className="mb-3 text-xs text-amber-600">Connect a Blob store to enable uploads.</p>}
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />

      {mine.length === 0 ? (
        <p className={`rounded-md border border-dashed p-6 text-center text-xs ${dragOver ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"}`}>
          {dragOver ? "Drop to upload" : "No documents yet — drop files here or click “Add files.”"}
        </p>
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
      {askEmail > 0 && <AskEmailClientDialog matterId={matterId} kind="docs" count={askEmail} onClose={() => setAskEmail(0)} />}
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
