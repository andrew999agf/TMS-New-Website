"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, KeyRound, Mail } from "lucide-react";
import { publicFileStart, publicFileRequestCode, publicFileCodeLogin, publicFilePasswordLogin } from "@/app/share/f/[token]/[fileId]/auth-actions";

/** Email-first sign-in for a secure folder's public file link. Once signed in,
 *  the portal session lasts ~12 hours before another code/login is needed. */
export function PublicFileAuthGate({ token }: { token: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password" | "code">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setBusy(true); setError(null);
    try { const r = await fn(); if (r.ok) onOk?.(); else setError(r.error ?? "Something went wrong."); }
    finally { setBusy(false); }
  };

  const start = () => run(async () => {
    const r = await publicFileStart(token, email);
    if (r.ok) { if (r.hasPassword) setStep("password"); else { await requestCode(); setStep("code"); } }
    return r;
  });
  const requestCode = async () => { const r = await publicFileRequestCode(token, email); setSent(r.ok); if (!r.ok) setError(r.error ?? "Couldn't send code."); return r; };
  const toCode = () => run(async () => { const r = await requestCode(); if (r.ok) setStep("code"); return r; });
  const signInPassword = () => run(() => publicFilePasswordLogin(token, email, password), () => router.refresh());
  const signInCode = () => run(() => publicFileCodeLogin(token, email, code), () => router.refresh());

  const field = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-sm">
      <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]"><ShieldCheck size={15} className="text-emerald-600" /> Secure document</p>
      <p className="mb-4 text-xs text-[var(--c-ink-muted)]">This document is protected. Verify it&rsquo;s you to open it — you&rsquo;ll stay signed in for a while afterward.</p>

      {step === "email" && (
        <div className="space-y-3">
          <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Your email (the one it was shared with)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") start(); }} placeholder="you@example.com" className={field} autoFocus />
          </label>
          <button onClick={start} disabled={busy} className="btn btn-accent inline-flex w-full items-center justify-center gap-1.5 text-sm py-2 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Continue</button>
        </div>
      )}

      {step === "password" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--c-ink-muted)]">Signing in as <strong>{email}</strong></p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") signInPassword(); }} placeholder="Your password" className={field} autoFocus />
          <button onClick={signInPassword} disabled={busy} className="btn btn-accent inline-flex w-full items-center justify-center gap-1.5 text-sm py-2 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Sign in</button>
          <button onClick={toCode} disabled={busy} className="w-full text-center text-xs text-[var(--c-accent)] hover:underline">Email me a one-time code instead</button>
        </div>
      )}

      {step === "code" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--c-ink-muted)]">{sent ? <>We emailed a 6-digit code to <strong>{email}</strong>.</> : <>Enter the code sent to <strong>{email}</strong>.</>}</p>
          <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") signInCode(); }} placeholder="6-digit code" className={`${field} tracking-[0.3em]`} autoFocus />
          <button onClick={signInCode} disabled={busy} className="btn btn-accent inline-flex w-full items-center justify-center gap-1.5 text-sm py-2 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Open document</button>
          <button onClick={() => requestCode()} disabled={busy} className="w-full text-center text-xs text-[var(--c-accent)] hover:underline">Resend code</button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-[var(--c-error)]">{error}</p>}
    </div>
  );
}
