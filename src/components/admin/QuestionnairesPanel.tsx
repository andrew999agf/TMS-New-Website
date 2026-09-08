"use client";

import { useState, useTransition } from "react";
import { ClipboardList, ExternalLink, Mail, Loader2, X, Check, ChevronDown } from "lucide-react";
import { sendQuestionnaire } from "@/app/admin/(panel)/intake/send-actions";
import { CLIENT_QUESTIONNAIRES, type ClientQuestionnaire } from "@/lib/intake/questionnaires";

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

/**
 * Browseable client questionnaires — standalone forms the office emails to a
 * client with the firm's branded cover note. Each runs entirely in the
 * client's browser; they print to PDF or download a summary and send it back.
 */
export function QuestionnairesPanel() {
  const [open, setOpen] = useState(false);
  const [sendFor, setSendFor] = useState<ClientQuestionnaire | null>(null);

  return (
    <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ClipboardList size={16} className="text-[var(--c-accent)]" />
        <span className="font-[family-name:var(--font-ui)] text-sm font-semibold">Client questionnaires</span>
        <span className="text-xs text-[var(--c-ink-muted)]">— email a fill-out-and-return form ({CLIENT_QUESTIONNAIRES.length})</span>
        <ChevronDown size={15} className={`ml-auto text-[var(--c-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--c-border)] p-4">
          <p className="mb-3 text-xs text-[var(--c-ink-muted)]">
            These forms run entirely in the client&apos;s browser — nothing is submitted to the website. The client prints to PDF or downloads a summary and sends it back by email.
          </p>
          <ul className="space-y-2">
            {CLIENT_QUESTIONNAIRES.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--c-ink)]">{q.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--c-ink-muted)]">{q.blurb} <span className="whitespace-nowrap">~{q.minutes} min.</span></span>
                </span>
                <a href={q.path} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
                  <ExternalLink size={13} /> Preview
                </a>
                <button onClick={() => setSendFor(q)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
                  <Mail size={13} /> Send to a client
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sendFor && <SendQuestionnaireDialog q={sendFor} onClose={() => setSendFor(null)} />}
    </div>
  );
}

function SendQuestionnaireDialog({ q, onClose }: { q: ClientQuestionnaire; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const r = await sendQuestionnaire({ name, email, questionnaireId: q.id, note });
      if (!r.ok) { setError(r.error ?? "Couldn't send."); return; }
      setDone(true);
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-[var(--c-surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-display)] text-lg">Send: {q.label}</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>
        {done ? (
          <>
            <p className="flex items-center gap-2 text-sm text-[var(--c-success)]"><Check size={16} /> Sent to {email.trim()}.</p>
            <div className="mt-5 flex justify-end"><button onClick={onClose} className="btn btn-accent px-4 py-2 text-sm">Done</button></div>
          </>
        ) : (
          <>
            <label className="block text-xs font-medium">Client&apos;s name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className={`${input} mt-1 w-full`} />
            </label>
            <label className="mt-3 block text-xs font-medium">Client&apos;s email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className={`${input} mt-1 w-full`} />
            </label>
            <label className="mt-3 block text-xs font-medium">Personal note <span className="font-normal text-[var(--c-ink-muted)]">(optional — appears in the email)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g., As we discussed on the phone today…" className={`${input} mt-1 w-full`} />
            </label>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
              The email uses the firm&apos;s branded template: what the form is for, that it takes about {q.minutes} minutes, how to return it (print to PDF or download the summary and reply), and the no-attorney-client-relationship disclaimer.
            </p>
            {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="btn btn-outline px-4 py-2 text-sm">Cancel</button>
              <button onClick={send} disabled={pending || !email.trim()} className="btn btn-accent px-4 py-2 text-sm disabled:opacity-50">
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
