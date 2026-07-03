"use client";

import { useActionState, useState } from "react";
import { loginAction } from "../auth-actions";
import { requestPasswordReset } from "../reset/actions";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/** Self-service "forgot password" — emails a one-hour reset link. Always shows
 *  the same confirmation so it can't be used to probe which emails exist. */
function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--c-dark-ink)]">
        Reset password
      </h1>
      <p className="mt-2 text-sm text-[var(--c-dark-ink-muted)]">
        Enter your login email and we&apos;ll send you a reset link.
      </p>

      {sent ? (
        <>
          <p className="mt-8 border border-[var(--c-dark-border)] bg-[var(--c-dark-surface)] p-4 text-sm leading-relaxed text-[var(--c-dark-ink)]">
            If <span className="font-semibold">{email.trim()}</span> has an admin account, a reset link is on its way.
            It expires in 1 hour — check your spam folder if it doesn&apos;t arrive.
          </p>
          <button type="button" onClick={onBack} className="btn btn-accent w-full mt-6">
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <div className="mt-8">
            <label className="block text-sm font-medium text-[var(--c-dark-ink)] mb-1.5">Email</label>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--c-dark-surface)] border border-[var(--c-dark-border)] text-[var(--c-dark-ink)] py-3 px-4 outline-none focus:border-[var(--c-dark-accent)]"
            />
          </div>
          <button type="submit" disabled={busy} className="btn btn-accent w-full mt-6 disabled:opacity-60">
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full text-center text-sm text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)]"
          >
            Back to sign in
          </button>
        </>
      )}
    </form>
  );
}

function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";
  const [forgot, setForgot] = useState(false);

  if (forgot) return <ForgotForm onBack={() => setForgot(false)} />;

  return (
    <form action={action} className="w-full max-w-sm">
      <input type="hidden" name="next" value={next} />
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--c-dark-ink)]">
        Admin sign in
      </h1>
      <p className="mt-2 text-sm text-[var(--c-dark-ink-muted)]">
        T. Maxwell Smith, PLLC — content management
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--c-dark-ink)] mb-1.5">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full bg-[var(--c-dark-surface)] border border-[var(--c-dark-border)] text-[var(--c-dark-ink)] py-3 px-4 outline-none focus:border-[var(--c-dark-accent)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--c-dark-ink)] mb-1.5">Password</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full bg-[var(--c-dark-surface)] border border-[var(--c-dark-border)] text-[var(--c-dark-ink)] py-3 px-4 outline-none focus:border-[var(--c-dark-accent)]"
          />
        </div>
      </div>

      <div className="mt-2 text-right">
        <button
          type="button"
          onClick={() => setForgot(true)}
          className="text-sm text-[var(--c-dark-ink-muted)] underline-offset-2 hover:text-[var(--c-dark-ink)] hover:underline"
        >
          Forgot password?
        </button>
      </div>

      {state?.error && (
        <p className="mt-4 text-sm text-[var(--c-error)]">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-accent w-full mt-6 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--c-dark-bg)] px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
