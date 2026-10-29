"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { startAction, verifyAction } from "./actions";
import { BOOKS_NAME } from "@/lib/books/host";

/**
 * Two steps, every time: password, then the six-digit code emailed to the
 * same address. A session only exists after both. Short-lived by design.
 */
export default function BooksLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const base = typeof window !== "undefined" && window.location.pathname.startsWith("/books") ? "/books" : "";

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    start(async () => { const r = await startAction(email, password); if (r.ok) { setStep("code"); setPassword(""); } else setError(r.error); });
  };
  const submitCode = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    start(async () => { const r = await verifyAction(email, code); if (r.ok) window.location.assign(`${base}/`); else setError(r.error); });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{BOOKS_NAME}</p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">{step === "password" ? "Sign in" : "Check your email"}</h1>
      {step === "password" ? (
        <form onSubmit={submitPassword} className="mt-6 space-y-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--c-ink-muted)]">Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" data-testid="sb-email" /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--c-ink-muted)]">Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" data-testid="sb-password" /></label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={pending} className="btn btn-accent w-full justify-center disabled:opacity-50" data-testid="sb-continue">{pending ? <Loader2 size={16} className="animate-spin" /> : "Continue"}</button>
          <p className="text-[11px] leading-relaxed text-[var(--c-ink-muted)]"><ShieldCheck size={12} className="mr-1 inline" />This login is separate from the admin&apos;s. A sign-in code is emailed every time, and sessions end after two hours.</p>
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-6 space-y-3">
          <p className="text-sm text-[var(--c-ink-muted)]">We emailed a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.</p>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required
            className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-[var(--c-accent)]" data-testid="sb-code" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={pending || code.length !== 6} className="btn btn-accent w-full justify-center disabled:opacity-50" data-testid="sb-verify">{pending ? <Loader2 size={16} className="animate-spin" /> : "Sign in"}</button>
          <button type="button" onClick={() => { setStep("password"); setCode(""); setError(null); }} className="w-full text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Start over</button>
        </form>
      )}
    </main>
  );
}
