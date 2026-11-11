"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, Trash2, UserPlus } from "lucide-react";
import { addPartnerContact, removePartnerContact, sendPartnerLink } from "@/app/admin/(panel)/intake/partner-actions";

export type PartnerContactRow = { id: string; name: string; email: string; linkSentAt?: string };

/** The partner office's intake team, on the partner's tab: add or remove
 *  people, and email them the intake link. Everyone listed is copied on the
 *  intake team's email for each lead that comes in through this partner. */
export function PartnerContacts({ partner, contacts, emailReady }: { partner: { slug: string; name: string }; contacts: PartnerContactRow[]; emailReady: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "add" · "all" · a contact id · "rm-<id>"
  const [, start] = useTransition();

  const run = (key: string, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => {
    setBusy(key); setMsg(null);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) { after?.(); if (r.message) setMsg({ ok: true, text: r.message }); router.refresh(); }
        else setMsg({ ok: false, text: r.error });
      } catch { setMsg({ ok: false, text: "That didn't go through. Try again." }); }
      setBusy(null);
    });
  };

  const field = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
  const small = "inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-xs hover:border-[var(--c-accent)] disabled:opacity-50";
  const sentOn = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { timeZone: "America/Chicago" }); };

  return (
    <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="partner-contacts">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{partner.name} — their intake team</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">Everyone listed here is copied on the email your intake team gets for each lead that comes in through this link. You can also email them the link.</p>
        </div>
        {contacts.length > 1 && (
          <button type="button" disabled={!emailReady || busy !== null} onClick={() => run("all", () => sendPartnerLink({ partner: partner.slug }))}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="contact-send-all"><Send size={13} /> {busy === "all" ? "Sending…" : `Email the link to all ${contacts.length}`}</button>
        )}
      </div>

      {contacts.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--c-border)] rounded-md border border-[var(--c-border)]" data-testid="contact-list">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid={`contact-${c.email}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="break-all text-xs text-[var(--c-ink-muted)]">{c.email}{c.linkSentAt ? <span data-testid={`contact-sent-${c.email}`}> · Link emailed {sentOn(c.linkSentAt)}</span> : null}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={!emailReady || busy !== null} onClick={() => run(c.id, () => sendPartnerLink({ partner: partner.slug, id: c.id }))} className={small} data-testid={`contact-send-${c.email}`}><Mail size={13} /> {busy === c.id ? "Sending…" : c.linkSentAt ? "Email the link again" : "Email the link"}</button>
                <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm(`Remove ${c.name || c.email}? They will stop being copied on new leads.`)) run(`rm-${c.id}`, () => removePartnerContact({ partner: partner.slug, id: c.id })); }} className={small} aria-label={`Remove ${c.name || c.email}`} title="Remove" data-testid={`contact-remove-${c.email}`}><Trash2 size={13} /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 rounded-md border border-dashed border-[var(--c-border)] px-4 py-3 text-xs text-[var(--c-ink-muted)]" data-testid="contact-empty">No one added yet. Until someone is listed, only your intake team gets the emails.</p>}

      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]" onSubmit={(e) => { e.preventDefault(); run("add", () => addPartnerContact({ partner: partner.slug, name, email }), () => { setName(""); setEmail(""); }); }}>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" autoComplete="off" data-testid="contact-name" />
        <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" autoComplete="off" data-testid="contact-email" />
        <button type="submit" disabled={busy !== null} className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-50" data-testid="contact-add"><UserPlus size={15} /> {busy === "add" ? "Adding…" : "Add"}</button>
      </form>

      {!emailReady && <p className="mt-3 text-xs text-[var(--c-error,#b3261e)]">Email isn&apos;t set up on this site yet, so the link can&apos;t be sent from here.</p>}
      {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid="contact-msg">{msg.text}</p>}
    </div>
  );
}
