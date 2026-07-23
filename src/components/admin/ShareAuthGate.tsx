"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { portalPasswordLogin, portalCreateLogin, portalRequestCode, portalCodeLogin, portalResetWithCode } from "@/app/share/[token]/auth-actions";

type Mode = "password" | "choose" | "create" | "code" | "reset";
const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const primary = "w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50";
const ghost = "w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--c-border)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--c-surface2)]";

export function ShareAuthGate({ token, email, hasPassword }: { token: string; email: string; hasPassword: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(hasPassword ? "password" : "choose");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? "Something went wrong.");
    });
  };

  function sendCode() {
    setError(null);
    start(async () => {
      const res = await portalRequestCode(token);
      if (res.ok) { setCodeSent(true); setInfo(`We emailed a 6-digit code to ${email}.`); }
      else setError(res.error ?? "Couldn't send the code.");
    });
  }

  const box = "mx-auto mt-6 max-w-sm rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6";
  return (
    <div className={box}>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><Lock size={18} /></span>
        <div>
          <p className="text-sm font-semibold text-[var(--c-ink)]">Verify it&apos;s you</p>
          <p className="text-xs text-[var(--c-ink-muted)]">{email}</p>
        </div>
      </div>

      {mode === "password" && (
        <div className="space-y-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(() => portalPasswordLogin(token, password)); }} placeholder="Password" className={input} autoFocus />
          <button onClick={() => run(() => portalPasswordLogin(token, password))} disabled={pending || !password} className={primary}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Sign in</button>
          <button onClick={() => { setMode("reset"); setCodeSent(false); setError(null); }} className="w-full text-center text-xs text-[var(--c-accent)]">Forgot password?</button>
        </div>
      )}

      {mode === "choose" && (
        <div className="space-y-2.5">
          <p className="mb-1 text-xs text-[var(--c-ink-muted)]">First time here? Choose how you&apos;d like to get in.</p>
          <button onClick={() => { setMode("create"); setError(null); }} className={primary}><KeyRound size={15} /> Create a login</button>
          <button onClick={() => { setMode("code"); setError(null); sendCode(); }} className={ghost}><Mail size={15} /> Email me a one-time code</button>
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password (8+ characters)" className={input} autoFocus />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" className={input} />
          <button onClick={() => { if (password !== confirm) { setError("Passwords don't match."); return; } run(() => portalCreateLogin(token, password)); }} disabled={pending || password.length < 8} className={primary}>{pending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Create login &amp; continue</button>
          {!hasPassword && <button onClick={() => setMode("choose")} className="flex items-center gap-1 text-xs text-[var(--c-ink-muted)]"><ArrowLeft size={12} /> Back</button>}
        </div>
      )}

      {(mode === "code" || mode === "reset") && (
        <div className="space-y-3">
          {!codeSent ? (
            <button onClick={sendCode} disabled={pending} className={primary}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Email me a code</button>
          ) : (
            <>
              {info && <p className="text-xs text-[var(--c-ink-muted)]">{info}</p>}
              <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className={`${input} tracking-[0.3em]`} autoFocus />
              {mode === "reset" && <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters)" className={input} />}
              <button
                onClick={() => (mode === "reset" ? run(() => portalResetWithCode(token, code, password)) : run(() => portalCodeLogin(token, code)))}
                disabled={pending || code.length !== 6 || (mode === "reset" && password.length < 8)}
                className={primary}
              >{pending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} {mode === "reset" ? "Reset password & continue" : "Verify & continue"}</button>
              <button onClick={sendCode} disabled={pending} className="w-full text-center text-xs text-[var(--c-accent)]">Resend code</button>
            </>
          )}
          <button onClick={() => { setMode(hasPassword ? "password" : "choose"); setError(null); setCodeSent(false); }} className="flex items-center gap-1 text-xs text-[var(--c-ink-muted)]"><ArrowLeft size={12} /> Back</button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-[var(--c-error)]">{error}</p>}
    </div>
  );
}
