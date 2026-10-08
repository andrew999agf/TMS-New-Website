"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Mail, AlertTriangle } from "lucide-react";
import { sendEmailTest, saveSetting } from "@/app/admin/(panel)/settings/actions";
import { SHARE_OTP_KEY } from "@/lib/share/settings";

type Status = { method: "smtp" | "resend" | "none"; from: string; host: string; port: number };

/** Settings → "Email": which account sends the firm's mail, and a one-click
 *  test that shows the mail server's real answer when something's wrong. */
export function EmailStatusCard({ status, otpEnabled }: { status: Status; otpEnabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; raw?: string } | null>(null);
  const [otp, setOtp] = useState(otpEnabled);
  const [otpSaving, startOtp] = useTransition();
  function toggleOtp(on: boolean) {
    setOtp(on);
    startOtp(async () => { await saveSetting(SHARE_OTP_KEY, on).catch(() => setOtp(!on)); });
  }

  function test() {
    setResult(null);
    start(async () => {
      try {
        const r = await sendEmailTest();
        if (r.ok) setResult({ ok: true, text: `Sent to ${r.to} in ${r.ms} ms — check that inbox (and spam).` });
        else setResult({ ok: false, text: r.error, raw: "raw" in r ? r.raw : undefined });
      } catch {
        setResult({ ok: false, text: "The test couldn't run — the server didn't answer." });
      }
    });
  }

  const label = status.method === "smtp" ? `Google Workspace mailbox ${status.from} via ${status.host}:${status.port}`
    : status.method === "resend" ? `Resend (from ${status.from})`
    : "Not connected — set SMTP_USER and SMTP_PASS in the hosting environment.";

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-sm">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${status.method === "none" ? "bg-red-500" : "bg-green-500"}`} />
        <span>{label}</span>
      </p>
      <p className="text-xs text-[var(--c-ink-muted)]">Every email the site sends — setup links, share invitations, one-time codes, intake notices — goes through this account. If any of them stop arriving, test here first: the result says exactly what the mail server objected to.</p>
      <button onClick={test} disabled={pending || status.method === "none"} className="btn btn-outline inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send me a test email
      </button>
      <label className="flex items-start gap-2 rounded-md border border-[var(--c-border)] p-3 text-sm">
        <input type="checkbox" checked={otp} disabled={otpSaving} onChange={(e) => toggleOtp(e.target.checked)} className="mt-0.5 accent-[var(--c-accent)]" />
        <span>
          <span className="font-medium">Offer &ldquo;Email me a one-time code&rdquo; on share-link sign-in</span>
          <span className="mt-0.5 block text-xs text-[var(--c-ink-muted)]">
            {otp ? "Recipients can sign in with an emailed code or a password." : "Off — recipients create a password login instead (nothing to email). Turn this back on once the test above says email is working."}
          </span>
        </span>
      </label>
      {result && (
        <div className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>
          <p className="flex items-start gap-2">{result.ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />} <span>{result.text}</span></p>
          {result.raw && <p className="mt-1.5 break-all font-mono text-[11px] opacity-80">{result.raw}</p>}
        </div>
      )}
    </div>
  );
}
