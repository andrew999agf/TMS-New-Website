"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronsRight, Mail, Send, Loader2, Search, Check, Users } from "lucide-react";
import type { IntakeRow } from "./IntakeTable";
import type { ReferralAttorneyRow } from "./ReferralAttorneysManager";
import { previewTurnback, sendTurnback } from "@/app/admin/(panel)/intake/turnback-actions";
import { updateIntakeStatus, setIntakeReferral } from "@/app/admin/(panel)/intake/actions";

const PRETTY_KEY = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const isEmail = (s?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s ?? "").trim());

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

type CustomAttorney = { name: string; firm: string; address: string; phone: string; email: string; website: string; practiceArea: string };
const EMPTY_CUSTOM: CustomAttorney = { name: "", firm: "", address: "", phone: "", email: "", website: "", practiceArea: "" };

export function TurnbackDialog({ row, attorneys, onClose }: { row: IntakeRow; attorneys: ReferralAttorneyRow[]; onClose: () => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [html, setHtml] = useState<string>("");
  // To and CC are editable — prospects mistype their address, and the team
  // sometimes needs to copy someone extra. Seeded from the lead/branch defaults.
  const [to, setTo] = useState<string>((row.email ?? "").trim());
  const [saveEmail, setSaveEmail] = useState(true);
  const [cc, setCc] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState("");
  const [ccError, setCcError] = useState<string | null>(null);
  const ccSeeded = useRef(false);
  const [loading, startPreview] = useTransition();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState("");
  // Opt-in, and deliberately off: telling counsel is the exception, not the
  // default, so nobody gets emailed unless this is ticked on purpose.
  const [notifyAttorneys, setNotifyAttorneys] = useState(false);
  const [customList, setCustomList] = useState<CustomAttorney[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [cf, setCf] = useState<CustomAttorney>(EMPTY_CUSTOM);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Referral attorneys we could email a courtesy notice to (those with an
  // address on file). Only when there's at least one does the opt-in appear.
  const notifiable = useMemo(() => {
    const addrs = [
      ...selected.map((id) => attorneys.find((a) => a.id === id)?.email),
      ...customList.map((c) => c.email),
    ];
    return addrs.filter(isEmail).length;
  }, [selected, customList, attorneys]);

  const selectedNames = useMemo(() => selected.map((id) => attorneys.find((a) => a.id === id)?.name).filter(Boolean) as string[], [selected, attorneys]);
  const allNames = useMemo(() => [...selectedNames, ...customList.map((c) => c.name)], [selectedNames, customList]);
  const totalReferrals = selected.length + customList.length;

  function addCustom() { if (!cf.name.trim()) return; setCustomList((l) => [...l, { ...cf }]); setCf(EMPTY_CUSTOM); setShowCustom(false); }
  function removeCustom(i: number) { setCustomList((l) => l.filter((_, x) => x !== i)); }

  function close() { router.refresh(); onClose(); }

  function applyReferred() {
    setApplying(true);
    setIntakeReferral(row.id, { referredTo: allNames.join(", "), feeExpected: false, feeAmount: "" })
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

  // Rebuild the live preview whenever the selection, custom attorneys, or note change.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      startPreview(async () => {
        const res = await previewTurnback(row.id, selected, { note, customAttorneys: customList });
        if (res.ok) {
          setHtml(res.html ?? "");
          // Seed the CC list from the branch default once — after that it's the
          // admin's to edit, so later preview refreshes must not overwrite it.
          if (!ccSeeded.current) { setCc(res.cc ?? []); ccSeeded.current = true; }
        } else setError(res.error ?? "Couldn't build the preview.");
      });
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, note, customList]);

  function toggle(id: number) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const toValid = isEmail(to);
  const emailChanged = to.trim().toLowerCase() !== (row.email ?? "").trim().toLowerCase();

  /** Accept one or several pasted addresses (comma/semicolon/space separated). */
  function addCc(raw?: string) {
    const text = (raw ?? ccDraft).trim();
    if (!text) return;
    const parts = text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const bad = parts.filter((p) => !isEmail(p));
    if (bad.length) { setCcError(`Not a valid email: ${bad[0]}`); return; }
    setCc((cur) => {
      const seen = new Set(cur.map((e) => e.toLowerCase()));
      const next = [...cur];
      for (const p of parts) {
        if (seen.has(p.toLowerCase())) continue;
        seen.add(p.toLowerCase());
        next.push(p);
      }
      return next;
    });
    setCcDraft(""); setCcError(null);
  }
  function removeCc(email: string) { setCc((cur) => cur.filter((e) => e !== email)); }

  /** Clicking Send: validate, then ask about notifying counsel if that applies. */
  function send() {
    const addr = to.trim();
    if (!isEmail(addr)) { setError(addr ? `“${addr}” isn't a valid email address.` : "Enter an email address to send to."); return; }
    setError(null);
    doSend();
  }

  function doSend() {
    setSending(true); setError(null);
    const addr = to.trim();
    sendTurnback(row.id, selected, { note, customAttorneys: customList, to: addr, cc, saveEmail: saveEmail && emailChanged, notifyAttorneys })
      .then((res) => { if (res.ok) { setDone(res.to ?? addr); } else setError(res.error ?? "Send failed."); })
      .finally(() => setSending(false));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-3">
          <h3 className="font-[family-name:var(--font-display)] text-lg">Turn-back email</h3>
          <button onClick={close} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600/10"><Check size={26} className="text-green-600" /></div>
            <p className="text-sm text-[var(--c-ink)]">
              Turn-back email sent to <strong>{done}</strong>{cc.length ? <>, copied to <strong>{cc.length}</strong> other{cc.length === 1 ? "" : "s"}</> : ""}.
              {saveEmail && emailChanged && <><br /><span className="text-xs text-[var(--c-ink-muted)]">The corrected address was saved to this lead.</span></>}
              {notifiable > 0 && <><br /><span className="text-xs text-[var(--c-ink-muted)]">{notifyAttorneys ? `Referral ${notifiable === 1 ? "attorney was" : "attorneys were"} notified.` : `Referral ${notifiable === 1 ? "attorney was" : "attorneys were"} not contacted.`}</span></>}
            </p>

            {statusMsg ? (
              <>
                <p className="text-sm font-medium text-green-700">{statusMsg}</p>
                <button onClick={close} className="btn btn-accent text-sm py-2 px-5">Done</button>
              </>
            ) : (
              <div className="w-full max-w-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-surface2)] p-4">
                <p className="mb-3 text-sm text-[var(--c-ink)]">
                  {allNames.length > 0
                    ? <>You referred <strong>{allNames.length}</strong> attorney{allNames.length === 1 ? "" : "s"}. Mark this lead as <strong>Referred Out</strong>?</>
                    : <>You didn&apos;t include a referral attorney. Mark this lead as <strong>Declined</strong>?</>}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {allNames.length > 0 ? (
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
              <div className="space-y-2.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">To</label>
                  <input
                    value={to}
                    onChange={(e) => { setTo(e.target.value); setError(null); }}
                    placeholder="name@example.com"
                    className={`w-full rounded-md border bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none ${to.trim() && !toValid ? "border-[var(--c-error)]" : "border-[var(--c-border)] focus:border-[var(--c-accent)]"}`}
                  />
                  {to.trim() && !toValid && <p className="mt-1 text-[11px] text-[var(--c-error)]">That doesn&apos;t look like a valid email address.</p>}
                  {emailChanged && toValid && (
                    <>
                      <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Submitted as <span className="line-through">{row.email || "(blank)"}</span></p>
                      <label className="mt-1 flex cursor-pointer items-start gap-1.5 text-[11px] text-[var(--c-ink-muted)]">
                        <input type="checkbox" checked={saveEmail} onChange={(e) => setSaveEmail(e.target.checked)} className="mt-0.5 shrink-0" />
                        <span>Also fix this address on the lead record</span>
                      </label>
                    </>
                  )}
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--c-ink)]"><Users size={12} className="text-[var(--c-ink-muted)]" /> CC</label>
                  {cc.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {cc.map((e) => (
                        <span key={e} className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[var(--c-surface2)] px-2 py-0.5 text-[11px]">
                          {e}
                          <button onClick={() => removeCc(e)} aria-label={`Remove ${e}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      value={ccDraft}
                      onChange={(e) => { setCcDraft(e.target.value); setCcError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addCc(); } }}
                      onBlur={() => ccDraft.trim() && addCc()}
                      placeholder="Add an email…"
                      className="min-w-0 flex-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]"
                    />
                    <button onClick={() => addCc()} className="shrink-0 rounded-md border border-[var(--c-border)] px-2 py-1.5 text-xs hover:bg-[var(--c-surface2)]">Add</button>
                  </div>
                  {ccError && <p className="mt-1 text-[11px] text-[var(--c-error)]">{ccError}</p>}
                  {cc.length === 0 && !ccError && <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">No one copied — the intake team won&apos;t get a record of this.</p>}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--c-ink)]">Personal note <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="A short custom message to this person — it appears near the top of the email." className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]" />
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
                {notifiable > 0 && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2 text-[11px]">
                    <input type="checkbox" checked={notifyAttorneys} onChange={(e) => setNotifyAttorneys(e.target.checked)} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block font-semibold text-[var(--c-ink)]">Also let {notifiable === 1 ? "the attorney" : "the attorneys"} know</span>
                      <span className="block text-[var(--c-ink-muted)]">
                        Off by default. Ticking this emails {notifiable === 1 ? "the referral attorney" : `the ${notifiable} referral attorneys`} a short courtesy note — practice area and last name only.
                      </span>
                    </span>
                  </label>
                )}

                {/* Custom / one-off attorney not in the stable */}
                {!showCustom ? (
                  <button type="button" onClick={() => setShowCustom(true)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--c-accent)] hover:underline">+ Add a custom attorney (not in the list)</button>
                ) : (
                  <div className="mt-2 space-y-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5">
                    <input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} placeholder="Attorney or firm name *" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" autoFocus />
                    <input value={cf.firm} onChange={(e) => setCf({ ...cf, firm: e.target.value })} placeholder="Firm" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={cf.phone} onChange={(e) => setCf({ ...cf, phone: e.target.value })} placeholder="Phone" className="rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                      <input value={cf.email} onChange={(e) => setCf({ ...cf, email: e.target.value })} placeholder="Email" className="rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                    </div>
                    <input value={cf.practiceArea} onChange={(e) => setCf({ ...cf, practiceArea: e.target.value })} placeholder="Practice area" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                    <input value={cf.website} onChange={(e) => setCf({ ...cf, website: e.target.value })} placeholder="Website" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                    <input value={cf.address} onChange={(e) => setCf({ ...cf, address: e.target.value })} placeholder="Address" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--c-accent)]" />
                    <div className="flex gap-2 pt-0.5">
                      <button type="button" onClick={addCustom} disabled={!cf.name.trim()} className="btn btn-accent text-xs py-1 px-3 disabled:opacity-50">Add</button>
                      <button type="button" onClick={() => { setShowCustom(false); setCf(EMPTY_CUSTOM); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {(selected.length > 0 || customList.length > 0) && (
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
                    {customList.map((a, i) => (
                      <li key={`c-${i}`} className="rounded-md border border-[var(--c-accent)]/40 bg-[var(--c-bg)] p-2 text-[11px]">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-[var(--c-ink)]">{a.name}{a.firm ? ` · ${a.firm}` : ""} <span className="text-[var(--c-accent)]">(custom)</span></p>
                          <button type="button" onClick={() => removeCustom(i)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={12} /></button>
                        </div>
                        {(a.address || a.phone) && <p className="text-[var(--c-ink-muted)]">{[a.address, a.phone].filter(Boolean).join(" · ")}</p>}
                        {(a.email || a.website) && <p className="text-[var(--c-ink-muted)]">{[a.email, a.website].filter(Boolean).join(" · ")}</p>}
                        <p className={`mt-0.5 ${a.email ? "text-green-700" : "text-amber-600"}`}>{a.email ? "✓ Will receive a brief referral notice" : "No email — won't be notified"}</p>
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
              <button onClick={send} disabled={sending || !toValid} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send{totalReferrals ? ` with ${totalReferrals} referral${totalReferrals === 1 ? "" : "s"}` : ""}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
