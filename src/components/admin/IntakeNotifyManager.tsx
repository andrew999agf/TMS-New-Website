"use client";

import { useState, useTransition } from "react";
import { Plus, X, Check, Loader2, Mail } from "lucide-react";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";

/** Must match the key read in the intake actions. */
export const INTAKE_NOTIFY_KEY = "intake.statusNotify";

export function IntakeNotifyManager({ initial }: { initial: string[] }) {
  const [emails, setEmails] = useState<string[]>(initial.filter(Boolean));
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
    if (!emails.some((x) => x.toLowerCase() === e.toLowerCase())) setEmails([...emails, e]);
    setDraft("");
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveSetting(INTAKE_NOTIFY_KEY, emails);
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
        These people get a short email whenever an intake&apos;s status changes or it&apos;s archived. The subject line says
        who, what matter, and the change — so they usually don&apos;t need to open it.
      </p>

      {emails.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {emails.map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-3 py-1.5 text-sm">
              <Mail size={13} className="text-[var(--c-ink-muted)]" />
              {e}
              <button onClick={() => setEmails(emails.filter((x) => x !== e))} aria-label={`Remove ${e}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]">
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--c-ink-muted)]">No recipients — status-change emails are off.</p>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="name@texaslawsmith.com"
          className="w-full max-w-xs rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
        />
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm hover:bg-[var(--c-surface2)]">
          <Plus size={15} /> Add
        </button>
      </div>

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save recipients
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}
