"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Trash2, UserPlus, Pencil, Mail, KeyRound, X, Star } from "lucide-react";
import { updateCompany, addUser, removeUser, setRuleVerified, updateUser, setUserPassword, sendSetupLink, dismissAccessRequest, setPrimaryAdmin } from "@/app/books/(app)/settings/actions";
import { ENTITY_TYPES, TAX_ELECTIONS, US_STATES } from "@/lib/books/seed";

export type CompanyForm = { name: string; legalName: string; dba: string; ein: string; entityType: string; taxElection: string; state: string; formationState: string; fiscalYearStartMonth: number; addressLine: string; city: string; addressState: string; zip: string; phone: string; email: string; operatingBankName: string; operatingLast4: string; ioltaBankName: string; ioltaLast4: string };
export type UserRow = { id: number; email: string; name: string; role: string; lastLoginAt: string | null; me: boolean; primary: boolean };
export type RequestRow = { id: number; email: string; name: string; adminRole: string; createdAt: string };
export type RuleRow = { id: number; jurisdiction: string; key: string; label: string; value: unknown; unit: string; source: string; note: string; verified: boolean; verifiedBy: string | null };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CompanySettings({ company, users, rules, requests, owner }: { company: CompanyForm; users: UserRow[]; rules: RuleRow[]; requests: RequestRow[]; owner: boolean }) {
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
        <p className="mt-0.5 text-[11px] text-[var(--c-ink-muted)]">Separate from the admin site. Every sign-in needs the password and an emailed code. Owner: everything. Bookkeeper: enter and reconcile. Viewer: read reports. The <Star size={10} className="inline" /> primary admin receives access requests from the admin site; nobody creates their own login.</p>
        {owner && requests.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3" data-testid="access-requests">
            <p className="text-xs font-semibold text-amber-900">Waiting for a login</p>
            <ul className="mt-1 divide-y divide-amber-200">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs" data-testid={`req-${r.id}`}>
                  <span className="min-w-0 flex-1"><span className="font-medium">{r.name || r.email}</span>{r.name && <span className="text-[var(--c-ink-muted)]"> · {r.email}</span>}<span className="text-[var(--c-ink-muted)]"> · admin {r.adminRole || "account"} · asked {new Date(r.createdAt).toLocaleDateString("en-US")}</span></span>
                  <button onClick={() => { setNu({ email: r.email, name: r.name, password: "", role: "bookkeeper" }); document.getElementById("nu-password")?.focus(); }} className="rounded-md border border-[var(--c-border)] bg-white px-2 py-1 text-[11px] hover:border-[var(--c-accent)]" data-testid={`req-add-${r.id}`}><UserPlus size={11} className="mr-1 inline" />Add login</button>
                  <button onClick={() => { setMsg(null); setError(null); start(async () => { const x = await dismissAccessRequest(r.id); if (x.ok) { setMsg("Request dismissed."); router.refresh(); } else setError(x.error); }); }} disabled={pending} className="rounded-md border border-[var(--c-border)] bg-white px-2 py-1 text-[11px] hover:border-red-400 disabled:opacity-50" data-testid={`req-dismiss-${r.id}`}>Dismiss</button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-amber-900/80">&ldquo;Add login&rdquo; fills the form below with their details — pick the role, type a password or email them a set-password link after adding.</p>
          </div>
        )}
        <ul className="mt-3 divide-y divide-[var(--c-border)]">
          {users.map((u) => <LoginRow key={u.id} u={u} owner={owner} onMsg={setMsg} onError={setError} />)}
        </ul>
        {owner && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_120px_auto]">
            <input value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="email" className={input} data-testid="nu-email" />
            <input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="name" className={input} />
            <input id="nu-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} type="password" placeholder="password (12+ characters)" className={input} data-testid="nu-password" />
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


