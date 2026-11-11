"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Check } from "lucide-react";
import { confirmAction, declineAction } from "./actions";

type Props = { token: string; status: string; clientName: string; whenText: string; durationMin: number; location: string; note: string; firmName: string; forClient: boolean; past: boolean };

/** Opened from the "Confirm this date and time" email. Nothing is confirmed by opening the page: it takes the button. */
export function ConfirmCard(p: Props) {
  const [state, setState] = useState<"open" | "confirmed" | "declined" | "gone">(p.status === "confirmed" ? "confirmed" : p.status === "proposed" && !p.past ? "open" : "gone");
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold disabled:opacity-60";
  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <p className="font-[family-name:var(--font-display)] text-xl">{p.firmName}</p>
      <h1 className="mt-6 font-[family-name:var(--font-display)] text-3xl leading-tight" data-testid="c-title">{state === "confirmed" ? "Confirmed." : state === "declined" ? "Thank you. We will offer another time." : state === "gone" ? "This link is no longer open." : "Confirm this date and time"}</h1>
      {state !== "gone" && state !== "declined" && (
        <div className="mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="c-details">
          <p className="text-sm text-[var(--c-ink-muted)]">In-person consultation{p.forClient ? "" : ` for ${p.clientName}`}</p>
          <p className="mt-2 text-lg font-semibold leading-snug">{p.whenText}</p>
          <p className="mt-1 text-sm text-[var(--c-ink-muted)]">About {p.durationMin} minutes</p>
          <p className="mt-3 text-sm leading-relaxed">{p.location}</p>
          {p.note && <p className="mt-3 border-t border-[var(--c-border)] pt-3 text-sm leading-relaxed text-[var(--c-ink-muted)]">{p.note}</p>}
        </div>
      )}
      {state === "open" && !declining && (
        <>
          <p className="mt-5 text-sm leading-relaxed text-[var(--c-ink-muted)]">{p.forClient ? "This time is not held for you until you confirm it." : `Please check with ${p.clientName || "the client"} first. The time is not held until it is confirmed.`} Confirming emails everyone and sets reminders for the day before and four hours before.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await confirmAction(p.token); setState(r.result === "gone" ? "gone" : "confirmed"); })} className={`${btn} bg-[var(--c-accent)] text-white`} data-testid="c-confirm"><CalendarCheck size={18} /> {pending ? "Confirming…" : "Confirm this date and time"}</button>
            <button type="button" disabled={pending} onClick={() => setDeclining(true)} className="text-sm text-[var(--c-ink-muted)] underline underline-offset-2 hover:text-[var(--c-ink)]" data-testid="c-decline-open">This time doesn&apos;t work</button>
          </div>
        </>
      )}
      {state === "open" && declining && (
        <div className="mt-5">
          <label htmlFor="c-note" className="mb-1.5 block text-sm font-semibold">What would work better? <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></label>
          <textarea id="c-note" rows={3} className="w-full border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 outline-none focus:border-[var(--c-accent)]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mornings are better; any day the following week." data-testid="c-note" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await declineAction(p.token, note); setState(r.ok ? "declined" : "gone"); })} className={`${btn} border border-[var(--c-accent)] text-[var(--c-accent)]`} data-testid="c-decline">{pending ? "Sending…" : "Send — this time doesn't work"}</button>
            <button type="button" onClick={() => setDeclining(false)} className="text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Go back</button>
          </div>
        </div>
      )}
      {state === "confirmed" && <p className="mt-5 inline-flex items-start gap-2 text-sm leading-relaxed text-[var(--c-ink-muted)]" data-testid="c-done"><Check size={16} className="mt-0.5 shrink-0 text-emerald-700" /> A confirmation has been emailed to everyone. Reminders go out the day before and four hours before.</p>}
      {state === "gone" && <p className="mt-4 text-sm leading-relaxed text-[var(--c-ink-muted)]" data-testid="c-gone">The time it was for has been changed, withdrawn or has passed. If a new time was offered, use the link in the most recent email.</p>}
    </div>
  );
}
