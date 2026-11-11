"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Loader2, RefreshCw, Unplug, AlertTriangle, Copy } from "lucide-react";
import { checkGusto, disconnectGustoAction } from "@/app/books/(app)/settings/gusto-actions";

export type GustoCard = {
  configured: boolean;
  environment: "demo" | "production";
  redirectUri: string;
  startUrl: string;
  connection: { status: string; environment: string; companyName: string; connectedBy: string; connectedAt: string | null; lastCheckedAt: string | null; lastError: string } | null;
  /** From the return trip: "connected" or an error message. */
  flash: { kind: "ok" | "error"; text: string } | null;
};
type Payroll = { checkDate: string; periodStart: string; periodEnd: string; gross: string; net: string; employerTaxes: string };

const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5";
const money = (s: string) => (s === "" || isNaN(Number(s)) ? "—" : Number(s).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/** Settings → Connections → Gusto. Sign in at Gusto, approve, come back linked.
 *  Read-only: StartBookkeeping can see payroll, never run it or move money. */
export function GustoConnection({ data, owner }: { data: GustoCard; owner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(data.flash?.kind === "ok" ? data.flash.text : null);
  const [error, setError] = useState<string | null>(data.flash?.kind === "error" ? data.flash.text : null);
  const [payrolls, setPayrolls] = useState<Payroll[] | null>(null);
  const [copied, setCopied] = useState(false);
  const c = data.connection;
  const practice = (c?.environment ?? data.environment) !== "production";

  const check = () => { setMsg(null); setError(null); start(async () => { const r = await checkGusto(); if (r.ok) { setPayrolls(r.payrolls); setMsg(r.payrolls.length ? "Connection is working." : "Connection is working. Gusto has no processed payrolls in the last six months."); router.refresh(); } else { setPayrolls(null); setError(r.error); router.refresh(); } }); };
  const disconnect = () => { if (!confirm("Disconnect Gusto? StartBookkeeping forgets its access. Payroll in Gusto is not affected.")) return; setMsg(null); setError(null); start(async () => { const r = await disconnectGustoAction(); if (r.ok) { setPayrolls(null); setMsg("Gusto disconnected."); router.refresh(); } else setError(r.error); }); };

  return (
    <section className={card} id="connections" data-testid="connections">
      <h2 className="text-sm font-semibold">Connections</h2>
      <p className="mt-0.5 text-[11px] text-[var(--c-ink-muted)]">Outside services linked to these books. Every connection is read-only: StartBookkeeping can see the numbers, never run payroll or move money.</p>

      <div className="mt-3 rounded-md border border-[var(--c-border)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Gusto</span>
          <span className="text-xs text-[var(--c-ink-muted)]">Payroll</span>
          {c && c.status === "connected" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800" data-testid="gusto-status"><Check size={10} /> Connected</span>}
          {c && c.status !== "connected" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800" data-testid="gusto-status"><AlertTriangle size={10} /> Needs attention</span>}
          {!c && <span className="rounded-full border border-[var(--c-border)] px-2 py-0.5 text-[10px] uppercase text-[var(--c-ink-muted)]" data-testid="gusto-status">Not connected</span>}
          {(c || data.configured) && practice && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800" title="Gusto's practice environment: sample data, not your real payroll" data-testid="gusto-env">Practice data</span>}
        </div>

        {c ? (
          <>
            <p className="mt-2 text-xs text-[var(--c-ink-muted)]">
              {c.companyName ? <>Linked to <strong className="text-[var(--c-ink)]">{c.companyName}</strong>. </> : null}
              Connected {day(c.connectedAt)}{c.connectedBy ? ` by ${c.connectedBy}` : ""}.{c.lastCheckedAt ? ` Last checked ${day(c.lastCheckedAt)}.` : ""}
            </p>
            {c.status !== "connected" && c.lastError && <p className="mt-1 text-xs text-amber-700">{c.lastError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={check} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-xs hover:border-[var(--c-accent)] disabled:opacity-50" data-testid="gusto-check">{pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Check connection</button>
              {owner && c.status !== "connected" && <a href={data.startUrl} className="btn btn-accent inline-flex items-center gap-1.5 text-xs" data-testid="gusto-connect"><Link2 size={13} /> Connect again</a>}
              {owner && <button onClick={disconnect} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-xs hover:border-red-400 disabled:opacity-50" data-testid="gusto-disconnect"><Unplug size={13} /> Disconnect</button>}
            </div>
            {payrolls && payrolls.length > 0 && (
              <table className="mt-3 w-full max-w-xl text-xs" data-testid="gusto-payrolls">
                <thead><tr className="text-left text-[var(--c-ink-muted)]"><th className="py-1 font-medium">Pay date</th><th className="font-medium">Period</th><th className="text-right font-medium">Gross</th><th className="text-right font-medium">Net</th><th className="text-right font-medium">Employer taxes</th></tr></thead>
                <tbody>{payrolls.map((p) => (<tr key={p.checkDate + p.periodStart} className="border-t border-[var(--c-border)]"><td className="py-1">{p.checkDate}</td><td>{p.periodStart} – {p.periodEnd}</td><td className="text-right font-mono">{money(p.gross)}</td><td className="text-right font-mono">{money(p.net)}</td><td className="text-right font-mono">{money(p.employerTaxes)}</td></tr>))}</tbody>
              </table>
            )}
          </>
        ) : data.configured ? (
          <>
            <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Sign in at Gusto and approve read-only access. You come straight back here, linked.</p>
            {owner ? <a href={data.startUrl} className="btn btn-accent mt-3 inline-flex items-center gap-2 text-sm" data-testid="gusto-connect"><Link2 size={15} /> Connect Gusto</a> : <p className="mt-2 text-xs text-[var(--c-ink-muted)]">An owner connects payroll.</p>}
          </>
        ) : (
          <div className="mt-2 text-xs text-[var(--c-ink-muted)]" data-testid="gusto-setup">
            <p className="text-[var(--c-ink)]">One-time setup before the Connect button appears:</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Create a free developer account at dev.gusto.com and add an application.</li>
              <li>Give that application this Redirect URI:
                <span className="mt-1 flex items-center gap-2"><code className="break-all rounded bg-[var(--c-bg)] px-2 py-1 font-mono text-[11px] text-[var(--c-ink)]" data-testid="gusto-redirect">{data.redirectUri}</code>
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(data.redirectUri); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select it by hand */ } }} className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--c-border)] px-1.5 py-0.5 text-[10px] hover:border-[var(--c-accent)]"><Copy size={10} /> {copied ? "copied" : "copy"}</button></span>
              </li>
              <li>Put the application&apos;s two keys into the site&apos;s environment settings as <code className="font-mono">GUSTO_CLIENT_ID</code> and <code className="font-mono">GUSTO_CLIENT_SECRET</code>, then redeploy. Never paste keys into a chat or an email.</li>
            </ol>
          </div>
        )}
        {msg && <p className="mt-2 text-xs text-emerald-700" data-testid="gusto-msg">{msg}</p>}
        {error && <p className="mt-2 text-xs text-red-600" data-testid="gusto-error">{error}</p>}
      </div>
    </section>
  );
}
