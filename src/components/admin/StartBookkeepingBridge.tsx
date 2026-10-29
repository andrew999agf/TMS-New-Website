"use client";

import { useState, useTransition } from "react";
import { ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { setMyBooksPassword } from "@/app/admin/(panel)/startbookkeeping/actions";

export function StartBookkeepingBridge({ booksUrl, hasLogin, lastLoginAt, fullAdmin, email }: { booksUrl: string; hasLogin: boolean; lastLoginAt: string | null; fullAdmin: boolean; email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(!hasLogin);
  const submit = () => {
    setMsg(null); setError(null);
    if (pw !== pw2) { setError("The two passwords don't match."); return; }
    start(async () => { const r = await setMyBooksPassword(pw); if (r.ok) { setMsg(r.created ? "Your StartBookkeeping login is ready. Open it and sign in with this password — a code will be emailed to you." : "Password updated."); setPw(""); setPw2(""); setOpen(false); } else setError(r.error); });
  };
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-5">
        <p className="text-sm leading-relaxed">StartBookkeeping is the firm&apos;s books: operating and trust ledgers, payroll records, tax calendar, and the reports your CPA needs. It runs at its own address with its <strong>own login and an emailed sign-in code every time</strong>, so the admin password never opens the books and the books can never move money.</p>
        <a href={booksUrl} className="btn btn-accent mt-3 inline-flex items-center gap-2 text-sm" data-testid="open-books"><ExternalLink size={15} /> Open StartBookkeeping</a>
        <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Inside it, &ldquo;Back to admin&rdquo; brings you here.</p>
      </div>
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <p className="inline-flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} className="text-[var(--c-accent)]" /> Your StartBookkeeping login</p>
        <p className="mt-1 text-xs text-[var(--c-ink-muted)]">{hasLogin ? `${email} has a login${lastLoginAt ? ` (last sign-in ${new Date(lastLoginAt).toLocaleDateString("en-US")})` : " (not signed in yet)"}.` : `${email} has no StartBookkeeping login yet. Set a password below — different from your admin password.`}</p>
        {fullAdmin ? (
          <>
            {!open && <button onClick={() => setOpen(true)} className="mt-3 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-xs hover:border-[var(--c-accent)]">Change password</button>}
            {open && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (12+ characters)" className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm" data-testid="sb-pw" />
                <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Again" className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm" data-testid="sb-pw2" />
                <button onClick={submit} disabled={pending || pw.length < 12} className="btn btn-accent text-sm disabled:opacity-50" data-testid="sb-set">{pending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {hasLogin ? "Update password" : "Create my login"}</button>
              </div>
            )}
          </>
        ) : <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Ask an owner to add you inside StartBookkeeping → Settings → Logins.</p>}
        {msg && <p className="mt-2 text-xs text-emerald-700">{msg}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
