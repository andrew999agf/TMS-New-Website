"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, Plus, X } from "lucide-react";
import { addAccount, renameAccount, setAccountActive } from "@/app/books/(app)/accounts/actions";
import { fmtCents, TYPE_LABEL } from "@/lib/books/money";

export type AccountRow = { id: number; number: string; name: string; type: string; subtype: string; parentId: number | null; isTrust: boolean; systemKey: string | null; active: boolean; balance: number };

const KIND_OPTIONS = [
  ["expense", "Expense"], ["income", "Income"], ["bank", "Bank account (asset)"], ["asset", "Other asset"], ["fixed_asset", "Fixed asset"],
  ["credit_card", "Credit card (liability)"], ["liability", "Other liability"], ["equity", "Equity"],
] as const;

export function AccountsManager({ rows, base, canEdit }: { rows: AccountRow[]; base: string; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [form, setForm] = useState({ number: "", name: "", kind: "expense" });
  const [showInactive, setShowInactive] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) => { setMsg(null); start(async () => { const r = await fn(); if (r.ok) { done?.(); router.refresh(); } else setMsg({ ok: false, text: r.error }); }); };
  const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
  const shown = rows.filter((r) => showInactive || r.active);

  return (
    <div>
      {canEdit && (
        <form className="mt-5 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" onSubmit={(e) => { e.preventDefault(); run(() => addAccount(form), () => { setForm({ number: "", name: "", kind: form.kind }); setMsg({ ok: true, text: "Account added." }); }); }} data-testid="acct-add-form">
          <label className="text-xs">Number<input className={`${input} mt-1 block w-24 font-mono`} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="6150" inputMode="numeric" data-testid="acct-new-number" /></label>
          <label className="min-w-[14rem] flex-1 text-xs">Name<input className={`${input} mt-1 block w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Postage and delivery" data-testid="acct-new-name" /></label>
          <label className="text-xs">Kind<select className={`${input} mt-1 block`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="acct-new-kind">{KIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="acct-add"><Plus size={14} /> Add account</button>
        </form>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="acct-msg">{msg.text}</p>}
      <label className="mt-4 flex items-center gap-2 text-xs text-[var(--c-ink-muted)]"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive accounts</label>
      {(["asset", "liability", "equity", "income", "expense"] as const).map((t) => (
        <section key={t} className="mt-5">
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-ink-muted)]">{TYPE_LABEL[t]}</h2>
          <table className="w-full text-sm">
            <tbody>
              {shown.filter((r) => r.type === t).map((r) => (
                <tr key={r.id} className={`border-t border-[var(--c-border)] ${r.active ? "" : "opacity-50"}`} data-testid={`acct-${r.number}`}>
                  <td className="w-20 py-1.5 font-mono text-xs text-[var(--c-ink-muted)]">{r.number}</td>
                  <td className={`py-1.5 ${r.parentId ? "pl-5" : ""}`}>
                    {edit === r.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input className={`${input} w-64`} value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="acct-rename-input" />
                        <button type="button" disabled={pending} onClick={() => run(() => renameAccount({ id: r.id, name }), () => setEdit(null))} className="rounded p-1 hover:bg-[var(--c-bg)]" aria-label="Save name" data-testid="acct-rename-save"><Check size={14} /></button>
                        <button type="button" onClick={() => setEdit(null)} className="rounded p-1 hover:bg-[var(--c-bg)]" aria-label="Cancel"><X size={14} /></button>
                      </span>
                    ) : (
                      <>
                        <Link href={`${base}/reports?r=gl&account=${r.id}`} className="hover:underline">{r.name}</Link>
                        {r.isTrust && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">TRUST</span>}
                        {!r.active && <span className="ml-2 text-[10px] uppercase text-[var(--c-ink-muted)]">inactive</span>}
                      </>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-[11px] text-[var(--c-ink-muted)]">{r.subtype.replace(/_/g, " ")}</td>
                  <td className="w-32 py-1.5 text-right font-mono text-xs" data-testid={`acct-bal-${r.number}`}>{fmtCents(r.balance, { paren: true, blankZero: true })}</td>
                  {canEdit && (
                    <td className="w-40 py-1.5 text-right text-xs">
                      {edit !== r.id && <button type="button" onClick={() => { setEdit(r.id); setName(r.name); }} className="mr-2 inline-flex items-center gap-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" data-testid={`acct-rename-${r.number}`}><Pencil size={11} /> Rename</button>}
                      {!r.systemKey && <button type="button" disabled={pending} onClick={() => run(() => setAccountActive({ id: r.id, active: !r.active }))} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" data-testid={`acct-toggle-${r.number}`}>{r.active ? "Make inactive" : "Reactivate"}</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
