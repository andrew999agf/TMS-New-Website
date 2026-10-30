"use client";

import { useState, useTransition } from "react";
import { ExternalLink, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { bootstrapFirstOwner, requestBooksAccess, type BridgeState } from "@/app/admin/(panel)/startbookkeeping/actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The admin panel's door to StartBookkeeping. It never issues or changes a
 *  books login: the company's primary admin does that inside the product.
 *  From here an owner or bookkeeper can only ASK. */
export function StartBookkeepingBridge({ booksUrl, state, email }: { booksUrl: string; state: BridgeState; email: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState(state.pendingSince);
  const [pending, start] = useTransition();
  const primaryLabel = state.primary ? (state.primary.name ? `${state.primary.name} (${state.primary.email})` : state.primary.email) : null;
  const ask = () => { setMsg(null); setError(null); start(async () => { const r = await requestBooksAccess(); if (r.ok) { setMsg(`Request sent to ${r.to}. They add your login inside StartBookkeeping and you'll get an email to set your password.`); setPendingSince(new Date().toISOString()); } else setError(r.error); }); };
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-5">
        <p className="text-sm leading-relaxed">StartBookkeeping is the firm&apos;s books: operating and trust ledgers, payroll records, tax calendar, and the reports your CPA needs. It runs at its own address with its <strong>own login and an emailed sign-in code every time</strong>, so the admin password never opens the books and the books can never move money.</p>
        <a href={booksUrl} className="btn btn-accent mt-3 inline-flex items-center gap-2 text-sm" data-testid="open-books"><ExternalLink size={15} /> Open StartBookkeeping</a>
        <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Inside it, &ldquo;Back to admin&rdquo; brings you here.</p>
      </div>
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <p className="inline-flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} className="text-[var(--c-accent)]" /> Your StartBookkeeping login</p>
        {state.hasLogin ? (
          <>
            <p className="mt-1 text-xs text-[var(--c-ink-muted)]" data-testid="sb-has-login">{email} has a login{state.lastLoginAt ? ` (last sign-in ${new Date(state.lastLoginAt).toLocaleDateString("en-US")})` : " (not signed in yet)"}.</p>
            <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Passwords are managed inside StartBookkeeping, not here. Forgot yours? {primaryLabel ? `Ask the primary admin, ${primaryLabel}, to email you a set-password link.` : "Ask an owner to email you a set-password link."}</p>
          </>
        ) : state.bootstrap ? (
          <Bootstrap email={email} />
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--c-ink-muted)]" data-testid="sb-no-login">{email} has no StartBookkeeping login. Logins are issued only by its primary admin{primaryLabel ? `, ${primaryLabel}` : ""} — nobody creates their own.</p>
            {state.canRequest ? (
              <div className="mt-3">
                {pendingSince && <p className="mb-2 text-xs text-amber-700" data-testid="sb-pending">Your request from {when(pendingSince)} is waiting on {state.primary?.name || state.primary?.email || "the primary admin"}.</p>}
                <button onClick={ask} disabled={pending || !state.primary} className="btn btn-accent inline-flex items-center gap-2 text-sm disabled:opacity-50" data-testid="sb-request">{pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {pendingSince ? "Send the request again" : "Request access"}</button>
                <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Emails {state.primary?.name || state.primary?.email || "the primary admin"} with your name and email. They pick your role (bookkeeper, viewer or owner) and you get a set-password link.</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--c-ink-muted)]" data-testid="sb-cannot">Only admin owners and accounts marked <strong>Bookkeeper</strong> can request access. An owner can mark you one under User Management → Access → Special abilities.</p>
            )}
          </>
        )}
        {msg && <p className="mt-2 text-xs text-emerald-700" data-testid="sb-msg">{msg}</p>}
        {error && <p className="mt-2 text-xs text-red-600" data-testid="sb-error">{error}</p>}
      </div>
    </div>
  );
}

/** Shown to an admin owner only while StartBookkeeping has no login at all. */
function Bootstrap({ email }: { email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setMsg(null); setError(null);
    if (pw !== pw2) { setError("The two passwords don't match."); return; }
    start(async () => { const r = await bootstrapFirstOwner(pw); if (r.ok) { setMsg("You are StartBookkeeping's first owner and its primary admin. Open it and sign in with this password — a code will be emailed to you."); setPw(""); setPw2(""); } else setError(r.error); });
  };
  return (
    <>
      <p className="mt-1 text-xs text-[var(--c-ink-muted)]">StartBookkeeping has no login yet. As an admin owner you set up its <strong>first owner</strong> — {email} — who becomes the primary admin. After this, every login is issued from inside StartBookkeeping.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Books password (12+ characters)" className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm" data-testid="sb-pw" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Again" className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm" data-testid="sb-pw2" />
        <button onClick={submit} disabled={pending || pw.length < 12} className="btn btn-accent text-sm disabled:opacity-50" data-testid="sb-set">{pending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Create the first owner</button>
      </div>
      {msg && <p className="mt-2 text-xs text-emerald-700">{msg}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </>
  );
}
