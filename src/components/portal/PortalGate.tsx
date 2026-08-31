"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, ShieldCheck } from "lucide-react";
import { requestPortalCode, portalCodeLogin } from "@/app/portal/[token]/auth-actions";

/**
 * The client-portal gate: prove you own the invited email with a one-time code
 * before anything loads. A forwarded link alone won't get anyone in — this is
 * the "create a login" step, without a password for the client to lose.
 */
export function PortalGate({ token, email, firmName }: { token: string; email: string; firmName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--c-accent)]";
  const primary = "inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50";

  function sendCode() {
    setError(null);
    start(async () => {
      const r = await requestPortalCode(token);
      if (r.ok) { setSent(true); setInfo(`We emailed a 6-digit code to ${email}.`); }
      else setError(r.error ?? "Couldn't send the code.");
    });
  }
  function verify() {
    setError(null);
    start(async () => {
      const r = await portalCodeLogin(token, code);
      if (r.ok) router.refresh();
      else setError(r.error ?? "That code isn't right.");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-sm">
        <div className="mb-3 inline-flex items-center gap-2 text-[var(--c-accent)]"><ShieldCheck size={18} /> <span className="text-xs font-semibold uppercase tracking-[0.14em]">{firmName} — Client Portal</span></div>
        <h1 className="font-[family-name:var(--font-display)] text-xl text-[var(--c-ink)]">Sign in to your portal</h1>
        <p className="mt-2 text-sm text-[var(--c-ink-muted)]">This portal belongs to <strong className="text-[var(--c-ink)]">{email}</strong>. We&apos;ll email a one-time code to confirm it&apos;s you — no password to remember.</p>

        <div className="mt-5 space-y-3">
          {!sent ? (
            <button onClick={sendCode} disabled={pending} className={primary}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Email me a sign-in code</button>
          ) : (
            <>
              <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className={`${input} tracking-[0.3em]`} autoFocus onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) verify(); }} />
              <button onClick={verify} disabled={pending || code.length !== 6} className={primary}>{pending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Verify &amp; sign in</button>
              <button onClick={sendCode} disabled={pending} className="w-full text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">Resend the code</button>
            </>
          )}
          {info && <p className="text-xs text-[var(--c-ink-muted)]">{info}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </main>
  );
}
