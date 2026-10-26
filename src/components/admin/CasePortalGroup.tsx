"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase, Building2, User, Plus, Loader2, ChevronRight, X, Scale, FileText, Handshake, ListChecks, Share2, Link as LinkIcon, Mail, Ban, RotateCcw, Trash2, Eye, EyeOff,
  ClipboardList, MessageSquare, Pencil, Check, Landmark, ClipboardPaste, Send, Users, ChevronDown,
} from "lucide-react";
import {
  addPortalCompany, removePortalCompany, updatePortalCompany, createPortalMatter, setMatterHidden, addPortalMember, resendPortalInvite, setPortalMemberRevoked, deletePortalMember,
  setClientCanCreateMatters, updatePortalGroupProfile, updatePortalGroupNotes, importPortalMatters, sendGroupDigest, updatePortalMatter, setMemberMatter,
} from "@/app/admin/(panel)/case-portal/actions";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { useCaseLookup, lookupNote } from "./useCaseLookup";
import { POSTURES, ENTITY_KINDS, entityKind, FILE_KINDS, requestOverdue } from "@/lib/portal";

export type GroupProfile = { id: number; name: string; kind: string; parentName: string; parentContact: string; notes: string; clientCanCreateMatters: boolean };
export type CompanyRow = { id: number; name: string; kind: string; aka: string; notes: string };
export type MatterRow = {
  id: number; title: string; companyId: number | null; companyName: string | null;
  clioMatter: string; posture: string; status: string; hidden: boolean; driveFolder: string;
  openTasks: number; firmTasks: number; openRequests: number; overdueRequests: number; unread: number;
  /** Active members who have been added to this matter. */
  viewers: number;
};
export type MemberRow = { id: number; email: string; name: string; token: string; revoked: boolean; lastAccessAt: string | null; matterIds: number[] };
export type OverviewData = {
  requests: { id: number; matterId: number; matterTitle: string; title: string; dueOn: string; status: string }[];
  unread: { id: number; matterId: number; matterTitle: string; author: string; body: string; createdAt: string }[];
  clientTasks: { id: number; matterId: number; matterTitle: string; title: string }[];
  firmTasks: { id: number; matterId: number; matterTitle: string; title: string }[];
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]";
const fmtDue = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const POSTURE_META: Record<string, { label: string; icon: typeof Scale; cls: string }> = {
  litigation: { label: "Litigation", icon: Scale, cls: "bg-red-100 text-red-800" },
  "pre-litigation": { label: "Pre-Litigation", icon: FileText, cls: "bg-amber-100 text-amber-800" },
  transactional: { label: "Transactional", icon: Handshake, cls: "bg-emerald-100 text-emerald-800" },
};
const KIND_ICON: Record<string, typeof Building2> = { company: Building2, partnership: Building2, trust: Landmark, estate: Landmark, other: Briefcase };

/**
 * One client file. A SINGLE file is one client and its matters. A
 * MULTI-ENTITY file has a parent person at the top; their entities
 * (companies, trusts, estates) each hold matters, and the parent's personal
 * matters hang directly off the parent. The "Everything open" panel pulls the
 * whole file together so the firm can review it and write the client once.
 */
