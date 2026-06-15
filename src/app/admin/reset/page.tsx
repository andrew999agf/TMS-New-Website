"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { setPasswordWithToken } from "./actions";

export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Passwords don't match."); return; }
    setBusy(true);
    const res = await setPasswordWithToken(email, token, pw);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)] text-[var(--c-ink)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl mb-1">Set your password</h1>
        <p className="text-sm text-[var(--c-ink-muted)] mb-6">{email || "Account"}</p>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--c-success)]">Your password is set. You can sign in now.</p>
            <button onClick={() => router.push("/admin/login")} className="btn btn-accent w-full">Go to sign in</button>
          </div>
        ) : !token || !email ? (
          <p className="text-sm text-[var(--c-error)]">This link is missing information. Ask your administrator to send a new setup link.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">New password</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Confirm password</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]" />
            </div>
            {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
            <button onClick={submit} disabled={busy} className="btn btn-accent w-full disabled:opacity-50">{busy ? "Saving…" : "Set password"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