/** One login: edit name / email / role in place, set a password, email a set-password link, remove. */
function LoginRow({ u, owner, onMsg, onError }: { u: UserRow; owner: boolean; onMsg: (m: string | null) => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: u.name, email: u.email, role: u.role as "owner" | "bookkeeper" | "viewer" });
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => { onMsg(null); onError(null); start(async () => { const r = await fn(); if (r.ok) { onMsg(okMsg); router.refresh(); } else onError(r.error ?? "Couldn't do that."); }); };
  return (
    <li className="py-2 text-sm" data-testid={`login-${u.id}`}>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1"><span className="font-medium">{u.name || u.email}</span>{u.name && <span className="text-[var(--c-ink-muted)]"> · {u.email}</span>}<span className="ml-2 rounded-full border border-[var(--c-border)] px-1.5 py-0.5 text-[10px] uppercase">{u.role}</span>{u.primary && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[10px] uppercase text-[var(--c-accent)]" title="Receives access requests from the admin site" data-testid={`login-primary-${u.id}`}><Star size={9} /> primary admin</span>}{u.me && <span className="ml-1 text-[10px] text-[var(--c-ink-muted)]">(you)</span>}</span>
          <span className="text-[11px] text-[var(--c-ink-muted)]">{u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleDateString("en-US")}` : "never signed in"}</span>
          {owner && (
            <>
              {u.role === "owner" && !u.primary && <button onClick={() => { if (confirm(`Make ${u.name || u.email} the primary admin? Access requests from the admin site will go to them.`)) run(() => setPrimaryAdmin(u.id), `${u.name || u.email} is now the primary admin.`); }} disabled={pending} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] hover:border-[var(--c-accent)] disabled:opacity-50" title="Access requests from the admin site go to the primary admin" data-testid={`login-make-primary-${u.id}`}><Star size={11} className="mr-1 inline" />Make primary</button>}
              <button onClick={() => { setF({ name: u.name, email: u.email, role: u.role as typeof f.role }); setEditing(true); }} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] hover:border-[var(--c-accent)]" title="Edit name, email or role" data-testid={`login-edit-${u.id}`}><Pencil size={11} className="mr-1 inline" />Edit</button>
              <button onClick={() => run(() => sendSetupLink(u.id), `Set-password link emailed to ${u.email} (good for one hour).`)} disabled={pending} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] hover:border-[var(--c-accent)] disabled:opacity-50" title="Email them a link to choose their own password (works for one hour; send again any time)" data-testid={`login-link-${u.id}`}><Mail size={11} className="mr-1 inline" />Email set-password link</button>
              <button onClick={() => { setPw(""); setPwOpen((o) => !o); }} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] hover:border-[var(--c-accent)]" title="Type a password for them yourself" data-testid={`login-pw-${u.id}`}><KeyRound size={11} className="mr-1 inline" />Set password</button>
              {!u.me && <button onClick={() => { if (confirm(`Remove ${u.email} from this company?`)) run(() => removeUser(u.id), `${u.email} removed.`); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove from this company"><Trash2 size={13} /></button>}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="name" className={input} data-testid={`login-name-${u.id}`} />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="email" className={input} data-testid={`login-email-${u.id}`} />
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })} className={input} data-testid={`login-role-${u.id}`}><option value="owner">Owner</option><option value="bookkeeper">Bookkeeper</option><option value="viewer">Viewer</option></select>
          <span className="flex gap-1">
            <button onClick={() => run(async () => { const r = await updateUser(u.id, f); if (r.ok) setEditing(false); return r; }, "Login updated.")} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50" data-testid={`login-save-${u.id}`}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}</button>
            <button onClick={() => setEditing(false)} className="rounded-md border border-[var(--c-border)] px-2 text-sm"><X size={14} /></button>
          </span>
        </div>
      )}
      {pwOpen && owner && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="new password (12+ characters)" className={`${input} max-w-xs`} data-testid={`login-newpw-${u.id}`} />
          <button onClick={() => run(async () => { const r = await setUserPassword(u.id, pw); if (r.ok) { setPwOpen(false); setPw(""); } return r; }, `Password set for ${u.email} — hand it over in person, not by email.`)} disabled={pending || pw.length < 12} className="btn btn-accent text-sm disabled:opacity-50" data-testid={`login-newpw-save-${u.id}`}>Save password</button>
          <button onClick={() => setPwOpen(false)} className="text-xs text-[var(--c-ink-muted)]">cancel</button>
        </div>
      )}
    </li>
  );
}