export function CasePortalGroup({ group, companies, matters, clioMatters, members, overview }: {
  group: GroupProfile; companies: CompanyRow[]; matters: MatterRow[]; clioMatters: MatterOption[]; members: MemberRow[]; overview: OverviewData;
}) {
  const router = useRouter();
  const family = group.kind === "family";
  const visible = matters.filter((m) => !m.hidden);
  const open = visible.filter((m) => m.status === "open");
  const closed = visible.filter((m) => m.status !== "open");
  const hidden = matters.filter((m) => m.hidden);
  const [showHidden, setShowHidden] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Sections: the parent's personal matters first (family files), then each entity.
  const sections: { key: string; title: string; sub: string; icon: typeof Building2; items: MatterRow[]; company: CompanyRow | null }[] = [];
  if (family) sections.push({ key: "parent", title: `${group.parentName || "Parent"} — personal`, sub: "Matters that belong to the parent personally", icon: User, items: open.filter((m) => m.companyId == null), company: null });
  for (const c of companies) sections.push({ key: `c${c.id}`, title: c.name, sub: [entityKind(c.kind).label, c.aka ? `a/k/a ${c.aka}` : ""].filter(Boolean).join(" · "), icon: KIND_ICON[c.kind] ?? Building2, items: open.filter((m) => m.companyId === c.id), company: c });
  const unowned = open.filter((m) => m.companyId == null);
  if (!family && unowned.length) sections.unshift({ key: "all", title: "Matters", sub: "", icon: Briefcase, items: unowned, company: null });
  if (family) { /* unowned already shown under the parent */ }
  else if (!companies.length && !unowned.length) sections.push({ key: "all", title: "Matters", sub: "", icon: Briefcase, items: [], company: null });

  return (
    <div className="space-y-6">
      <FileHeader group={group} companies={companies} openCount={open.length} />

      <Overview group={group} overview={overview} members={members} />

      <Entities group={group} companies={companies} />

      <div className="flex flex-wrap items-center gap-2">
        <NewMatter groupId={group.id} family={family} parentName={group.parentName} companies={companies} clioMatters={clioMatters} />
        <button onClick={() => setShowImport((v) => !v)} className="btn btn-outline text-sm"><ClipboardPaste size={15} /> Paste a list of matters</button>
      </div>
      {showImport && <ImportBox groupId={group.id} onDone={() => { setShowImport(false); router.refresh(); }} />}

      {sections.map((s) => (
        <MatterSection key={s.key} groupId={group.id} title={s.title} sub={s.sub} icon={s.icon} items={s.items} company={s.company} />
      ))}
      {family && companies.length === 0 && <p className="text-xs text-[var(--c-ink-muted)]">Add the parent&apos;s entities above, then file each matter under the right one.</p>}

      {closed.length > 0 && <MatterList groupId={group.id} items={closed} heading="Closed matters" />}

      {hidden.length > 0 && (
        <div>
          <button onClick={() => setShowHidden((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
            <EyeOff size={13} /> Hidden matters ({hidden.length}) {showHidden ? "— hide" : "— show"}
          </button>
          {showHidden && <div className="mt-2"><MatterList groupId={group.id} items={hidden} heading="" hiddenView /></div>}
        </div>
      )}

      <PortalAccess groupId={group.id} members={members} matters={matters.filter((m) => m.status === "open" && !m.hidden)} clientCanCreateMatters={group.clientCanCreateMatters} />
    </div>
  );
}

/* ------------------------------ file header ------------------------------ */

function FileHeader({ group, companies, openCount }: { group: GroupProfile; companies: CompanyRow[]; openCount: number }) {
  const router = useRouter();
  const family = group.kind === "family";
  const [edit, setEdit] = useState(false);
  const [kind, setKind] = useState<"single" | "family">(family ? "family" : "single");
  const [parentName, setParentName] = useState(group.parentName);
  const [parentContact, setParentContact] = useState(group.parentContact);
  const [notes, setNotes] = useState(group.notes);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    await updatePortalGroupProfile(group.id, { kind, parentName, parentContact });
    if (notes !== group.notes) await updatePortalGroupNotes(group.id, notes);
    setEdit(false); router.refresh();
  });
  return (
    <section className={`rounded-lg border-2 p-4 ${family ? "border-violet-400/70 bg-violet-50/40 dark:bg-violet-950/20" : "border-slate-300 bg-[var(--c-surface)]"}`} data-testid="file-header">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${family ? "bg-violet-600 text-white" : "bg-slate-600 text-white"}`}>{family ? <Building2 size={18} /> : <User size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${family ? "text-violet-800 dark:text-violet-300" : "text-slate-700 dark:text-slate-300"}`}>{family ? "Multi-entity client file" : "Single client file"}</p>
          {family ? (
            <>
              <p className="mt-0.5 text-sm"><span className="text-[var(--c-ink-muted)]">Parent (the client):</span> <strong className="text-base">{group.parentName || "— not set —"}</strong>{!group.parentName && <button onClick={() => setEdit(true)} className="ml-2 rounded border border-amber-500/60 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Name the parent</button>}</p>
              <p className="mt-0.5 text-sm text-[var(--c-ink-muted)]">{companies.length} entit{companies.length === 1 ? "y" : "ies"} + personal matters · {openCount} open matter{openCount === 1 ? "" : "s"} in all. Everything here is one client: review it together and write them once.</p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-[var(--c-ink-muted)]">One client, {openCount} open matter{openCount === 1 ? "" : "s"}.{group.parentName ? ` Contact: ${group.parentName}.` : ""}</p>
          )}
          {group.parentContact && !edit && <p className="mt-1 text-xs text-[var(--c-ink-muted)]"><strong>Reach them:</strong> {group.parentContact} <span className="opacity-70">(firm-only)</span></p>}
          {group.notes && !edit && <p className="mt-2 whitespace-pre-wrap rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-xs text-[var(--c-ink)]">{group.notes}</p>}
        </div>
        <button onClick={() => setEdit((v) => !v)} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit the file profile and notes"><Pencil size={14} /></button>
      </div>
      {edit && (
        <div className="mt-3 grid gap-3 border-t border-[var(--c-border)] pt-3 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
            {FILE_KINDS.map((k) => (
              <label key={k.id} className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-xs ${kind === k.id ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}>
                <input type="radio" checked={kind === k.id} onChange={() => setKind(k.id)} className="mt-0.5 accent-[var(--c-accent)]" />
                <span><span className="block font-semibold">{k.label}</span><span className="block text-[11px] text-[var(--c-ink-muted)]">{k.blurb}</span></span>
              </label>
            ))}
          </div>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">{kind === "family" ? "Parent — the person at the top" : "Client contact name"}</span><input value={parentName} onChange={(e) => setParentName(e.target.value)} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">How to reach them (firm-only)</span><input value={parentContact} onChange={(e) => setParentContact(e.target.value)} className={`${input} w-full`} /></label>
          <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">File notes (firm-only)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${input} w-full resize-y`} /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
            <button onClick={() => setEdit(false)} className="text-sm text-[var(--c-ink-muted)]">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------- overview -------------------------------- */

function Overview({ group, overview, members }: { group: GroupProfile; overview: OverviewData; members: MemberRow[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const openReqs = overview.requests.filter((r) => r.status === "open");
  const received = overview.requests.filter((r) => r.status === "received");
  const overdue = openReqs.filter((r) => requestOverdue(r));
  const total = openReqs.length + overview.unread.length + overview.clientTasks.length + overview.firmTasks.length + received.length;
  const active = members.filter((m) => !m.revoked).length;
  const send = () => start(async () => {
    const r = await sendGroupDigest(group.id, note);
    setMsg(r.ok ? (r.sent ? `Sent to ${r.sent} portal member${r.sent === 1 ? "" : "s"}: one email each covering every open matter they have been added to.` : "Nobody has been added to any matter yet — invite the client below and tick their matters first.") : r.error);
    setNote(""); router.refresh();
  });
  const Row = ({ matterTitle, matterId, children }: { matterTitle: string; matterId: number; children: React.ReactNode }) => (
    <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
      <Link href={`/admin/case-portal/${group.id}/matter/${matterId}`} className="shrink-0 text-xs font-semibold text-[var(--c-accent)] hover:underline">{matterTitle.length > 48 ? `${matterTitle.slice(0, 48)}…` : matterTitle}</Link>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
  return (
    <section className={`${card} p-4`} data-testid="overview">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ListChecks size={15} className="text-[var(--c-accent)]" /> Everything open on this file</h2>
        <span className="text-xs text-[var(--c-ink-muted)]">{total === 0 ? "Nothing outstanding." : `${total} item${total === 1 ? "" : "s"} across every matter`}</span>
      </div>
      {total > 0 && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Documents we are waiting on ({openReqs.length}{overdue.length ? `, ${overdue.length} overdue` : ""})</p>
            <ul className="divide-y divide-[var(--c-border)]">
              {openReqs.map((r) => <Row key={r.id} matterTitle={r.matterTitle} matterId={r.matterId}>{r.title}{r.dueOn && <span className={`ml-2 text-xs ${requestOverdue(r) ? "font-semibold text-red-700" : "text-[var(--c-ink-muted)]"}`}>{requestOverdue(r) ? "overdue" : "due"} {fmtDue(r.dueOn)}</span>}</Row>)}
              {openReqs.length === 0 && <li className="py-1 text-xs text-[var(--c-ink-muted)]">None.</li>}
            </ul>
            {received.length > 0 && (
              <>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-sky-800">Received — for the firm to review ({received.length})</p>
                <ul className="divide-y divide-[var(--c-border)]">{received.map((r) => <Row key={r.id} matterTitle={r.matterTitle} matterId={r.matterId}>{r.title}</Row>)}</ul>
              </>
            )}
            {overview.clientTasks.length > 0 && (
              <>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Client to-dos ({overview.clientTasks.length})</p>
                <ul className="divide-y divide-[var(--c-border)]">{overview.clientTasks.map((t) => <Row key={t.id} matterTitle={t.matterTitle} matterId={t.matterId}>{t.title}</Row>)}</ul>
              </>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--c-accent)]">Unread from the client ({overview.unread.length})</p>
            <ul className="divide-y divide-[var(--c-border)]">
              {overview.unread.map((u) => <Row key={u.id} matterTitle={u.matterTitle} matterId={u.matterId}><span className="text-[var(--c-ink-muted)]">{u.author} · {fmtWhen(u.createdAt)}:</span> {u.body.length > 140 ? `${u.body.slice(0, 140)}…` : u.body}</Row>)}
              {overview.unread.length === 0 && <li className="py-1 text-xs text-[var(--c-ink-muted)]">None.</li>}
            </ul>
            {overview.firmTasks.length > 0 && (
              <>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Firm checklist ({overview.firmTasks.length})</p>
                <ul className="divide-y divide-[var(--c-border)]">{overview.firmTasks.map((t) => <Row key={t.id} matterTitle={t.matterTitle} matterId={t.matterId}>{t.title}</Row>)}</ul>
              </>
            )}
          </div>
        </div>
      )}
      <div className="mt-4 border-t border-[var(--c-border)] pt-3">
        <p className="mb-1 text-xs font-semibold">Write the client once about all of it</p>
        <p className="mb-2 text-[11px] text-[var(--c-ink-muted)]">Sends every active portal member one email listing each open matter, what we still need on it, and a link into their portal. {active ? `${active} active member${active === 1 ? "" : "s"}.` : "No portal members yet."}</p>
        <div className="flex flex-wrap items-end gap-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note to put at the top of the email…" className={`${input} min-w-[240px] flex-1 resize-y text-xs`} />
          <button onClick={send} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50" data-testid="send-digest">{pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Email whole-file summary</button>
        </div>
        {msg && <p className="mt-2 text-xs text-[var(--c-ink-muted)]">{msg}</p>}
      </div>
    </section>
  );
}

/* ------------------------------- entities -------------------------------- */

function Entities({ group, companies }: { group: GroupProfile; companies: CompanyRow[] }) {
  const router = useRouter();
  const family = group.kind === "family";
  const [name, setName] = useState("");
  const [kind, setKind] = useState("company");
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const add = () => { const n = name.trim(); if (!n) return; start(async () => { await addPortalCompany(group.id, n, kind); setName(""); router.refresh(); }); };
  return (
    <section className={`${card} p-4`} data-testid="entities">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Building2 size={15} className="text-[var(--c-accent)]" /> {family ? `Entities under ${group.parentName || "the parent"}` : "Related entities"}</p>
      <p className="mb-3 text-[11px] text-[var(--c-ink-muted)]">{family ? "Companies, partnerships, trusts and estates the parent owns or controls. Each holds its own matters; the parent's personal matters sit under the parent directly." : "Usually none for a single client. Add one if a second entity turns up, or switch this to a multi-entity file."}</p>
      <ul className="space-y-2">
        {companies.map((c) => {
          const Icon = KIND_ICON[c.kind] ?? Building2;
          return (
            <li key={c.id} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
              {editing === c.id ? (
                <EntityEditor company={c} onDone={() => { setEditing(null); router.refresh(); }} />
              ) : (
                <div className="flex flex-wrap items-start gap-2">
                  <Icon size={15} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name} <span className="ml-1 rounded-full bg-[var(--c-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--c-ink-muted)]">{entityKind(c.kind).label}</span></p>
                    {c.aka && <p className="text-xs text-[var(--c-ink-muted)]">a/k/a {c.aka}</p>}
                    {c.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--c-ink)]">{c.notes}</p>}
                  </div>
                  <button onClick={() => setEditing(c.id)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={13} /></button>
                  <button onClick={() => { if (confirm(`Remove ${c.name}? Its matters stay — they move under ${family ? "the parent" : "the file"}.`)) void removePortalCompany(c.id).then(() => router.refresh()); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><X size={13} /></button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Entity name, e.g. Instacar Rental, LLC" className={`${input} min-w-[220px] flex-1 !py-1.5 text-sm`} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${input} !py-1.5 text-sm`}>{ENTITY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        <button onClick={add} disabled={pending || !name.trim()} className="btn btn-outline text-sm disabled:opacity-40"><Plus size={14} /> Add entity</button>
      </div>
    </section>
  );
}

function EntityEditor({ company, onDone }: { company: CompanyRow; onDone: () => void }) {
  const [name, setName] = useState(company.name);
  const [kind, setKind] = useState(company.kind);
  const [aka, setAka] = useState(company.aka);
  const [notes, setNotes] = useState(company.notes);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full !py-1.5`} />
      <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${input} w-full !py-1.5`}>{ENTITY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
      <input value={aka} onChange={(e) => setAka(e.target.value)} placeholder="Also known as / d/b/a / misnomers" className={`${input} w-full !py-1.5 sm:col-span-2`} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Entity notes — registered agent, SOS status, who signs, caveats (firm-only)" className={`${input} w-full resize-y !py-1.5 text-xs sm:col-span-2`} />
      <div className="flex gap-2 sm:col-span-2">
        <button onClick={() => start(async () => { await updatePortalCompany(company.id, { name, kind, aka, notes }); onDone(); })} disabled={pending} className="btn btn-accent text-xs disabled:opacity-50"><Check size={13} /> Save</button>
        <button onClick={onDone} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
      </div>
    </div>
  );
}

/* ------------------------------ new matter ------------------------------- */

function NewMatter({ groupId, family, parentName, companies, clioMatters }: { groupId: number; family: boolean; parentName: string; companies: CompanyRow[]; clioMatters: MatterOption[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [clio, setClio] = useState("");
  const [posture, setPosture] = useState<string>("transactional");
  const [drive, setDrive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lookup = useCaseLookup(clio, (c) => { if (c.matter && c.matter !== clio) setClio(c.matter); setTitle((v) => v || c.name); });
  const note = lookupNote(lookup);
  const [pending, start] = useTransition();
  const create = () => {
    setError(null);
    start(async () => {
      const r = await createPortalMatter(groupId, { title, companyId: companyId ? Number(companyId) : null, clioMatter: clio, posture });
      if (!r.ok) { setError(r.error ?? "Couldn't create the matter."); return; }
      if (drive.trim()) await updatePortalMatter(r.id, { driveFolder: drive });
      setTitle(""); setClio(""); setDrive(""); setShow(false);
      router.push(`/admin/case-portal/${groupId}/matter/${r.id}`);
    });
  };
  if (!show) return <button onClick={() => setShow(true)} className="btn btn-accent text-sm" data-testid="new-matter"><Plus size={15} /> New matter</button>;
  return (
    <div className="w-full rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4">
      <p className="mb-3 text-sm font-semibold">New matter</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">Matter name</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Rene Zuniga v. Manuel Auto Group — Cause No. … (debt defense)" className={`${input} w-full`} /></label>
        <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Belongs to</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${input} w-full`}>
            <option value="">{family ? `${parentName || "Parent"} — personal` : "The client (no separate entity)"}</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({entityKind(c.kind).label})</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Clio matter <span className="opacity-70">(Client ID — links time and the hub)</span></span><MatterCombobox matters={clioMatters} value={clio} onChange={setClio} placeholder="Search matter…" />{note && <span className={`mt-1 block text-[11px] ${note.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--c-ink-muted)]"}`}>{note.text}</span>}</label>
        <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Posture</span>
          <select value={posture} onChange={(e) => setPosture(e.target.value)} className={`${input} w-full`}>{POSTURES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </label>
        <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Working folder (Drive / office)</span><input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="e.g., 2026-Lit (096-368163-25)" className={`${input} w-full`} /></label>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={create} disabled={pending || !title.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : "Create matter"}</button>
        <button onClick={() => setShow(false)} className="text-sm text-[var(--c-ink-muted)]">Cancel</button>
      </div>
    </div>
  );
}

function ImportBox({ groupId, onDone }: { groupId: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={`${card} p-4`} data-testid="import-box">
      <p className="mb-1 text-sm font-semibold">Paste a list of matters</p>
      <p className="mb-2 text-[11px] text-[var(--c-ink-muted)]">One per line: <code>Clio | Matter title | Entity | Status | Working folder | Notes</code>. Only the Clio number and title are required. Entities that don&apos;t exist yet are created; a Clio number already on this file is skipped.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"01473 | Rene Zuniga v. Manuel Auto Group — debt defense | Manuel Oldsmobile, Inc. | Open | 2026-Lit (096-368163-25)\n01541 | 2015 Irrevocable Trust | | Open | 2026-Obtain 2015 Irrevocable Trust"} className={`${input} w-full resize-y font-mono text-xs`} />
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => start(async () => { const r = await importPortalMatters(groupId, text); setResult(r.ok ? `${r.created} created, ${r.skipped} already present${r.errors.length ? `; ${r.errors.length} line(s) skipped: ${r.errors.join(" · ")}` : ""}.` : r.error); if (r.ok && r.created) setTimeout(onDone, 1200); })} disabled={pending || !text.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <ClipboardPaste size={15} />} Import</button>
        <button onClick={onDone} className="text-sm text-[var(--c-ink-muted)]">Close</button>
      </div>
      {result && <p className="mt-2 text-xs text-[var(--c-ink-muted)]">{result}</p>}
    </div>
  );
}

/* ----------------------------- matter lists ------------------------------ */

function MatterSection({ groupId, title, sub, icon: Icon, items, company }: { groupId: number; title: string; sub: string; icon: typeof Building2; items: MatterRow[]; company: CompanyRow | null }) {
  return (
    <section data-testid={`section-${company ? company.id : "parent"}`}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon size={15} className="text-[var(--c-accent)]" /> {title} <span className="text-xs font-normal text-[var(--c-ink-muted)]">({items.length} open){sub ? ` · ${sub}` : ""}</span></h3>
      <MatterList groupId={groupId} items={items} heading="" />
    </section>
  );
}

function MatterList({ groupId, items, heading, hiddenView }: { groupId: number; items: MatterRow[]; heading: string; hiddenView?: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  function toggleHide(m: MatterRow) { setBusyId(m.id); void setMatterHidden(m.id, !m.hidden).then(() => { setBusyId(null); router.refresh(); }); }
  return (
    <section>
      {heading && <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">{heading} ({items.length})</h3>}
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--c-border)] p-3 text-center text-xs text-[var(--c-ink-muted)]">No open matters here.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((m) => {
            const pm = POSTURE_META[m.posture] ?? POSTURE_META.transactional;
            const clio = m.clioMatter.split("-")[0];
            return (
              <li key={m.id}>
                <Link href={`/admin/case-portal/${groupId}/matter/${m.id}`} className={`flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3.5 transition-colors hover:border-[var(--c-accent)] ${hiddenView ? "opacity-70" : ""}`}>
                  <span className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md bg-[var(--c-surface-2)] px-1.5 font-mono text-xs font-semibold text-[var(--c-accent)]" title="Clio matter / Client ID">{clio || <Briefcase size={15} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{m.title}</span>
                    <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                      {[m.companyName, m.driveFolder ? `📁 ${m.driveFolder}` : "no working folder yet"].filter(Boolean).join("  ·  ")}
                    </span>
                  </span>
                  {!hiddenView && m.status === "open" && (m.viewers === 0
                    ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="No client has been added to this matter — nobody can see it in the portal" data-testid={`nobody-${m.id}`}><Users size={11} /> Nobody added</span>
                    : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--c-ink-muted)]" title={`${m.viewers} ${m.viewers === 1 ? "person" : "people"} can see this matter`}><Users size={11} /> {m.viewers}</span>)}
                  {m.unread > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-accent)] px-2 py-0.5 text-[11px] font-semibold text-white" title="Unread from the client"><MessageSquare size={11} /> {m.unread}</span>}
                  {m.openRequests > 0 && <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.overdueRequests ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`} title="Documents still requested"><ClipboardList size={11} /> {m.openRequests}</span>}
                  {m.openTasks > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--c-accent)]" title="Client to-dos"><ListChecks size={11} /> {m.openTasks}</span>}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pm.cls}`}>{pm.label}</span>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleHide(m); }} disabled={busyId === m.id}
                    title={m.hidden ? "Bring this matter back" : "Hide this matter from the list and from the client's portal until you bring it back"}
                    className="shrink-0 rounded-md border border-transparent p-1.5 text-[var(--c-ink-muted)] hover:border-[var(--c-border)] hover:text-[var(--c-ink)] disabled:opacity-50">
                    {busyId === m.id ? <Loader2 size={15} className="animate-spin" /> : m.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <ChevronRight size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------- portal access ----------------------------- */

function PortalAccess({ groupId, members, matters, clientCanCreateMatters }: { groupId: number; members: MemberRow[]; matters: MatterRow[]; clientCanCreateMatters: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  // Optimistic state for the per-member matter ticks (the server round-trip refreshes behind it).
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const togglePick = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  function invite() {
    setError(null); setMsg(null);
    start(async () => {
      const r = await addPortalMember(groupId, { email, name, matterIds: picked });
      if (!r.ok) { setError(r.error ?? "Couldn't send the invite."); return; }
      const n = picked.length;
      setMsg("warning" in r && r.warning ? r.warning : `${r.resent ? "Invite re-sent" : "Invite sent"} to ${email.trim()}${n ? ` with access to ${n} matter${n === 1 ? "" : "s"}` : " — they won't see any matters until you add them to one"}.`);
      setName(""); setEmail(""); setPicked([]); router.refresh();
    });
  }
  const copyLink = (token: string) => { void navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`); setMsg("Portal link copied — it only works for the invited email after they verify."); };
  const matterTitle = (id: number) => matters.find((m) => m.id === id)?.title ?? "";
  return (
    <div className={`${card} p-4`} data-testid="portal-access">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Share2 size={15} className="text-[var(--c-accent)]" /> Client portal access</p>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
        Access is <strong>per matter</strong>. Each person gets a personal link and signs in with a one-time code, and sees only the matters you add them to — the <strong>documents requested</strong> with an upload button per item, their <strong>to-dos</strong>, <strong>client documents</strong>, and a <strong>message thread</strong> on each. A new matter starts with nobody on it; add people to it when it is set up. Never the firm checklist, pleadings, discovery, exhibits, notes, or time.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${input} w-40`} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") invite(); }} placeholder="email@company.com" className={`${input} min-w-[220px] flex-1`} />
        <button onClick={invite} disabled={pending || !email.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <><Mail size={14} /> Send invite</>}</button>
      </div>
      {matters.length > 0 && (
        <div className="mt-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5" data-testid="invite-matters">
          <p className="mb-1.5 text-[11px] font-medium text-[var(--c-ink)]">Give them access to: <span className="font-normal text-[var(--c-ink-muted)]">{picked.length ? `${picked.length} of ${matters.length} matters` : "none selected yet"}</span>
            <button onClick={() => setPicked(picked.length === matters.length ? [] : matters.map((m) => m.id))} className="ml-2 text-[11px] text-[var(--c-accent)] hover:underline">{picked.length === matters.length ? "Clear" : "Select all"}</button>
          </p>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {matters.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5 accent-[var(--c-accent)]" checked={picked.includes(m.id)} onChange={() => togglePick(m.id)} />
                <span className="min-w-0 truncate">{m.title}{m.companyName ? <span className="text-[var(--c-ink-muted)]"> · {m.companyName}</span> : null}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-green-700">{msg}</p>}
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-[var(--c-border)] pt-3 text-xs">
        <input type="checkbox" className="mt-0.5 accent-[var(--c-accent)]" checked={clientCanCreateMatters} onChange={(e) => start(async () => { await setClientCanCreateMatters(groupId, e.target.checked); router.refresh(); })} />
        <span><span className="font-medium text-[var(--c-ink)]">Allow the client to open new matters</span><span className="block text-[11px] text-[var(--c-ink-muted)]">Adds an &ldquo;Open a new matter&rdquo; button to their portal; the office is emailed each time. The person who opens it is the only one added to it.</span></span>
      </label>
      {members.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">
          {members.map((mem) => {
            const mine = mem.matterIds.filter((id) => matters.some((m) => m.id === id));
            const expanded = open === mem.id;
            return (
            <li key={mem.id} className={`py-2.5 ${mem.revoked ? "opacity-60" : ""}`} data-testid={`member-${mem.id}`}>
              <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--c-ink)]">{mem.name ? `${mem.name} — ` : ""}{mem.email}</span>
                <span className="block text-[11px] text-[var(--c-ink-muted)]">
                  {mem.revoked ? "Access revoked" : mem.lastAccessAt ? `Last visit ${new Date(mem.lastAccessAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Invited — hasn't signed in yet"}
                  {" · "}
                  <span className={mine.length === 0 && !mem.revoked ? "font-semibold text-amber-700" : ""}>{mine.length === 0 ? "sees no matters yet" : `sees ${mine.length} of ${matters.length} open matter${matters.length === 1 ? "" : "s"}`}</span>
                </span>
              </span>
              <button onClick={() => setOpen(expanded ? null : mem.id)} className={`rounded-md border px-2 py-1 text-[11px] ${expanded ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}`} data-testid={`member-matters-${mem.id}`}><Users size={11} className="mr-1 inline" />Matters <ChevronDown size={11} className={`ml-0.5 inline transition-transform ${expanded ? "rotate-180" : ""}`} /></button>
              <button onClick={() => copyLink(mem.token)} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"><LinkIcon size={11} className="mr-1 inline" />Copy link</button>
              {!mem.revoked && <button onClick={() => start(async () => { const r = await resendPortalInvite(mem.id); setMsg(r.ok ? `Invite re-sent to ${mem.email}.` : null); setError(r.ok ? null : (r.error ?? "Couldn't resend.")); })} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"><Mail size={11} className="mr-1 inline" />Resend</button>}
              <button onClick={() => start(async () => { await setPortalMemberRevoked(mem.id, !mem.revoked); router.refresh(); })} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:border-red-500 hover:text-red-600">{mem.revoked ? <><RotateCcw size={11} className="mr-1 inline" />Restore</> : <><Ban size={11} className="mr-1 inline" />Revoke</>}</button>
              {mem.revoked && <button onClick={() => { if (confirm(`Delete ${mem.email}'s portal access entirely?`)) start(async () => { await deletePortalMember(mem.id); router.refresh(); }); }} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:border-red-500 hover:text-red-600"><Trash2 size={11} className="mr-1 inline" />Delete</button>}
              </div>
              {expanded && (
                <div className="mt-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5">
                  <p className="mb-1.5 text-[11px] text-[var(--c-ink-muted)]">Tick the matters {mem.name || mem.email} should see. Changes apply at once; no email is sent from here — use the matter page to add someone with a note.</p>
                  {matters.length === 0 ? <p className="text-xs text-[var(--c-ink-muted)]">No open matters on this file.</p> : (
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {matters.map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-start gap-2 text-xs">
                        <input type="checkbox" className="mt-0.5 accent-[var(--c-accent)]" checked={ticks[`${mem.id}:${m.id}`] ?? mine.includes(m.id)} onChange={(e) => { const on = e.target.checked; setTicks((t) => ({ ...t, [`${mem.id}:${m.id}`]: on })); start(async () => { const r = await setMemberMatter(mem.id, m.id, on); if (!r.ok) { setTicks((t) => ({ ...t, [`${mem.id}:${m.id}`]: !on })); setError(r.error ?? "Couldn't change that."); } router.refresh(); }); }} data-testid={`mm-${mem.id}-${m.id}`} />
                        <span className="min-w-0 truncate">{m.title}{m.companyName ? <span className="text-[var(--c-ink-muted)]"> · {m.companyName}</span> : null}</span>
                      </label>
                    ))}
                  </div>)}
                  {mine.length > 0 && <p className="mt-2 text-[10px] text-[var(--c-ink-muted)]">Currently: {mine.map(matterTitle).filter(Boolean).join(", ")}</p>}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

