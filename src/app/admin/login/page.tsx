"use client";

import { useActionState } from "react";
import { loginAction } from "../auth-actions";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";

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
