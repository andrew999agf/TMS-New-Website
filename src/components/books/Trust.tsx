"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Plus } from "lucide-react";
import { addClient, recordDeposit, recordDisbursement, recordFeeTransfer, setClientActive } from "@/app/books/(app)/trust/actions";
import { voidEntryAction } from "@/app/books/(app)/journal/actions";
import { fmtCents } from "@/lib/books/money";

export type TrustClient = { id: number; name: string; matter: string; reference: string; active: boolean; balance: number };
export type TrustLine = { entryId: number; date: string; kind: string; memo: string; payee: string; ref: string; in: number; out: number; balance: number; createdBy: string };

type Res = { ok: true } | { ok: false; error: string };
const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const KIND: Record<string, string> = { deposit: "Deposit", disbursement: "Disbursement", fee_transfer: "To operating" };

export function ClientList({ clients, base, selected, canEdit }: { clients: TrustClient[]; base: string; selected: number | null; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", matter: "", reference: "" });
  const [showClosed, setShowClosed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = clients.filter((c) => showClosed || c.active || c.balance !== 0);
  return (
    <div data-testid="trust-clients">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="pb-1 font-medium">Client</th><th className="pb-1 font-medium">Matter</th><th className="w-36 pb-1 text-right font-medium">Held in trust</th></tr></thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={3} className="py-3 text-sm text-[var(--c-ink-muted)]" data-testid="trust-no-clients">No client ledgers yet. Add the first client below.</td></tr>}
          {shown.map((c) => (
            <tr key={c.id} className={`border-t border-[var(--c-border)] ${selected === c.id ? "bg-[var(--c-bg)]" : ""} ${c.active ? "" : "opacity-60"}`} data-testid={`trust-client-${c.id}`}>
              <td className="py-1.5"><Link href={`${base}/trust?client=${c.id}`} className="font-medium hover:underline">{c.name}</Link>{!c.active && <span className="ml-2 text-[10px] uppercase text-[var(--c-ink-muted)]">closed</span>}</td>
              <td className="py-1.5 text-[var(--c-ink-muted)]">{c.matter}{c.reference ? ` · ${c.reference}` : ""}</td>
              <td className={`py-1.5 text-right font-mono text-xs ${c.balance < 0 ? "font-semibold text-red-700" : ""}`} data-testid={`trust-bal-${c.id}`}>{fmtCents(c.balance, { paren: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="mt-2 flex items-center gap-2 text-xs text-[var(--c-ink-muted)]"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ledgers</label>
      {canEdit && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await addClient(f); if (r.ok) { setF({ name: "", matter: "", reference: "" }); router.push(`${base}/trust?client=${r.id}`); router.refresh(); } else setErr(r.error); }); }} data-testid="trust-add-client">
          <label className="min-w-[12rem] flex-1 text-xs">New client<input className={`${input} mt-1 block w-full`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Client name" data-testid="client-name" /></label>
          <label className="min-w-[12rem] flex-1 text-xs">Matter<input className={`${input} mt-1 block w-full`} value={f.matter} onChange={(e) => setF({ ...f, matter: e.target.value })} placeholder="Estate of…, v. …" data-testid="client-matter" /></label>
          <label className="text-xs">File no.<input className={`${input} mt-1 block w-28`} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} data-testid="client-ref" /></label>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-3 py-2 text-sm font-semibold text-[var(--c-accent)] disabled:opacity-50" data-testid="client-add"><Plus size={14} /> Add client</button>
        </form>
      )}
      {err && <p className="mt-2 text-xs text-red-700" role="alert">{err}</p>}
    </div>
  );
}

export function ClientLedger({ client, lines, canEdit, today }: { client: TrustClient; lines: TrustLine[]; canEdit: boolean; today: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"deposit" | "disbursement" | "transfer">("deposit");
  const [f, setF] = useState({ date: today, amount: "", who: "", ref: "", memo: "", invoice: "", purpose: "fees" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, okText: string) => { setMsg(null); start(async () => { const r = await fn(); if (r.ok) { setF({ date: f.date, amount: "", who: "", ref: "", memo: "", invoice: "", purpose: f.purpose }); setMsg({ ok: true, text: okText }); router.refresh(); } else setMsg({ ok: false, text: r.error }); }); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "deposit") run(() => recordDeposit({ clientId: client.id, date: f.date, amount: f.amount, payor: f.who, memo: f.memo, ref: f.ref }), "Deposit recorded.");
    else if (mode === "disbursement") run(() => recordDisbursement({ clientId: client.id, date: f.date, amount: f.amount, payee: f.who, ref: f.ref, memo: f.memo }), "Disbursement recorded.");
    else run(() => recordFeeTransfer({ clientId: client.id, date: f.date, amount: f.amount, invoice: f.invoice, purpose: f.purpose }), "Transfer recorded. It will show under Banking to match when it appears on the operating statement.");
  };
  const doVoid = (id: number) => { const reason = window.prompt(`Void entry #${id}? It stays on the record, marked void. Why is it being voided?`); if (reason === null) return; setMsg(null); start(async () => { const r = await voidEntryAction({ id, reason }); if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error }); }); };
  const pill = (m: typeof mode, label: string) => <button type="button" onClick={() => { setMode(m); setMsg(null); }} className={`rounded-full px-3 py-1 text-xs ${mode === m ? "bg-[var(--c-accent)] font-semibold text-[var(--c-on-accent)]" : "border border-[var(--c-border)] hover:border-[var(--c-accent)]"}`} data-testid={`trust-mode-${m}`}>{label}</button>;

  return (
    <section className="mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="client-ledger">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg">{client.name}</h2>
          <p className="text-xs text-[var(--c-ink-muted)]">{client.matter || "No matter entered"}{client.reference ? ` · File ${client.reference}` : ""}</p>
        </div>
        <p className="text-sm">Held in trust: <span className="font-mono text-base font-semibold" data-testid="ledger-balance">{fmtCents(client.balance, { paren: true, dollar: true })}</span></p>
      </div>

      {canEdit && client.active && (
        <form className="mt-4 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3" onSubmit={submit} data-testid="trust-form">
          <div className="flex flex-wrap gap-1.5">{pill("deposit", "Deposit")}{pill("disbursement", "Disbursement")}{pill("transfer", "Transfer earned fees to operating")}</div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs">Date<input type="date" className={`${input} mt-1 block`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="trust-date" /></label>
            <label className="text-xs">Amount<input className={`${input} mt-1 block w-32 text-right font-mono`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" inputMode="decimal" data-testid="trust-amount" /></label>
            {mode !== "transfer" && <label className="min-w-[11rem] flex-1 text-xs">{mode === "deposit" ? "Received from" : "Paid to"}<input className={`${input} mt-1 block w-full`} value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} data-testid="trust-who" /></label>}
            {mode !== "transfer" && <label className="text-xs">{mode === "deposit" ? "Check / reference no." : "Check no."}<input className={`${input} mt-1 block w-28`} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} data-testid="trust-ref" /></label>}
            {mode !== "transfer" && <label className="min-w-[12rem] flex-1 text-xs">{mode === "deposit" ? "What it is for" : "Purpose"}<input className={`${input} mt-1 block w-full`} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder={mode === "deposit" ? "Retainer, settlement proceeds…" : "Filing fee, settlement to client…"} data-testid="trust-memo" /></label>}
            {mode === "transfer" && <label className="text-xs">Invoice / statement no.<input className={`${input} mt-1 block w-40`} value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })} data-testid="trust-invoice" /></label>}
            {mode === "transfer" && <label className="text-xs">For<select className={`${input} mt-1 block`} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} data-testid="trust-purpose"><option value="fees">Earned legal fees</option><option value="flat_fees">Earned flat fee</option><option value="reimbursed_costs">Client costs billed</option><option value="client_advances">Repay a cost the firm advanced</option></select></label>}
            <button type="submit" disabled={pending} className="rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="trust-save">{pending ? "Saving…" : "Record"}</button>
          </div>
          {mode === "transfer" && <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Records the money leaving trust and arriving in operating as income, in one entry. Make the actual transfer at the bank; this site never moves money.</p>}
        </form>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="trust-msg">{msg.text}</p>}

      <table className="mt-4 w-full text-sm" data-testid="ledger-lines">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="w-24 pb-1 font-medium">Date</th><th className="w-28 pb-1 font-medium">Type</th><th className="pb-1 font-medium">Detail</th><th className="w-28 pb-1 text-right font-medium">In</th><th className="w-28 pb-1 text-right font-medium">Out</th><th className="w-28 pb-1 text-right font-medium">Balance</th><th className="w-12" /></tr></thead>
        <tbody>
          {lines.length === 0 && <tr><td colSpan={7} className="py-3 text-sm text-[var(--c-ink-muted)]">Nothing recorded for this client yet.</td></tr>}
          {lines.map((l, i) => (
            <tr key={`${l.entryId}-${i}`} className="border-t border-[var(--c-border)]" data-testid={`ledger-line-${l.entryId}`}>
              <td className="py-1.5 font-mono text-xs">{l.date}</td>
              <td className="py-1.5 text-xs">{KIND[l.kind] ?? l.kind}</td>
              <td className="py-1.5">{[l.payee, l.ref ? `#${l.ref}` : "", l.memo].filter(Boolean).join(" · ")}<span className="ml-2 text-[11px] text-[var(--c-ink-muted)]">entry #{l.entryId}</span></td>
              <td className="py-1.5 text-right font-mono text-xs">{fmtCents(l.in, { blankZero: true })}</td>
              <td className="py-1.5 text-right font-mono text-xs">{fmtCents(l.out, { blankZero: true })}</td>
              <td className="py-1.5 text-right font-mono text-xs">{fmtCents(l.balance, { paren: true })}</td>
              <td className="py-1.5 text-right">{canEdit && <button type="button" disabled={pending} onClick={() => doVoid(l.entryId)} className="text-[var(--c-ink-muted)] hover:text-red-700" aria-label={`Void entry ${l.entryId}`} title="Void" data-testid={`ledger-void-${l.entryId}`}><Ban size={12} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && <p className="mt-3 text-right text-xs"><button type="button" disabled={pending} onClick={() => { setMsg(null); start(async () => { const r = await setClientActive({ id: client.id, active: !client.active }); if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error }); }); }} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" data-testid="client-toggle">{client.active ? "Close this ledger" : "Reopen this ledger"}</button></p>}
    </section>
  );
}
