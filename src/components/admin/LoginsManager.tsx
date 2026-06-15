"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, KeyRound, Check } from "lucide-react";
import { createLogin, resetLoginPassword, updateLoginRole, deleteLogin } from "@/app/admin/(panel)/logins/actions";

type Login = { id: number; name: string; email: string; role: string; lastLoginAt: string | null };
type Role = "owner" | "editor" | "timekeeper";
const ROLES: Role[] = ["timekeeper", "editor", "owner"];
const roleLabel: Record<string, string> = { timekeeper: "Timekeeper (Time Tracker only)", editor: "Editor (full admin)", owner: "Owner (full admin)" };

export function LoginsManager({ initial, selfId }: { initial: Login[]; selfId: number }) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "timekeeper" as Role, password: "" });
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]";

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createLogin(form);
      if (res.ok) { setForm({ name: "", email: "", role: "timekeeper", password: "" }); setAdding(false); }
      else setError(res.error ?? "Failed");
    });
  }

  function reset(id: number) {
    const pw = prompt("Enter a new password for this login (min 8 characters):");
    if (!pw) return;
    startTransition(async () => {
      const res = await resetLoginPassword(id, pw);
      if (!res.ok) alert(res.error ?? "Failed");
      else alert("Password updated.");
    });
  }

  return (
    <div className="max-w-3xl">
      {!adding ? (
        <button onClick={() => setAdding(true)} className="btn btn-accent text-sm py-2.5 px-4"><Plus size={16} /> Add login</button>
      ) : (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={cls} placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className={cls} placeholder="email@texaslawsmith.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <select className={cls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
            <input className={cls} type="text" placeholder="Temporary password (min 8 chars)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
          <div className="flex gap-2">
            <button onClick={add} disabled={pending} className="btn btn-accent text-sm py-2 px-4"><Check size={15} /> Create</button>
            <button onClick={() => { setAdding(false); setError(null); }} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          </div>
          <p className="text-xs text-[var(--c-ink-muted)]">Share the temporary password with the user; they sign in at /admin/login. (You can reset it anytime.)</p>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
        {initial.map((u) => (
          <div key={u.id} className="bg-[var(--c-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{u.name} {u.id === selfId && <span className="text-xs text-[var(--c-ink-muted)]">(you)</span>}</div>
              <div className="text-xs text-[var(--c-ink-muted)] truncate">{u.email}{u.lastLoginAt ? ` · last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : " · never signed in"}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={u.role}
                disabled={u.id === selfId || pending}
                onChange={(e) => startTransition(() => { void updateLoginRole(u.id, e.target.value as Role); })}
                className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-xs"
                title={u.id === selfId ? "You can't change your own role" : "Change role"}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => reset(u.id)} disabled={pending} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Reset password"><KeyRound size={16} /></button>
              <button
                onClick={() => { if (u.id !== selfId && confirm(`Delete login for ${u.email}?`)) startTransition(() => { void deleteLogin(u.id); }); }}
                disabled={u.id === selfId || pending}
                className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)] disabled:opacity-30"
                title={u.id === selfId ? "You can't delete yourself" : "Delete login"}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
