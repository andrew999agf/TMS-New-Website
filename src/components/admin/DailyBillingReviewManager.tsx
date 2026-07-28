"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Loader2, Send, X, UserPlus } from "lucide-react";
import { saveSetting, sendDailyReviewTest } from "@/app/admin/(panel)/settings/actions";
import { DAILY_REVIEW_KEY, type DailyReviewConfig } from "@/lib/billing/daily-review-config";

type SysUser = { name: string; email: string };

/** Tag/chip picker limited to system users — type to search, tap to add. */
function UserTagPicker({ users, value, onChange }: { users: SysUser[]; value: string[]; onChange: (emails: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function d(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d); }, []);

  const chosen = new Set(value.map((e) => e.toLowerCase()));
  const byEmail = useMemo(() => new Map(users.map((u) => [u.email.toLowerCase(), u])), [users]);
  const suggestions = useMemo(() => {
    if (!open) return [];
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => u.email && !chosen.has(u.email.toLowerCase()))
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q, open, value]);

  const add = (email: string) => { const e = email.trim().toLowerCase(); if (e && !chosen.has(e)) onChange([...value, e]); setQ(""); setOpen(false); };
  const remove = (email: string) => onChange(value.filter((x) => x.toLowerCase() !== email.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5">
        {value.map((email) => {
          const u = byEmail.get(email.toLowerCase());
          return (
            <span key={email} className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-2 py-0.5 text-xs">
              {u?.name || email}
              <button type="button" onClick={() => remove(email)} aria-label={`Remove ${email}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={12} /></button>
            </span>
          );
        })}
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) { e.preventDefault(); add(suggestions[0].email); } else if (e.key === "Backspace" && !q && value.length) { remove(value[value.length - 1]); } }}
          placeholder={value.length ? "Add another…" : "Type a name to add…"}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
          {suggestions.map((u) => (
            <button key={u.email} type="button" onClick={() => add(u.email)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--c-surface2)]">
              <UserPlus size={13} className="shrink-0 text-[var(--c-ink-muted)]" />
              <span className="min-w-0"><span className="block truncate text-sm text-[var(--c-ink)]">{u.name || u.email}</span>{u.name && <span className="block truncate text-[11px] text-[var(--c-ink-muted)]">{u.email}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DailyBillingReviewManager({ initial, users }: { initial: DailyReviewConfig; users: SysUser[] }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [emails, setEmails] = useState<string[]>(initial.recipients ?? []);
  const [saving, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 3500); };

  function save() {
    start(async () => {
      const cfg: DailyReviewConfig = { enabled, recipients: emails.map((s) => s.trim().toLowerCase()).filter(Boolean) };
      const res = await saveSetting(DAILY_REVIEW_KEY, cfg);
      flash(res.ok ? "Saved." : res.error ?? "Couldn't save.");
    });
  }
  async function test() {
    setBusy(true);
    const res = await sendDailyReviewTest();
    setBusy(false);
    flash(res.ok ? `Test sent to ${res.to}.` : res.error ?? "Couldn't send test.");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--c-ink-muted)]">
        At <strong>6:00 PM Central</strong> each day, the billing supervisor gets an email summarizing that day&rsquo;s live time entries per person
        (billable and non-billable), with a button to review and revise each person&rsquo;s time. If no time was logged that day, no email is sent.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send the 6 PM review email</label>
      <div className="max-w-lg">
        <span className="mb-1 block text-xs text-[var(--c-ink-muted)]">Send to (pick system users — leave empty to send to all full admins)</span>
        <UserTagPicker users={users} value={emails} onChange={setEmails} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
        <button onClick={test} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:bg-[var(--c-surface2)] disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send test to me</button>
        {note && <span className="text-xs text-[var(--c-accent)]">{note}</span>}
      </div>
    </div>
  );
}
