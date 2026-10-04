"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Mail, Send, X } from "lucide-react";
import { getProductionDistribution, emailProduction } from "@/app/admin/(panel)/discovery-reviewer/actions";

const area = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)] font-mono";

/**
 * "Email to counsel" for a production: To = the other side's counsel of
 * record, CC = everyone else on the case's Counsel of Record lists (our side
 * included). Both lines are editable before sending.
 */
export function EmailToCounsel({ productionId, draft, emailedAt, compact, onSent }: {
  productionId: number;
  /** Still a draft → offer "mark as produced" on send. */
  draft: boolean;
  emailedAt?: string | null;
  compact?: boolean;
  /** Sending can mark the draft produced, which unmounts this panel — the
   *  parent shows the confirmation instead. */
  onSent?: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [mark, setMark] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function begin() {
    setOpen(true);
    setError(null);
    setDone(null);
    setLoading(true);
    const r = await getProductionDistribution(productionId).catch(() => null);
    setLoading(false);
    if (!r || !r.ok) { setError(r && !r.ok ? r.error ?? "Couldn't load the case's counsel." : "Couldn't load the case's counsel."); return; }
    setTo(r.to.join("\n"));
    setCc(r.cc.join("\n"));
    setMissing(r.missing);
    setCaseId(r.caseId);
  }

  const lines = (s: string) => s.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);

  async function send() {
    const toList = lines(to);
    const ccList = lines(cc);
    if (!toList.length) { setError("Add opposing counsel on the To line."); return; }
    if (!confirm(`Email this production to ${toList.length} recipient${toList.length === 1 ? "" : "s"}${ccList.length ? `, copying ${ccList.length}` : ""}?`)) return;
    setSending(true);
    setError(null);
    const r = await emailProduction(productionId, { to: toList, cc: ccList, markProduced: draft && mark }).catch(() => null);
    setSending(false);
    if (!r) { setError("NOT SENT — the request failed. Try again."); return; }
    if (!r.ok) { setError(r.error ?? "NOT SENT."); return; }
    const msg = `Emailed to ${r.to} recipient${r.to === 1 ? "" : "s"}${r.cc ? `, ${r.cc} cc'd` : ""}.${r.productionAttached ? " Letter and production PDF attached." : " Letter attached; the production went by link (too large to attach)."}`;
    if (onSent) { onSent(msg); setOpen(false); } else setDone(msg);
    router.refresh();
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <button onClick={() => void begin()}
          className={compact ? "inline-flex items-center gap-1 text-[var(--c-accent)] hover:underline" : "btn btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3"}>
          <Mail size={compact ? 11 : 13} /> {emailedAt ? "Email again" : "Email to counsel"}
        </button>
        {emailedAt && !compact && <span className="text-xs text-[var(--c-ink-muted)]">emailed {new Date(emailedAt).toLocaleDateString()}</span>}
      </span>
    );
  }

  return (
    <div className="mt-3 w-full basis-full rounded-md border border-[var(--c-accent)]/50 bg-[var(--c-surface)] p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Email to counsel</span>
        <button onClick={() => setOpen(false)} className="text-[var(--c-ink-muted)]" aria-label="Close"><X size={16} /></button>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-[var(--c-ink-muted)]"><Loader2 size={14} className="animate-spin" /> Loading the case&apos;s counsel of record…</p>
      ) : done ? (
        <p className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300"><Check size={15} className="mt-0.5 shrink-0" /> {done}</p>
      ) : (
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">To — opposing counsel of record (one per line)</span>
            <textarea value={to} onChange={(e) => setTo(e.target.value)} rows={Math.max(2, lines(to).length)} className={area} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">CC — everyone else on the case, our side included</span>
            <textarea value={cc} onChange={(e) => setCc(e.target.value)} rows={Math.max(2, lines(cc).length)} className={area} />
          </label>
          {(missing.length > 0 || !lines(to).length) && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {!lines(to).length && <>No opposing counsel with an email is on file. </>}
              {missing.length > 0 && <>No email on file for: {missing.join("; ")}. </>}
              {caseId ? <Link href={`/admin/cases/${caseId}`} className="font-semibold underline">Fix it under Matters / Cases → Parties → Counsel of Record</Link> : "Set up the case under Matters / Cases to fill these in automatically."}
            </p>
          )}
          <p className="text-xs text-[var(--c-ink-muted)]">The cover letter PDF is attached; the production PDF rides along when it&apos;s under 15 MB, and the link is always in the email.</p>
          {draft && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} className="accent-[var(--c-accent)]" />
              Mark as produced once it sends
            </label>
          )}
          {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} disabled={sending} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
            <button onClick={() => void send()} disabled={sending || !lines(to).length} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
