"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, FolderLock, Send } from "lucide-react";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { PARTY_ROLES } from "./CaseDetail";
import { sendToCases, sharePartnerFolder, skipSendToCases } from "@/app/admin/(panel)/intake/case-actions";

export type CaseFolder = { id: number; files: number; lastFile: string; lastFileBy: string; people: { name: string; opened: string; off: boolean }[] };
export type CaseLeadRow = {
  leadId: number; name: string; area: string; received: string;
  /** todo: converted, not in Cases yet. skipped: the firm said no case record is needed. case: in Cases. */
  state: "todo" | "skipped" | "case";
  prefill: { name: string; county: string; court: string; role: string };
  /** The contact at the partner office the person named on the form, if any. */
  contactId: string;
  caseId: number | null; caseMatter: string; caseName: string; caseClosed: boolean; folder: CaseFolder | null;
};
type Contact = { id: string; name: string };
type R = { ok: true; message: string } | { ok: false; error: string };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const btn = "inline-flex items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-50";
const quiet = "text-xs text-[var(--c-ink-muted)] underline-offset-2 hover:text-[var(--c-accent)] hover:underline disabled:opacity-50";

function Row({ r, matters, contacts, partnerName, focus }: { r: CaseLeadRow; matters: MatterOption[]; contacts: Contact[]; partnerName: string; focus: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<null | "send" | "share">(focus && r.state !== "case" ? "send" : null);
  const [f, setF] = useState({ matter: "", ...r.prefill });
  const [picked, setPicked] = useState<string[]>(() => (contacts.some((c) => c.id === r.contactId) ? [r.contactId] : contacts.length === 1 ? [contacts[0].id] : []));
  const run = (fn: () => Promise<R>) => { setMsg(null); start(async () => { const x = await fn(); setMsg(x.ok ? { ok: true, text: x.message } : { ok: false, text: x.error }); if (x.ok) setOpen(null); router.refresh(); }); };
  const active = r.folder?.people.filter((p) => !p.off) ?? [];
  return (
    <li className={`px-5 py-3 ${focus ? "bg-[var(--c-accent)]/5" : ""}`} data-testid={`case-${r.leadId}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm">
          <span className="font-medium">{r.name || "(no name)"}</span>{r.area ? <span className="text-[var(--c-ink-muted)]"> · {r.area}</span> : null}
          {r.state === "case" && <span className="text-[var(--c-ink-muted)]"> · Matter {r.caseMatter}</span>}
          {r.state === "case" && r.caseClosed && <span className="ml-2 rounded-full border border-[var(--c-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--c-ink-muted)]">Closed</span>}
          {r.state === "skipped" && <span className="ml-2 rounded-full border border-[var(--c-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--c-ink-muted)]">No case record needed</span>}
        </p>
        <span className="flex flex-wrap items-center justify-end gap-3">
          {r.state === "todo" && <>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900" data-testid={`case-status-${r.leadId}`}>Not in Cases yet</span>
            <button type="button" disabled={pending} onClick={() => run(() => skipSendToCases(r.leadId, true))} className={quiet} data-testid={`case-skip-${r.leadId}`}>Not needed</button>
            <button type="button" onClick={() => setOpen(open === "send" ? null : "send")} className={btn} data-testid={`case-send-${r.leadId}`}><Briefcase size={13} /> Send to Cases</button>
          </>}
          {r.state === "skipped" && <button type="button" disabled={pending} onClick={() => run(() => skipSendToCases(r.leadId, false))} className={quiet} data-testid={`case-unskip-${r.leadId}`}>Put back on the list</button>}
          {r.state === "case" && r.caseId != null && <>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900" data-testid={`case-status-${r.leadId}`}>In Cases</span>
            <Link href={`/admin/cases/${r.caseId}`} className={btn} data-testid={`case-open-${r.leadId}`}><Briefcase size={13} /> Open the case</Link>
          </>}
        </span>
      </div>

      {r.state === "case" && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md bg-[var(--c-bg)] px-3 py-2 text-xs" data-testid={`case-folder-${r.leadId}`}>
          {r.folder ? (
            <>
              <p className="text-[var(--c-ink)]"><FolderLock size={13} className="mr-1 inline align-[-2px]" />
                <span className="font-semibold">Shared with {partnerName}:</span> {r.folder.files} document{r.folder.files === 1 ? "" : "s"}{r.folder.lastFile ? `, newest ${r.folder.lastFile}${r.folder.lastFileBy ? ` from ${r.folder.lastFileBy}` : ""}` : ""}
                <span className="text-[var(--c-ink-muted)]"> · {active.length ? active.map((p) => `${p.name} (${p.opened ? `opened ${p.opened}` : "not opened yet"})`).join(", ") : "no one there has a working link"}</span>
              </p>
              <span className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setOpen(open === "share" ? null : "share")} className={quiet} data-testid={`case-share-more-${r.leadId}`}>Send the link again or to someone else</button>
                <Link href={`/admin/share-folders/${r.folder.id}`} className={btn} data-testid={`case-folder-open-${r.leadId}`}><FolderLock size={13} /> Open the shared folder</Link>
              </span>
            </>
          ) : (
            <>
              <p className="text-[var(--c-ink-muted)]"><FolderLock size={13} className="mr-1 inline align-[-2px]" /> No documents are shared with {partnerName} on this case yet.</p>
              <button type="button" onClick={() => setOpen(open === "share" ? null : "share")} className={btn} data-testid={`case-share-${r.leadId}`}><FolderLock size={13} /> Share documents with {partnerName}</button>
            </>
          )}
        </div>
      )}

      {open === "send" && r.state !== "case" && (
        <form className="mt-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3" data-testid={`case-form-${r.leadId}`}
          onSubmit={(e) => { e.preventDefault(); run(() => sendToCases(r.leadId, { matter: f.matter, name: f.name, county: f.county, court: f.court, role: f.role })); }}>
          <p className="text-xs text-[var(--c-ink-muted)]">This creates the case record in Matters / Cases, with {r.name || "the client"} on it as the firm&apos;s client. If the matter already has a record, the lead is linked to it and nothing on it is overwritten.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:col-span-2">Matter number <span className="text-[var(--c-ink-muted)]">(from Clio / the Time Tracker — open the matter there first if it is not listed)</span>
              <div className="mt-1" data-testid={`case-matter-${r.leadId}`}><MatterCombobox matters={matters} value={f.matter} onChange={(v) => setF({ ...f, matter: v })} placeholder="Type the number or the client's name" className={input} /></div>
            </label>
            <label className="text-xs sm:col-span-2">Case name<input className={`${input} mt-1`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Smith v. Jones, or Estate of Maria Lopez" data-testid={`case-name-${r.leadId}`} /></label>
            <label className="text-xs">Our client&apos;s role<select className={`${input} mt-1`} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid={`case-role-${r.leadId}`}>{PARTY_ROLES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
            <label className="text-xs">County<input className={`${input} mt-1`} value={f.county} onChange={(e) => setF({ ...f, county: e.target.value })} data-testid={`case-county-${r.leadId}`} /></label>
            <label className="text-xs sm:col-span-2">Court <span className="text-[var(--c-ink-muted)]">(optional)</span><input className={`${input} mt-1`} value={f.court} onChange={(e) => setF({ ...f, court: e.target.value })} /></label>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || !f.matter.trim()} className="inline-flex items-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid={`case-create-${r.leadId}`}><Briefcase size={14} /> {pending ? "Creating…" : "Create the case record"}</button>
            <button type="button" onClick={() => setOpen(null)} className={quiet}>Cancel</button>
          </p>
        </form>
      )}

      {open === "share" && r.state === "case" && (
        <form className="mt-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3" data-testid={`case-share-form-${r.leadId}`} onSubmit={(e) => { e.preventDefault(); run(() => sharePartnerFolder(r.leadId, picked)); }}>
          <p className="text-xs leading-relaxed text-[var(--c-ink-muted)]">{r.folder ? "Each person chosen is emailed their own sign-in link (a fresh one if they already had it)." : <>This creates a folder in Share Folders, filed under this case&apos;s matter, for {r.name || "this client"}&apos;s documents. Each person chosen is emailed their own sign-in link.</>} They can open what you put there and add documents of their own; you see everything they add. Only the people you choose and this firm can open it.</p>
          {contacts.length === 0
            ? <p className="mt-2 text-xs text-amber-800">No one is listed under &ldquo;their intake team&rdquo; further down this page. Add the person there first.</p>
            : <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">{contacts.map((c) => <label key={c.id} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} data-testid={`case-share-who-${r.leadId}-${c.id}`} /> {c.name}</label>)}</div>}
          <p className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || picked.length === 0} className="inline-flex items-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid={`case-share-send-${r.leadId}`}><Send size={14} /> {pending ? "Sending…" : r.folder ? "Email the link" : "Create the folder and email the link"}</button>
            <button type="button" onClick={() => setOpen(null)} className={quiet}>Cancel</button>
          </p>
        </form>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid={`case-msg-${r.leadId}`}>{msg.text}</p>}
    </li>
  );
}

/** On a partner office's tab: converted leads, the step that sends each to Matters / Cases, and the document folder shared with that office. */
export function PartnerCases({ rows, matters, contacts, partnerName, focusId }: { rows: CaseLeadRow[]; matters: MatterOption[]; contacts: Contact[]; partnerName: string; focusId: number | null }) {
  const [showAll, setShowAll] = useState(false);
  const tucked = (r: CaseLeadRow) => (r.state === "skipped" || (r.state === "case" && r.caseClosed)) && r.leadId !== focusId;
  const hidden = rows.filter(tucked).length;
  const shown = showAll ? rows : rows.filter((r) => !tucked(r));
  const todo = rows.filter((r) => r.state === "todo").length;
  return (
    <div id="cases" className="mb-6 scroll-mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]" data-testid="partner-cases">
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><Briefcase size={15} /> Converted leads → Cases{todo > 0 && <span className="rounded-full bg-[var(--c-accent)] px-1.5 text-[11px] font-semibold text-white">{todo} not in Cases yet</span>}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">When a lead&apos;s outcome is Converted it appears here. Send it to Matters / Cases to open its case record; from then on it can have a document folder shared with {partnerName}, which lives in Share Folders and is one click from the case.</p>
        </div>
        {hidden > 0 && <label className="flex items-center gap-2 text-xs text-[var(--c-ink-muted)]"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} data-testid="cases-show-all" /> Show closed and not needed ({hidden})</label>}
      </div>
      {shown.length === 0
        ? <p className="mx-5 mb-5 rounded-md border border-dashed border-[var(--c-border)] px-4 py-3 text-xs text-[var(--c-ink-muted)]" data-testid="cases-empty">{rows.length === 0 ? "No converted leads yet. Set a lead's outcome to Converted and it appears here." : "Nothing open here."}</p>
        : <ul className="divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">{shown.map((r) => <Row key={r.leadId} r={r} matters={matters} contacts={contacts} partnerName={partnerName} focus={focusId === r.leadId} />)}</ul>}
    </div>
  );
}
