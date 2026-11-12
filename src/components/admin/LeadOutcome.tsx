"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { archiveIntakeWithOutcome, setIntakeArchived, setIntakeReferral, updateIntakeStatus } from "@/app/admin/(panel)/intake/actions";
import { saveAutoArchive } from "@/app/admin/(panel)/intake/archive-actions";

/** A lead's status. The last four are outcomes: the lead is finished one way or another. */
const OPEN = [["new", "New"], ["contacted", "Contacted"], ["scheduled", "Scheduled"], ["letter-sent", "Letter Sent"]] as const;
const DONE = [["converted", "Converted"], ["declined", "Declined"], ["client-declined", "Client Declined"], ["referred-out", "Referred Out"]] as const;
type Final = (typeof DONE)[number][0];
type Status = (typeof OPEN)[number][0] | Final;
export const isOutcome = (status: string) => DONE.some(([v]) => v === status);
/** Finished without becoming a client. */
export const isNoOutcome = (status: string) => status === "declined" || status === "client-declined" || status === "referred-out";
export const outcomeLabel = (status: string) => [...OPEN, ...DONE].find(([v]) => v === status)?.[1] ?? status;
/** Who a referred-out lead went to, and any fee expected back. */
export type Referral = { to: string; fee: boolean; amount: string };

const chip = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-xs hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] disabled:opacity-50";

/**
 * The two things that keep a list short, on one lead: record how it turned out,
 * and archive it (or bring it back). Both are the lead's ordinary status and
 * archive flag, so the main lead table shows the same thing.
 *
 * Archiving a lead that has no outcome yet asks for one first, and "Referred
 * Out" asks who it went to, exactly as the main lead table does.
 */
/** Where a converted lead stands with Matters / Cases: a link to send it there, or to the case once it is there. */
export type CaseLink = { href: string; label: string };

