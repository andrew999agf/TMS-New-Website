"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronsRight, Mail, Send, Loader2, Search, Check, Users } from "lucide-react";
import type { IntakeRow } from "./IntakeTable";
import type { ReferralAttorneyRow } from "./ReferralAttorneysManager";
import { previewTurnback, sendTurnback } from "@/app/admin/(panel)/intake/turnback-actions";
import { updateIntakeStatus, setIntakeReferral } from "@/app/admin/(panel)/intake/actions";

const PRETTY_KEY = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function AnswerValue({ v }: { v: unknown }) {
  if (Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && "url" in (x as object))) {
    return (
      <span className="flex flex-col gap-0.5">
        {(v as { name?: string; url: string }[]).map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noreferrer" className="text-[var(--c-accent)] underline underline-offset-2">{f.name ?? `Attachment ${i + 1}`}</a>
        ))}
      </span>
    );
  }
  if (Array.isArray(v)) return <>{v.join(", ")}</>;
  return <>{String(v ?? "")}</>;
}

/* ------------------------------ lead detail drawer ------------------------------ */

export function LeadDetailDrawer({ row, onClose, onTurnback }: { row: IntakeRow | null; onClose: () => void; onTurnback: (r: IntakeRow) => void }) {
  const [content, setContent] = useState(row);
  useEffect(() => { if (row) setContent(row); }, [row]);
  const open = !!row;
  const cur = content;
  const entries = cur ? Object.entries(cur.answers) : [];

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        onTransitionEnd={() => { if (!open) setContent(null); }}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(94vw,620px)] flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)] shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-3">
          <button onClick={onClose} title="Close" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><ChevronsRight size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--c-ink)]">{cur?.name ?? "—"}</p>
            <p className="truncate text-xs text-[var(--c-ink-muted)]">{cur?.branch}{cur?.county ? ` · ${cur.county}` : ""}</p>
          </div>
          {cur?.email && (
            <button onClick={() => cur && onTurnback(cur)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-[var(--c-on-accent)]">
              <Mail size={13} /> Turn-back email
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {cur && (
            <>
              <div className="mb-4 grid gap-x-6 gap-y-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 sm:grid-cols-2">
                <Meta label="Email" value={cur.email} />
                <Meta label="Phone" value={cur.phone} />
                <Meta label="Received" value={new Date(cur.createdAt).toLocaleString()} />
                <Meta label="Matter" value={cur.branch} />
                {cur.deadline && <Meta label="Deadline" value={cur.deadline} />}
                {cur.isUrgent && <Meta label="Urgent" value="Yes" />}
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Intake responses</p>
              <dl className="space-y-2.5">
                {entries.length === 0 && <p className="text-sm text-[var(--c-ink-muted)]">No detailed responses recorded.</p>}
                {entries.map(([k, v]) => (
                  <div key={k} className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--c-ink-muted)]">{PRETTY_KEY(k)}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--c-ink)]"><AnswerValue v={v} /></dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="min-w-20 text-[var(--c-ink-muted)]">{label}</span>
      <span className="min-w-0 break-words text-[var(--c-ink)]">{value}</span>
    </div>
  );
}

/* ------------------------------ turn-back compose ------------------------------ */

export function TurnbackDialog({ row, attorneys, onClose }: { row: IntakeRow; attorneys: ReferralAttorneyRow[]; onClose: () => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [html, setHtml] = useState<string>("");
  const [cc, setCc] = useState<string[]>([]);
  const [loading, startPreview] = useTransition();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNames = useMemo(() => selected.map((id) => attorneys.find((a) => a.id === id)?.name).filter(Boolean) as string[], [selected, attorneys]);

  function close() { router.refresh(); onClose(); }

  function applyReferred() {
    setApplying(true);
    setIntakeReferral(row.id, { referredTo: selectedNames.join(", "), feeExpected: false, feeAmount: "" })
      .then((res) => setStatusMsg(res.ok ? "Marked as Referred Out." : res.error ?? "Couldn't update status."))
      .finally(() => setApplying(false));
  }
  function applyStatus(status: "declined" | "client-declined") {
    setApplying(true);
    updateIntakeStatus(row.id, status)
      .then(() => setStatusMsg(status === "declined" ? "Marked as Declined." : "Marked as Client Declined."))
      .finally(() => setApplying(false));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attorneys.filter((a) => !q || a.name.toLowerCase().includes(q) || a.firm.toLowerCase().includes(q) || a.practiceArea.toLowerCase().includes(q));
  }, [attorneys, query]);

  const refresh = (ids: number[]) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      startPreview(async () => {
        const res = await previewTurnback(row.id, ids);
        if (res.ok) { setHtml(res.html ?? ""); setCc(res.cc ?? []); }
        else setError(res.error ?? "Couldn't build the preview.");
      });
    }, 250);
  };
  useEffect(() => { refresh(selected); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selected]);

  function toggle(id: number) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function send() {
    setSending(true); setError(null);
    sendTurnback(row.id, selected)
      .then((res) => { if (res.ok) { setDone(res.to ?? row.email ?? ""); } else setError(res.error ?? "Send failed."); })
      .finally(() => setSending(false));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-3">
          <h3 className="font-[family-name:var(--font-display)] text-lg">Turn-back email</h3>
          <button onClick={close} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600/10"><Check size={26} className="text-green-600" /></div>
            <p className="text-sm text-[var(--c-ink)]">Turn-back email sent to <strong>{done}</strong>{cc.length ? `, copied to the intake team (${cc.length})` : ""}.</p>

            {statusMsg ? (
              <>
                <p className="text-sm font-medium text-green-700">{statusMsg}</p>
                <button onClick={close} className="btn btn-accent text-sm py-2 px-5">Done</button>
              </>
            ) : (
              <div className="w-full max-w-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-surface2)] p-4">
                <p className="mb-3 text-sm text-[var(--c-ink)]">
                  {selectedNames.length > 0
                    ? <>You referred <strong>{selectedNames.length}</strong> attorney{selectedNames.length === 1 ? "" : "s"}. Mark this lead as <strong>Referred Out</strong>?</>
                    : <>You didn&apos;t include a referral attorney. Mark this lead as <strong>Declined</strong>?</>}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {selectedNames.length > 0 ? (
                    <button onClick={applyReferred} disabled={applying} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">{applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Yes — Referred Out</button>
                  ) : (
                    <button onClick={() => applyStatus("declined")} disabled={applying} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">{applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Yes — Declined</button>
                  )}
                  <button onClick={close} disabled={applying} className="btn btn-outline text-sm py-2 px-4 disabled:opacity-50">No, leave as is</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[300px_1fr]">
            {/* Left: recipients + referral selector */}
            <div className="min-h-0 space-y-4 overflow-y-auto border-b border-[var(--c-border)] p-4 md:border-b-0 md:border-r">
              <div className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-xs">
                <p><span className="text-[var(--c-ink-muted)]">To:</span> <span className="font-medium text-[var(--c-ink)]">{row.email || "— no email —"}</span></p>
                <p className="mt-1 flex items-start gap-1"><Users size={13} className="mt-0.5 shrink-0 text-[var(--c-ink-muted)]" /><span><span className="text-[var(--c-ink-muted)]">CC intake team:</span> {cc.length ? cc.join(", ") : "—"}</span></p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--c-ink)]">Refer to attorneys <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></p>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search attorneys…" className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--c-accent)]" />
                </div>
                <div className="max-h-[38vh] space-y-1 overflow-y-auto">
                  {filtered.length === 0 && <p className="px-1 py-2 text-xs text-[var(--c-ink-muted)]">No matches.</p>}
                  {filtered.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--c-surface2)]">
                      <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-[var(--c-ink)]">{a.name}</span>
                        {(a.firm || a.practiceArea) && <span className="block truncate text-[11px] text-[var(--c-ink-muted)]">{[a.firm, a.practiceArea].filter(Boolean).join(" · ")}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--c-ink-muted)]">Checked attorneys are listed in the email. Leave all unchecked to omit the referral section.</p>
              </div>

              {selected.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-[var(--c-ink)]">Referring to</p>
                  <ul className="space-y-2">
                    {selected.map((id) => attorneys.find((a) => a.id === id)).filter(Boolean).map((a) => (
                      <li key={a!.id} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2 text-[11px]">
                        <p className="font-medium text-[var(--c-ink)]">{a!.name}{a!.firm ? ` · ${a!.firm}` : ""}</p>
                        {(a!.address || a!.phone) && <p className="text-[var(--c-ink-muted)]">{[a!.address, a!.phone].filter(Boolean).join(" · ")}</p>}
                        {(a!.email || a!.website) && <p className="text-[var(--c-ink-muted)]">{[a!.email, a!.website].filter(Boolean).join(" · ")}</p>}
                        <p className={`mt-0.5 ${a!.email ? "text-green-700" : "text-amber-600"}`}>{a!.email ? "✓ Will receive a brief referral notice" : "No email on file — won't be notified"}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right: live preview */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-2 text-xs text-[var(--c-ink-muted)]">
                Email preview {loading && <Loader2 size={12} className="animate-spin" />}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden bg-white">
                {html ? <iframe srcDoc={html} title="Email preview" className="h-full min-h-[45vh] w-full border-0" /> : <div className="flex h-full items-center justify-center text-sm text-[var(--c-ink-muted)]">Building preview…</div>}
              </div>
            </div>
          </div>
        )}

        {!done && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--c-border)] px-5 py-3">
            <p className="text-xs text-[var(--c-error)]">{error}</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
              <button onClick={send} disabled={sending || !row.email} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send{selected.length ? ` with ${selected.length} referral${selected.length === 1 ? "" : "s"}` : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
