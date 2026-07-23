"use client";

import { useState, useTransition } from "react";
import { Plus, X, Check, Loader2, Mail } from "lucide-react";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";
import { BILLING_REMINDER_KEY, type BillingReminder } from "@/lib/billing-reminder";

export function BillingReminderManager({ initial }: { initial: BillingReminder }) {
  const [cfg, setCfg] = useState<BillingReminder>({ ...initial, recipients: initial.recipients.filter(Boolean) });
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    const e = draft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!cfg.recipients.some((x) => x.toLowerCase() === e.toLowerCase())) setCfg((c) => ({ ...c, recipients: [...c.recipients, e] }));
    setDraft("");
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveSetting(BILLING_REMINDER_KEY, cfg);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error ?? "Save failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--c-ink-muted)]">
        On the last day of each month (~4 PM Central), the billing department gets a prompt to start assembling that
        month&apos;s bills. Optionally, everyone with unbilled time entries also gets a reminder to submit their billing.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} />
        <span className="font-medium">Send the month-end billing reminders</span>
      </label>

      <div className={cfg.enabled ? "" : "pointer-events-none opacity-50"}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Billing department</p>
        {cfg.recipients.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {cfg.recipients.map((e) => (
              <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-3 py-1.5 text-sm">
                <Mail size={13} className="text-[var(--c-ink-muted)]" />
                {e}
                <button onClick={() => setCfg((c) => ({ ...c, recipients: c.recipients.filter((x) => x !== e) }))} aria-label={`Remove ${e}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]">
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--c-ink-muted)]">No billing-department recipients yet.</p>
        )}

        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="billing@texaslawsmith.com"
            className="w-full max-w-xs rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
          />
          <button onClick={add} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:bg-[var(--c-surface2)]">
            <Plus size={15} /> Add
          </button>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.notifyStaff} onChange={(e) => setCfg((c) => ({ ...c, notifyStaff: e.target.checked }))} />
          <span>Also email everyone with unbilled time entries to submit their billing</span>
        </label>
      </div>

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save reminder
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}