export function LeadOutcome({ leadId, status, archived, where, prompt, attorneys = [], referral, caseLink }: { leadId: number; status: string; archived: boolean; where: string; prompt?: boolean; attorneys?: string[]; referral?: Referral; caseLink?: CaseLink }) {
  const router = useRouter();
  const listId = useId();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  // "ask": Archive was pressed with no outcome yet. "refer": who it was referred to (and whether to archive after).
  const [mode, setMode] = useState<null | "ask" | "refer" | "refer-archive">(null);
  const [ref, setRef] = useState<Referral>(referral ?? { to: "", fee: false, amount: "" });
  const id = `${where}-${leadId}`;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => { setErr(""); start(async () => { try { const r = await fn(); if (r.ok) setMode(null); else setErr(r.error || "That did not save. Try again."); } catch { setErr("That did not save. Try again."); } router.refresh(); }); };
  const openRefer = (m: "refer" | "refer-archive") => { setRef(referral ?? { to: "", fee: false, amount: "" }); setErr(""); setMode(m); };
  const archiveAs = (o: Final | null) => (o === "referred-out" ? openRefer("refer-archive") : run(() => archiveIntakeWithOutcome(leadId, o)));
  const saveRefer = () => {
    if (!ref.to.trim()) { setErr("Enter the attorney's name."); return; }
    const data = { referredTo: ref.to.trim(), feeExpected: ref.fee, feeAmount: ref.amount };
    run(() => (mode === "refer-archive" ? archiveIntakeWithOutcome(leadId, "referred-out", data) : setIntakeReferral(leadId, data)));
  };
  return (
    // "contents": the pieces sit directly in the row that holds them, so a question opens on its own full-width line under the row instead of pushing the row around.
    <span className="contents">
      <label className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]">Outcome
        <select value={status} disabled={pending} onChange={(e) => { const v = e.target.value as Status; if (v === "referred-out") openRefer("refer"); else run(() => updateIntakeStatus(leadId, v)); }}
          className={`rounded-md border bg-[var(--c-surface)] px-2 py-1 text-xs text-[var(--c-ink)] outline-none focus:border-[var(--c-accent)] ${prompt ? "border-amber-500 ring-1 ring-amber-300" : "border-[var(--c-border)]"}`} data-testid={`outcome-${id}`}>
          <optgroup label="Still open">{OPEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
          <optgroup label="Finished">{DONE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
        </select>
      </label>
      {status === "referred-out" && mode === null && <button type="button" onClick={() => openRefer("refer")} className="text-xs text-[var(--c-ink-muted)] underline-offset-2 hover:text-[var(--c-accent)] hover:underline" title="Change who it was referred to" data-testid={`referred-${id}`}>{referral?.to ? `to ${referral.to}` : "add who it went to"}</button>}
      {status === "converted" && caseLink && <a href={caseLink.href} className="text-xs font-semibold text-[var(--c-accent)] underline-offset-2 hover:underline" data-testid={`caselink-${id}`}>{caseLink.label}</a>}
      <button type="button" disabled={pending} onClick={() => { if (archived) run(() => setIntakeArchived(leadId, false)); else if (isOutcome(status)) run(() => setIntakeArchived(leadId, true)); else { setErr(""); setMode(mode === "ask" ? null : "ask"); } }}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] disabled:opacity-50" data-testid={`archive-${id}`}>
        {archived ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
      </button>
      {mode === "ask" && (
        <span className="order-last flex w-0 min-w-full flex-wrap items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-xs" data-testid={`ask-${id}`}>
          <span className="mr-1 font-semibold text-[var(--c-ink)]">How did it turn out?</span>
          {DONE.map(([v, l]) => <button key={v} type="button" disabled={pending} onClick={() => archiveAs(v)} className={chip} data-testid={`ask-${v}-${id}`}>{l}</button>)}
          <button type="button" disabled={pending} onClick={() => archiveAs(null)} className={`${chip} text-[var(--c-ink-muted)]`} data-testid={`ask-none-${id}`}>Don&apos;t know yet</button>
          <button type="button" disabled={pending} onClick={() => setMode(null)} className="px-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
        </span>
      )}
      {(mode === "refer" || mode === "refer-archive") && (
        <span className="order-last flex w-0 min-w-full flex-wrap items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-xs" data-testid={`refer-${id}`}>
          <label className="inline-flex items-center gap-1.5 font-semibold text-[var(--c-ink)]">Referred to
            <input list={listId} value={ref.to} onChange={(e) => setRef({ ...ref, to: e.target.value })} placeholder="Attorney's name" autoFocus className="w-48 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-xs font-normal outline-none focus:border-[var(--c-accent)]" data-testid={`refer-name-${id}`} />
          </label>
          <datalist id={listId}>{attorneys.map((a) => <option key={a} value={a} />)}</datalist>
          <label className="inline-flex items-center gap-1.5 text-[var(--c-ink)]"><input type="checkbox" checked={ref.fee} onChange={(e) => setRef({ ...ref, fee: e.target.checked })} data-testid={`refer-fee-${id}`} /> Fee expected</label>
          {ref.fee && <input value={ref.amount} onChange={(e) => setRef({ ...ref, amount: e.target.value })} placeholder="$" aria-label="Expected fee amount" className="w-24 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--c-accent)]" data-testid={`refer-amount-${id}`} />}
          <button type="button" disabled={pending} onClick={saveRefer} className="rounded-md bg-[var(--c-accent)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50" data-testid={`refer-save-${id}`}>{mode === "refer-archive" ? "Save and archive" : "Save"}</button>
          <button type="button" disabled={pending} onClick={() => setMode(null)} className="px-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
        </span>
      )}
      {err && <span className="order-last w-0 min-w-full text-xs text-[var(--c-error,#b3261e)]" role="status" data-testid={`outcome-err-${id}`}>{err}</span>}
    </span>
  );
}

/** The rule that empties the lists on its own. */
export function AutoArchiveRules({ afterOutcomeDays, idleDays }: { afterOutcomeDays: number; idleDays: number }) {
  const router = useRouter();
  const [a, setA] = useState(String(afterOutcomeDays));
  const [b, setB] = useState(String(idleDays));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const num = "mx-1 w-16 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-center text-sm outline-none focus:border-[var(--c-accent)]";
  const changed = a !== String(afterOutcomeDays) || b !== String(idleDays);
  return (
    <form id="auto-archive" className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="auto-archive"
      onSubmit={(e) => { e.preventDefault(); setMsg(null); start(async () => { const r = await saveAutoArchive({ afterOutcomeDays: Number(a), idleDays: Number(b) }); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); router.refresh(); }); }}>
      <p className="inline-flex items-center gap-2 text-sm font-semibold"><Archive size={15} /> Keeping these lists short</p>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">An archived lead leaves the two lists above. Nothing is deleted: tick &ldquo;Show archived&rdquo; on either list to see it or bring it back. Archiving a lead by hand asks how it turned out. Leads also archive themselves on this schedule (enter 0 to turn a rule off):</p>
      <p className="mt-3 text-sm">
        <input type="number" min={0} max={3650} step={1} inputMode="numeric" className={num} value={a} onChange={(e) => setA(e.target.value)} aria-label="Days after an outcome" data-testid="auto-archive-outcome" /> days after an outcome is recorded <span className="text-[var(--c-ink-muted)]">(Converted, Declined, Client Declined or Referred Out)</span>
      </p>
      <p className="mt-2 text-sm">
        <input type="number" min={0} max={3650} step={1} inputMode="numeric" className={num} value={b} onChange={(e) => setB(e.target.value)} aria-label="Days with nothing happening" data-testid="auto-archive-idle" /> days with no outcome and nothing happening <span className="text-[var(--c-ink-muted)]">(never while a consultation is still ahead; these are marked &ldquo;No outcome recorded&rdquo; in the archive)</span>
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !changed || a === "" || b === ""} className="rounded-md bg-[var(--c-accent)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="auto-archive-save">{pending ? "Saving…" : "Save"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid="auto-archive-msg">{msg.text}</span>}
      </p>
    </form>
  );
}
