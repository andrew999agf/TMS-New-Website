"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Trash2, UserPlus } from "lucide-react";
import { updateCompany, addUser, removeUser, setRuleVerified } from "@/app/books/(app)/settings/actions";
import { ENTITY_TYPES, TAX_ELECTIONS, US_STATES } from "@/lib/books/seed";

export type CompanyForm = { name: string; legalName: string; dba: string; ein: string; entityType: string; taxElection: string; state: string; formationState: string; fiscalYearStartMonth: number; addressLine: string; city: string; addressState: string; zip: string; phone: string; email: string; operatingBankName: string; operatingLast4: string; ioltaBankName: string; ioltaLast4: string };
export type UserRow = { id: number; email: string; name: string; role: string; lastLoginAt: string | null; me: boolean };
export type RuleRow = { id: number; jurisdiction: string; key: string; label: string; value: unknown; unit: string; source: string; note: string; verified: boolean; verifiedBy: string | null };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CompanySettings({ company, users, rules, owner }: { company: CompanyForm; users: UserRow[]; rules: RuleRow[]; owner: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<CompanyForm>(company);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nu, setNu] = useState({ email: "", name: "", password: "", role: "bookkeeper" as "owner" | "bookkeeper" | "viewer" });
  const set = (k: keyof CompanyForm, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const save = () => { setMsg(null); setError(null); start(async () => { const r = await updateCompany(f); if (r.ok) { setMsg("Saved."); router.refresh(); } else setError(r.error); }); };
  const field = (label: string, k: keyof CompanyForm, extra?: React.ReactNode) => (
    <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">{label}</span>{extra ?? <input value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value)} disabled={!owner} className={input} data-testid={`co-${k}`} />}</label>
  );
  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="text-sm font-semibold">Company profile</h2>
        <p className="mt-0.5 text-[11px] text-[var(--c-ink-muted)]">Defaults are the firm&apos;s. Every value here is a setting, never code — a second company is a second record.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {field("Short name", "name")}
          {field("Legal name", "legalName")}
          {field("DBA (if any)", "dba")}
          {field("EIN", "ein")}
          {field("Entity type", "entityType", <select value={f.entityType} onChange={(e) => set("entityType", e.target.value)} disabled={!owner} className={input} data-testid="co-entityType">{ENTITY_TYPES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>)}
          {field("Taxed as (election)", "taxElection", <select value={f.taxElection} onChange={(e) => set("taxElection", e.target.value)} disabled={!owner} className={input} data-testid="co-taxElection">{TAX_ELECTIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>)}
          {field("Home state (payroll and filings)", "state", <select value={f.state} onChange={(e) => set("state", e.target.value)} disabled={!owner} className={input}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>)}
          {field("Formation state", "formationState", <select value={f.formationState} onChange={(e) => set("formationState", e.target.value)} disabled={!owner} className={input}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>)}
          {field("Fiscal year starts", "fiscalYearStartMonth", <select value={f.fiscalYearStartMonth} onChange={(e) => set("fiscalYearStartMonth", Number(e.target.value))} disabled={!owner} className={input}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>)}
          {field("Phone", "phone")}
          {field("Mailing address", "addressLine")}
          {field("City", "city")}
          {field("State", "addressState", <select value={f.addressState} onChange={(e) => set("addressState", e.target.value)} disabled={!owner} className={input}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>)}
          {field("ZIP", "zip")}
          {field("Email", "email")}
        </div>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">Bank accounts (names only — the site holds no credentials)</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {field("Operating account bank", "operatingBankName")}
          {field("Operating last 4", "operatingLast4")}
          {field("IOLTA account bank", "ioltaBankName")}
          {field("IOLTA last 4", "ioltaLast4")}
        </div>
        {owner && <div className="mt-4 flex items-center gap-3"><button onClick={save} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50" data-testid="co-save">{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>{msg && <span className="text-xs text-emerald-700">{msg}</span>}{error && <span className="text-xs text-red-600">{error}</span>}</div>}
      </section>

      <section className={card} id="users">
        <h2 className="text-sm font-semibold">Logins</h2>
        <p className="mt-0.5 text-[11px] text-[var(--c-ink-muted)]">Separate from the admin site. Every sign-in needs the password and an emailed code. Owner: everything. Bookkeeper: enter and reconcile. Viewer: read reports.</p>
        <ul className="mt-3 divide-y divide-[var(--c-border)]">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1"><span className="font-medium">{u.name || u.email}</span>{u.name && <span className="text-[var(--c-ink-muted)]"> · {u.email}</span>}<span className="ml-2 rounded-full border border-[var(--c-border)] px-1.5 py-0.5 text-[10px] uppercase">{u.role}</span>{u.me && <span className="ml-1 text-[10px] text-[var(--c-ink-muted)]">(you)</span>}</span>
              <span className="text-[11px] text-[var(--c-ink-muted)]">{u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleDateString("en-US")}` : "never signed in"}</span>
              {owner && !u.me && <button onClick={() => { if (confirm(`Remove ${u.email} from this company?`)) start(async () => { const r = await removeUser(u.id); if (!r.ok) setError(r.error); router.refresh(); }); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
        {owner && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_120px_auto]">
            <input value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="email" className={input} data-testid="nu-email" />
            <input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="name" className={input} />
            <input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} type="password" placeholder="password (12+ characters)" className={input} data-testid="nu-password" />
            <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as typeof nu.role })} className={input}><option value="bookkeeper">Bookkeeper</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
            <button onClick={() => start(async () => { const r = await addUser(nu); if (r.ok) { setNu({ email: "", name: "", password: "", role: "bookkeeper" }); setMsg(r.created ? "Login added." : "Password reset."); router.refresh(); } else setError(r.error); })} disabled={pending || !nu.email || nu.password.length < 12} className="btn btn-accent text-sm disabled:opacity-50" data-testid="nu-add"><UserPlus size={14} /> Add</button>
          </div>
        )}
      </section>

      <section className={card} id="tax-rules">
        <h2 className="text-sm font-semibold">Tax rules · {new Date().getFullYear()}</h2>
        <p className="mt-0.5 text-[11px] text-[var(--c-ink-muted)]">The numbers that change on a schedule, each with its source. Confirm each one against the source once a year; anything unconfirmed is flagged on the dashboard. Payroll math reads these and nothing else.</p>
        {(["federal", ...Array.from(new Set(rules.filter((r) => r.jurisdiction !== "federal").map((r) => r.jurisdiction)))] as string[]).map((j) => (
          <div key={j} className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">{j === "federal" ? "Federal" : j}</h3>
            <table className="mt-1 w-full text-xs">
              <tbody>
                {rules.filter((r) => r.jurisdiction === j).map((r) => (
                  <tr key={r.id} className="border-t border-[var(--c-border)] align-top" data-testid={`rule-${r.key}`}>
                    <td className="py-1.5 pr-2"><span className="font-medium">{r.label}</span>{r.note && <span className="block text-[11px] text-[var(--c-ink-muted)]">{r.note}</span>}<a href={r.source.startsWith("http") ? r.source : undefined} target="_blank" rel="noreferrer" className="block truncate text-[10px] text-[var(--c-accent)]">{r.source}</a></td>
                    <td className="w-40 py-1.5 font-mono">{r.value === null ? <span className="text-amber-700">not set</span> : Array.isArray(r.value) ? r.value.join(", ") : String(r.value)}{r.unit === "rate" && typeof r.value === "number" ? ` (${(r.value * 100).toFixed(2)}%)` : ""}</td>
                    <td className="w-28 py-1.5 text-right">
                      {owner ? (
                        <button onClick={() => start(async () => { await setRuleVerified(r.id, !r.verified); router.refresh(); })} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} title={r.verified ? `Confirmed by ${r.verifiedBy ?? ""} — click to unconfirm` : "Click once you have checked it against the source"}>{r.verified ? "confirmed" : "confirm"}</button>
                      ) : <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{r.verified ? "confirmed" : "unconfirmed"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
