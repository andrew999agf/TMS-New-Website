"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarCheck, Send } from "lucide-react";
import { cancelConsultRequest, offerConsultTime } from "@/app/admin/(panel)/intake/consult-actions";

export type ConsultRow = {
  id: number; intakeId: number; status: string; requested: string[]; contactId: string; clientName: string; clientPhone: string; hasEmail: boolean; matter: string;
  sentToName: string; whenText: string; startDate: string; startTime: string; durationMin: number; location: string; note: string; proposedAt: string | null; confirmedAt: string | null; declineNote: string;
  reminderDay: boolean; reminderHours: boolean;
};
type Contact = { id: string; name: string };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Needs a time", cls: "bg-amber-100 text-amber-900" }, proposed: { label: "Waiting for them to confirm", cls: "bg-sky-100 text-sky-900" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-900" }, cancelled: { label: "Cancelled", cls: "bg-[var(--c-bg)] text-[var(--c-ink-muted)]" },
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "");

function Row({ c, contacts, locations, partnerName, partnerSlug, focus }: { c: ConsultRow; contacts: Contact[]; locations: string[]; partnerName: string; partnerSlug: string; focus: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(c.status === "requested" || focus);
  const [f, setF] = useState({ date: c.startDate, time: c.startTime || "10:00", durationMin: c.durationMin || 60, location: c.location || locations[1] || locations[0] || "", other: "", note: c.note, sendTo: contacts.some((x) => x.id === c.contactId) ? c.contactId : contacts[0]?.id ?? (c.hasEmail ? "client" : "") });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const st = STATUS[c.status] ?? STATUS.requested;
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); if (r.ok) setOpen(false); router.refresh(); }); };
  const loc = f.location === "__other" ? f.other : f.location;
  return (
    <li className={`px-4 py-3 ${focus ? "bg-[var(--c-accent)]/5" : ""}`} data-testid={`consult-${c.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm"><span className="font-semibold">{c.clientName || "(no name)"}</span>{c.matter ? <span className="text-[var(--c-ink-muted)]"> · {c.matter}</span> : null}{c.clientPhone ? <span className="text-[var(--c-ink-muted)]"> · {c.clientPhone}</span> : null}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`} data-testid={`consult-status-${c.id}`}>{st.label}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--c-ink-muted)]" data-testid={`consult-asked-${c.id}`}>Asked for: {c.requested.join("; ") || "no dates given"}</p>
      {c.status === "proposed" && <p className="mt-1 text-sm" data-testid={`consult-offered-${c.id}`}>Offered <span className="font-semibold">{c.whenText}</span> · {c.location} · emailed to {c.sentToName} on {day(c.proposedAt)}.</p>}
      {c.status === "confirmed" && <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-sm" data-testid={`consult-confirmed-${c.id}`}><CalendarCheck size={14} className="text-emerald-700" /> <span className="font-semibold">{c.whenText}</span> · {c.location} · confirmed {day(c.confirmedAt)} · reminders: day before {c.reminderDay ? "sent" : "pending"}, four hours before {c.reminderHours ? "sent" : "pending"}</p>}
      {c.status === "requested" && c.declineNote && <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid={`consult-declined-${c.id}`}>The last time offered didn&apos;t work: {c.declineNote}</p>}
      {c.status !== "cancelled" && (
        <p className="mt-2 flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => setOpen(!open)} className="text-[var(--c-accent)] hover:underline" data-testid={`consult-toggle-${c.id}`}>{open ? "Hide" : c.status === "requested" ? "Offer a time" : "Offer a different time"}</button>
          <a href={`?partner=${encodeURIComponent(partnerSlug)}&lead=${c.intakeId}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Open the lead</a>
          <button type="button" disabled={pending} onClick={() => { if (window.confirm(c.status === "confirmed" ? "Cancel this confirmed consultation? Everyone who was told it was on will be emailed that it is off." : "Cancel this request?")) run(() => cancelConsultRequest({ id: c.id })); }} className="text-[var(--c-ink-muted)] hover:text-red-700" data-testid={`consult-cancel-${c.id}`}>Cancel</button>
        </p>
      )}
      {open && c.status !== "cancelled" && (
        <form className="mt-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3" onSubmit={(e) => { e.preventDefault(); run(() => offerConsultTime({ id: c.id, date: f.date, time: f.time, durationMin: f.durationMin, location: loc, note: f.note, sendTo: f.sendTo })); }} data-testid={`consult-form-${c.id}`}>
          <p className="text-xs text-[var(--c-ink-muted)]">Check the firm&apos;s calendar, then choose the one date and time to offer. It is emailed with a Confirm button; nothing is scheduled until they press it.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs">Date<input type="date" className={`${input} mt-1 block`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid={`consult-date-${c.id}`} /></label>
            <label className="text-xs">Time (Central)<input type="time" step={900} className={`${input} mt-1 block`} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} data-testid={`consult-time-${c.id}`} /></label>
            <label className="text-xs">Length<select className={`${input} mt-1 block`} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })}>{[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></label>
            <label className="min-w-[16rem] flex-1 text-xs">Where<select className={`${input} mt-1 block w-full`} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} data-testid={`consult-where-${c.id}`}>{locations.map((l) => <option key={l} value={l}>{l}</option>)}<option value="__other">Somewhere else…</option></select></label>
          </div>
          {f.location === "__other" && <input className={`${input} mt-2 block w-full`} value={f.other} onChange={(e) => setF({ ...f, other: e.target.value })} placeholder="Name and address of the place" aria-label="Place" data-testid={`consult-other-${c.id}`} />}
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs">Email it to<select className={`${input} mt-1 block`} value={f.sendTo} onChange={(e) => setF({ ...f, sendTo: e.target.value })} data-testid={`consult-sendto-${c.id}`}>
              {contacts.map((x) => <option key={x.id} value={x.id}>{x.name} ({partnerName})</option>)}
              {c.hasEmail && <option value="client">{c.clientName || "The person"} directly</option>}
              {contacts.length === 0 && !c.hasEmail && <option value="">No one to send to</option>}
            </select></label>
            <label className="min-w-[14rem] flex-1 text-xs">Note to include <span className="text-[var(--c-ink-muted)]">(optional)</span><input className={`${input} mt-1 block w-full`} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Please bring the papers you were served with." /></label>
            <button type="submit" disabled={pending || !f.date || !f.time || !f.sendTo || !loc} className="inline-flex items-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid={`consult-send-${c.id}`}><Send size={14} /> {pending ? "Sending…" : c.status === "requested" ? "Email this date and time" : "Email the new date and time"}</button>
          </div>
          {contacts.length === 0 && <p className="mt-2 text-xs text-amber-800">No one is listed under &ldquo;their intake team&rdquo; above. Add their contact there, or send it to the person directly.</p>}
        </form>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid={`consult-msg-${c.id}`}>{msg.text}</p>}
    </li>
  );
}

/** On the partner's tab: in-person consultation requests, and the step that offers a real date and time. */
export function PartnerConsults({ rows, contacts, locations, partnerName, partnerSlug, focusId }: { rows: ConsultRow[]; contacts: Contact[]; locations: string[]; partnerName: string; partnerSlug: string; focusId: number | null }) {
  const [showAll, setShowAll] = useState(false);
  const live = rows.filter((r) => r.status !== "cancelled");
  const shown = showAll ? rows : live;
  const waiting = rows.filter((r) => r.status === "requested").length;
  return (
    <div id="consults" className="mb-6 scroll-mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]" data-testid="partner-consults">
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><CalendarClock size={15} /> In-person consultation requests{waiting > 0 && <span className="rounded-full bg-[var(--c-accent)] px-1.5 text-[11px] font-semibold text-white">{waiting} need a time</span>}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">People who asked on the form to meet in person, with the dates that work for them. Offer one date and time; it is emailed to their contact at {partnerName} with a Confirm button. When it is confirmed everyone is emailed, and reminders go out the day before and four hours before.</p>
        </div>
        {rows.length > live.length && <label className="flex items-center gap-2 text-xs text-[var(--c-ink-muted)]"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show cancelled</label>}
      </div>
      {shown.length === 0
        ? <p className="mx-5 mb-5 rounded-md border border-dashed border-[var(--c-border)] px-4 py-3 text-xs text-[var(--c-ink-muted)]" data-testid="consults-empty">No requests yet. They appear here when someone answers &ldquo;Yes&rdquo; to meeting in person on the form.</p>
        : <ul className="divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">{shown.map((c) => <Row key={c.id} c={c} contacts={contacts} locations={locations} partnerName={partnerName} partnerSlug={partnerSlug} focus={focusId === c.id} />)}</ul>}
    </div>
  );
}
