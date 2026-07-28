"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { saveSetting, sendDailyReviewTest } from "@/app/admin/(panel)/settings/actions";
import { DAILY_REVIEW_KEY, type DailyReviewConfig } from "@/lib/billing/daily-review-config";

export function DailyBillingReviewManager({ initial }: { initial: DailyReviewConfig }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recips, setRecips] = useState((initial.recipients ?? []).join(", "));
  const [saving, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 3500); };

  function save() {
    start(async () => {
      const cfg: DailyReviewConfig = { enabled, recipients: recips.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) };
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
        (billable and non-billable), with a button to review and revise each person&rsquo;s time in the Billing Review tab. If no time was logged that day, no email is sent.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send the 6 PM review email</label>
      <label className="block text-xs">
        <span className="mb-1 block text-[var(--c-ink-muted)]">Send to (comma-separated — leave blank to send to all full admins)</span>
        <input value={recips} onChange={(e) => setRecips(e.target.value)} placeholder="supervisor@texaslawsmith.com" className="w-full max-w-lg rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
        <button onClick={test} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:bg-[var(--c-surface2)] disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send test to me</button>
        {note && <span className="text-xs text-[var(--c-accent)]">{note}</span>}
      </div>
    </div>
  );
}
