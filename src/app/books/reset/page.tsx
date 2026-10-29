"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resetAction } from "./actions";
import { BOOKS_NAME } from "@/lib/books/host";

function ResetForm() {
  const params = useSearchParams();
  const userId = Number(params.get("u"));
  const token = params.get("t") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const base = typeof window !== "undefined" && window.location.pathname.startsWith("/books") ? "/books" : "";
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (pw !== pw2) { setError("The two passwords don't match."); return; }
    start(async () => { const r = await resetAction(userId, token, pw); if (r.ok) setDone(true); else setError(r.error); });
  };
  if (!userId || !token) return <p className="text-sm text-red-600">This link is incomplete. Ask an owner to send a new one.</p>;
  if (done) return <p className="text-sm">Your password is set. <a href={`${base}/login`} className="text-[var(--c-accent)] underline">Sign in</a> — you&apos;ll get a one-time code by email.</p>;
  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--c-ink-muted)]">New password (12+ characters)</span>
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" data-testid="rs-pw" /></label>
      <label className="block text-sm"><span className="mb-1 block text-xs text-[var(--c-ink-muted)]">Again</span>
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" data-testid="rs-pw2" /></label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending || pw.length < 12} className="btn btn-accent w-full justify-center disabled:opacity-50" data-testid="rs-go">{pending ? <Loader2 size={16} className="animate-spin" /> : "Set password"}</button>
    </form>
  );
}

export default function BooksReset() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{BOOKS_NAME}</p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">Set your password</h1>
      <Suspense fallback={null}><ResetForm /></Suspense>
    </main>
  );
}
