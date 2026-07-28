"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, X, Check, Loader2, Mail, Send, UserPlus } from "lucide-react";
import { saveSetting, sendDailyReviewTest } from "@/app/admin/(panel)/settings/actions";
import { DAILY_REVIEW_KEY, type DailyReviewConfig } from "@/lib/billing/daily-review-config";

type SysUser = { name: string; email: string };

export function DailyBillingReviewManager({ initial, users }: { initial: DailyReviewConfig; users: SysUser[] }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipients, setRecipients] = useState<string[]>((initial.recipients ?? []).filter(Boolean));
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { function d(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); } document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d); }, []);

  const nameOf = useMemo(() => new Map(users.map((u) => [u.email.toLowerCase(), u.name])), [users]);
  const chosen = new Set(recipients.map((e) => e.toLowerCase()));
  const suggestions = useMemo(() => {
    if (!open) return [];
    const q = draft.trim().toLowerCase();
    return users
      .filter((u) => u.email && !chosen.has(u.email.toLowerCase()))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, draft, open, recipients]);

  function addEmail(email: string) {
    const e = email.trim().toLowerCase();
    if (e && !chosen.has(e)) setRecipients((r) => [...r, e]);
    setDraft("");
    setOpen(false);
    setError(null);
  }
  function add() {
    const q = draft.trim().toLowerCase();
    // Only a real system user can be added — no random addresses.
    const match = users.find((u) => u.email.toLowerCase() === q || u.name.toLowerCase() === q) ?? (suggestions.length === 1 ? suggestions[0] : undefined);
    if (!match) { setError("Pick a system user from the list — only users of the system can be added."); return; }
    addEmail(match.email);
  }
  function remove(email: string) { setRecipients((r) => r.filter((x) => x.toLowerCase() !== email.toLowerCase())); }

  function save() {
    setError(null);
    start(async () => {
      const cfg: DailyReviewConfig = { enabled, recipients };
      const res = await saveSetting(DAILY_REVIEW_KEY, cfg);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); } else setError(res.error ?? "Save failed.");
    });
  }
  async function test() {
    setBusy(true); setNote(null); setError(null);
    const res = await sendDailyReviewTest();
    setBusy(false);
    if (res.ok) setNote(`Test sent to ${res.to}.`); else setError(res.error ?? "Couldn't send test.");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--c-ink-muted)]">
        At <strong>6:00 PM Central</strong> each day, the billing supervisor gets an email summarizing that day&rsquo;s live time entries per person
        (billable and non-billable), with a button to review and revise each person&rsquo;s time. If no time was logged that day, no email is sent.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="font-medium">Send the 6 PM review email</span>
      </label>

      <div className={enabled ? "" : "pointer-events-none opacity-50"}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Send to (system users only)</p>
        {recipients.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {recipients.map((e) => (
              <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-3 py-1.5 text-sm">
                <Mail size={13} className="text-[var(--c-ink-muted)]" />
                {nameOf.get(e.toLowerCase()) || e}
                <button onClick={() => remove(e)} aria-label={`Remove ${e}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={14} /></button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--c-ink-muted)]">No recipients yet — the email goes to all full admins.</p>
        )}

        <div className="mt-2 flex gap-2">
          <div ref={boxRef} className="relative w-full max-w-xs">
            <input
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="Type a user's name…"
              autoComplete="off"
              className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
                {suggestions.map((u) => (
                  <button key={u.email} type="button" onClick={() => addEmail(u.email)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--c-surface2)]">
                    <UserPlus size={13} className="shrink-0 text-[var(--c-ink-muted)]" />
                    <span className="min-w-0"><span className="block truncate text-sm text-[var(--c-ink)]">{u.name || u.email}</span>{u.name && <span className="block truncate text-[11px] text-[var(--c-ink-muted)]">{u.email}</span>}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={add} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:bg-[var(--c-surface2)]"><Plus size={15} /> Add</button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      {note && <p className="text-sm text-green-600">{note}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        <button onClick={test} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)] disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send test to me</button>
      </div>
    </div>
  );
}
