"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";
import { SHARE_LEAD_TEAM_KEY } from "@/lib/share/settings";

type SysUser = { name: string; email: string };

/**
 * The firm "Lead team": a simple checklist of firm logins. Whoever is checked is
 * automatically emailed when a recipient (e.g. a client) uploads documents into
 * any share folder. This is the ONLY automatic upload email — when firm staff
 * upload, they're asked each time whether to notify the recipients.
 */
export function ShareLeadTeamManager({ users, initial }: { users: SysUser[]; initial: string[] }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial.map((e) => e.toLowerCase())));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Any chosen address that isn't a current system login (kept so a manual entry
  // isn't silently dropped when the user list changes).
  const known = new Set(users.map((u) => u.email.toLowerCase()));
  const extras = [...chosen].filter((e) => !known.has(e));

  function toggle(email: string, on: boolean) {
    setChosen((prev) => { const n = new Set(prev); if (on) n.add(email.toLowerCase()); else n.delete(email.toLowerCase()); return n; });
    setSaved(false);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveSetting(SHARE_LEAD_TEAM_KEY, [...chosen]);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
      else setError(res.error ?? "Save failed.");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--c-ink-muted)]">
        Check the people who should be emailed <strong>automatically</strong> whenever a client or other recipient
        uploads documents into a folder. This is the only automatic upload email — when someone at the firm uploads,
        we ask each time whether to notify the recipients.
      </p>
      {users.length === 0 ? (
        <p className="text-sm text-[var(--c-ink-muted)]">No firm logins found. Add team logins under Logins first.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {users.map((u) => {
            const on = chosen.has(u.email.toLowerCase());
            return (
              <label key={u.email} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${on ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] hover:bg-[var(--c-surface2)]"}`}>
                <input type="checkbox" checked={on} onChange={(e) => toggle(u.email, e.target.checked)} className="shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-[var(--c-ink)]">{u.name || u.email}</span>
                  {u.name && <span className="truncate text-xs text-[var(--c-ink-muted)]">{u.email}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {extras.length > 0 && (
        <p className="text-xs text-[var(--c-ink-muted)]">Also on the list (not a firm login): {extras.join(", ")}.</p>
      )}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save lead team
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {error && <span className="text-sm text-[var(--c-error)]">{error}</span>}
      </div>
    </div>
  );
}
