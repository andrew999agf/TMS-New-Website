"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { setIntakeArchived, updateIntakeStatus } from "@/app/admin/(panel)/intake/actions";
import { saveAutoArchive } from "@/app/admin/(panel)/intake/archive-actions";

/** A lead's status. The last four are outcomes: the lead is finished one way or another. */
const OPEN = [["new", "New"], ["contacted", "Contacted"], ["scheduled", "Scheduled"], ["letter-sent", "Letter Sent"]] as const;
const DONE = [["converted", "Converted"], ["declined", "Declined"], ["client-declined", "Client Declined"], ["referred-out", "Referred Out"]] as const;
type Status = (typeof OPEN)[number][0] | (typeof DONE)[number][0];
export const isOutcome = (status: string) => DONE.some(([v]) => v === status);
export const outcomeLabel = (status: string) => [...OPEN, ...DONE].find(([v]) => v === status)?.[1] ?? status;

/**
 * The two things that keep a list short, on one lead: record how it turned out,
 * and archive it (or bring it back). Both are the lead's ordinary status and
 * archive flag, so the main intake table shows the same thing.
 */
export function LeadOutcome({ leadId, status, archived, where, prompt }: { leadId: number; status: string; archived: boolean; where: string; prompt?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ ok: boolean }>) => { setErr(""); start(async () => { try { const r = await fn(); if (!r.ok) setErr("That did not save. Try again."); } catch { setErr("That did not save. Try again."); } router.refresh(); }); };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]">Outcome
        <select value={status} disabled={pending} onChange={(e) => { const v = e.target.value as Status; run(() => updateIntakeStatus(leadId, v)); }}
          className={`rounded-md border bg-[var(--c-surface)] px-2 py-1 text-xs text-[var(--c-ink)] outline-none focus:border-[var(--c-accent)] ${prompt ? "border-amber-500 ring-1 ring-amber-300" : "border-[var(--c-border)]"}`} data-testid={`outcome-${where}-${leadId}`}>
          <optgroup label="Still open">{OPEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
          <optgroup label="Finished">{DONE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
        </select>
      </label>
      <button type="button" disabled={pending} onClick={() => run(() => setIntakeArchived(leadId, !archived))} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] disabled:opacity-50" data-testid={`archive-${where}-${leadId}`}>
        {archived ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
      </button>
      {err && <span className="text-xs text-[var(--c-error,#b3261e)]" role="status">{err}</span>}
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
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">An archived lead leaves the two lists above. Nothing is deleted: tick &ldquo;Show archived&rdquo; on either list to see it or bring it back. Leads archive themselves on this schedule (enter 0 to turn a rule off):</p>
      <p className="mt-3 text-sm">
        <input type="number" min={0} max={3650} step={1} inputMode="numeric" className={num} value={a} onChange={(e) => setA(e.target.value)} aria-label="Days after an outcome" data-testid="auto-archive-outcome" /> days after an outcome is recorded <span className="text-[var(--c-ink-muted)]">(Converted, Declined, Client Declined or Referred Out)</span>
      </p>
      <p className="mt-2 text-sm">
        <input type="number" min={0} max={3650} step={1} inputMode="numeric" className={num} value={b} onChange={(e) => setB(e.target.value)} aria-label="Days with nothing happening" data-testid="auto-archive-idle" /> days with no outcome and nothing happening <span className="text-[var(--c-ink-muted)]">(never while a consultation is still ahead)</span>
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !changed || a === "" || b === ""} className="rounded-md bg-[var(--c-accent)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="auto-archive-save">{pending ? "Saving…" : "Save"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid="auto-archive-msg">{msg.text}</span>}
      </p>
    </form>
  );
}
