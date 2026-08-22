"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Trash2, FileText, ExternalLink, Hash, ListOrdered, CornerDownLeft, AlertCircle, Check, StickyNote,
  Share2, Link as LinkIcon, Download, Globe, Lock, ShieldCheck, Mail, RefreshCw, GripVertical, ListChecks, Scale, Printer, Flag,
  LayoutGrid, List as ListIcon,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { parseExhibitName, suggestOrder, getScheme, SIDE_LABEL, FOUNDATION_OPTIONS, type Side } from "@/lib/pretrial/exhibits";
import { filesFromDrop, countDropItems, fromInput, type PickedFile } from "@/lib/share/drop";
import { PopMenu } from "./PopMenu";
import {
  addExhibitDoc, updateExhibitDoc, deleteExhibitDoc, replaceExhibitFile, setExhibitHiRes, setExhibitListDoc, searchExhibitSet, getDocPages, setSetAccess,
  addExhibitWitness, deleteExhibitWitness, addExhibitClaim, deleteExhibitClaim, addExhibitElement, deleteExhibitElement,
  addExhibitRecipient, resendExhibitInvite, setExhibitRecipientRevoked, deleteExhibitRecipient, setOcShare, buildPrintCopy, decideColorPage, setExhibitOmitted,
  type SetSearchHit,
} from "@/app/admin/(panel)/exhibit-reviewer/actions";

export type ReviewerDoc = {
  id: number; side: string; number: number | null; label: string; title: string; description: string; priority: string; trialStatus: string; bates: string; batesEnd: string;
  witnessIds: number[]; foundation: string[]; elementIds: number[]; notes: string;
  /** Soft "taken off the exhibit list" flag. */
  omitted: boolean;
  hasFile: boolean; pageCount: number | null; sizeBytes: number | null; sort: number;
  /** Changes whenever the underlying PDF changes, so the viewer/cache reload it. */
  fileTag: string;
  /** Optional high-resolution version. */
  hasHiRes: boolean; hiResTag: string;
  /** Print-optimized copy state: null (not prepared) | bw | mixed | color | skipped. */
  colorStatus: string | null;
  /** How many pages stay in color in the print copy. */
  colorPageCount: number;
  /** 1-based pages the detector was unsure about, awaiting a color/gray call. */
  reviewPages: number[];
};

export type WitnessLite = { id: number; name: string };
export type ClaimLite = { id: number; name: string };
export type ElementLite = { id: number; claimId: number; text: string };
export type RecipientLite = { id: number; email: string; name: string; token: string; revoked: boolean };

/** The review flags, in the order they read on the light. */
/**
 * Two independent flags per exhibit, kept visually distinct on purpose:
 *
 *  - PRIORITY is the team's own prep judgment, shown as a FADED pill that spells
 *    the word out (Priority / Neutral / Low). Soft colour = a subjective call.
 *  - TRIAL STATUS is the court's actual ruling, shown as a SOLID dot (Admitted /
 *    Offered–pending / Excluded). Solid colour = a hard fact. The words show in
 *    its picker, its tooltip, and the admitted-exhibits summary.
 *
 * Same green/amber/red family for both so the meaning reads instantly; faded vs
 * solid (and word-pill vs dot) is what tells the two apart.
 */
const PRIORITY_META: Record<string, { label: string; short: string; dot: string; pill: string }> = {
  green: { label: "Priority", short: "Priority", dot: "#16a34a", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  yellow: { label: "Neutral", short: "Neutral", dot: "#ca8a04", pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  red: { label: "Low priority / bad", short: "Low", dot: "#dc2626", pill: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};
const PRIORITY_ORDER = ["green", "yellow", "red", "none"];

const STATUS_META: Record<string, { label: string; short: string; color: string }> = {
  admitted: { label: "Admitted", short: "Admitted", color: "#16a34a" },
  pending: { label: "Offered — ruling pending", short: "Pending", color: "#eab308" },
  excluded: { label: "Excluded — objection sustained", short: "Excluded", color: "#dc2626" },
};
const STATUS_ORDER = ["admitted", "pending", "excluded", "none"];

/** An off-white circle with a diagonal slash — the "not set" state for both flags. */
function SlashDot({ size = 12 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)]" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden><line x1="3.5" y1="10.5" x2="10.5" y2="3.5" stroke="var(--c-ink-muted)" strokeWidth="1.5" /></svg>
    </span>
  );
}

/** Priority: a faded pill that says the word, or a slash circle when unset. */
function PriorityChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = PRIORITY_META[value];
  const current = m ? `Priority: ${m.label}` : "Set priority";
  return (
    <PopMenu
      width={200}
      title={`${current} — click to change`}
      className="mt-0.5 inline-flex shrink-0 items-center rounded-full transition hover:ring-2 hover:ring-[var(--c-accent)]/30"
      label={
        m ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.pill}`}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.dot }} /> {m.short}
          </span>
        ) : (
          <SlashDot />
        )
      }
    >
      {(close) => (
        <div className="py-0.5">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Priority (prep)</div>
          {PRIORITY_ORDER.map((id) => {
            const pm = PRIORITY_META[id];
            return (
              <button key={id} onMouseDown={(e) => { e.preventDefault(); close(); onChange(id); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10">
                {pm ? <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: pm.dot }} /> : <SlashDot size={12} />}
                <span className="flex-1 text-[var(--c-ink)]">{pm?.label ?? "None"}</span>
                {value === id && <Check size={12} className="text-[var(--c-accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </PopMenu>
  );
}

/** Trial status: a solid dot (or slash when unset). Words live in the menu. */
function StatusBubble({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = STATUS_META[value];
  return (
    <PopMenu
      width={220}
      title={m ? `Trial status: ${m.label} — click to change` : "Set trial status"}
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition hover:ring-2 hover:ring-[var(--c-accent)]/30"
      label={m ? <span className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: m.color }} /> : <SlashDot />}
    >
      {(close) => (
        <div className="py-0.5">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Trial status</div>
          {STATUS_ORDER.map((id) => {
            const sm = STATUS_META[id];
            return (
              <button key={id} onMouseDown={(e) => { e.preventDefault(); close(); onChange(id); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10">
                {sm ? <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: sm.color }} /> : <SlashDot size={12} />}
                <span className="flex-1 text-[var(--c-ink)]">{sm?.label ?? "Not offered"}</span>
                {value === id && <Check size={12} className="text-[var(--c-accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </PopMenu>
  );
}

/**
 * The row notepad. The icon is muted while empty and turns amber once there's a
 * note, so you can see at a glance which exhibits carry one. Clicking opens a
 * little box; edits autosave (debounced, and again on blur) so closing the
 * popover — however you close it — never loses what you typed.
 */
function NoteButton({ notes, onSave }: { notes: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(notes);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Don't clobber what's being typed when a save round-trips new props back.
  useEffect(() => { if (!focused.current) setDraft(notes); }, [notes]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const hasNotes = notes.trim().length > 0;
  const change = (v: string) => {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(v), 500);
  };
  const flush = (v: string) => { if (timer.current) clearTimeout(timer.current); if (v !== notes) onSave(v); };

  return (
    <PopMenu
      width={264}
      title={hasNotes ? "Notes — click to edit" : "Add a note"}
      className={`mt-0.5 rounded p-1 transition-colors hover:text-[var(--c-accent)] ${hasNotes ? "text-amber-500 dark:text-amber-400" : "text-[var(--c-ink-muted)] opacity-50 hover:opacity-100"}`}
      label={<StickyNote size={13} />}
    >
      {() => (
        <div className="p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--c-ink-muted)]"><StickyNote size={12} className="text-amber-500" /> Notes</div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => change(e.target.value)}
            onFocus={() => { focused.current = true; }}
            onBlur={(e) => { focused.current = false; flush(e.target.value); }}
            rows={6}
            placeholder="Notes about this exhibit…"
            className="w-full resize-y rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-amber-500"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--c-ink-muted)]">
            <span>Saves automatically</span>
            {draft.trim() && <button onMouseDown={(e) => { e.preventDefault(); change(""); }} className="hover:text-red-600">Clear</button>}
          </div>
        </div>
      )}
    </PopMenu>
  );
}

/**
 * The sharing dialog: three modes, secure by default.
 *   Off        — firm only, no links resolve.
 *   Restricted — named people, each verified by a one-time code emailed to them.
 *                A forwarded link won't let anyone else in. (Default when sharing.)
 *   Public     — anyone with the link can view (no sign-in), plus a link tree.
 */
function ShareDialog({ setId, access, token, recipients, docs, ocEnabled, ocToken, onCopy, onFlash, onClose }: {
  setId: number; access: string; token: string | null; recipients: RecipientLite[]; docs: ReviewerDoc[];
  ocEnabled: boolean; ocToken: string | null;
  onCopy: (text: string, label: string) => void; onFlash: (m: string) => void; onClose: () => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [mode, setMode] = useState(access);
  const [tok, setTok] = useState(token);
  const [pendingMode, setPendingMode] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oc, setOc] = useState(ocEnabled);
  const [ocTok, setOcTok] = useState(ocToken);
  useEffect(() => { setMode(access); setTok(token); setOc(ocEnabled); setOcTok(ocToken); }, [access, token, ocEnabled, ocToken]);

  function toggleOc(next: boolean) {
    setOc(next);
    start(async () => { const r = await setOcShare(setId, next); if (r.ok) setOcTok(r.token); router.refresh(); });
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const treeUrl = tok ? `${origin}/exhibits/${tok}` : "";
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? "Something went wrong."); router.refresh(); });

  function choose(next: string) {
    setError(null);
    setMode(next);
    setPendingMode(true);
    start(async () => {
      const r = await setSetAccess(setId, next);
      if (r.ok) setTok(r.token); else setError(r.error ?? "Couldn't change sharing.");
      setPendingMode(false);
      router.refresh();
    });
  }

  async function add() {
    const e = email.trim();
    if (!e) return;
    setAdding(true); setError(null);
    const r = await addExhibitRecipient(setId, e, name.trim());
    setAdding(false);
    if (r.ok) { setEmail(""); setName(""); onFlash(r.error ? r.error : `Invite sent to ${e}`); router.refresh(); }
    else setError(r.error ?? "Couldn't add the person.");
  }

  function downloadTree() {
    if (!tok) return;
    const order: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };
    const sorted = docs.slice().sort((a, b) => (order[a.side] - order[b.side]) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const items = sorted.map((d) => `    <li><a href="${origin}/exhibits/${tok}/e/${d.id}">${esc(d.label || String(d.number ?? ""))}${d.title ? ` — ${esc(d.title)}` : ""}</a></li>`).join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Exhibit links</title><style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;padding:0 16px;color:#26211a}h1{font-size:20px}a{color:#7c1d2b}li{margin:6px 0}p{color:#666;font-size:12px}</style></head><body>\n  <h1>Exhibit links</h1>\n  <p>Full index: <a href="${treeUrl}">${treeUrl}</a></p>\n  <ul>\n${items}\n  </ul>\n  <p>These links work only while sharing is turned on.</p>\n</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "exhibit-links.html"; a.click();
    URL.revokeObjectURL(url);
    onFlash("Link tree downloaded");
  }

  const MODES: { id: string; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: "off", label: "Off — firm only", hint: "Nothing is shared. No links work.", icon: <Lock size={15} /> },
    { id: "restricted", label: "Named people (verified by email)", hint: "Each person gets their own link and must enter a one-time code emailed to them. A forwarded link won't work for anyone else.", icon: <ShieldCheck size={15} /> },
    { id: "public", label: "Anyone with the link", hint: "No sign-in. Anyone who has a link can view — use only when there's no protective order.", icon: <Globe size={15} /> },
  ];
  const btn = "rounded border border-[var(--c-border)] px-2 py-1 text-[11px] hover:bg-[var(--c-surface2)]";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="my-6 w-full max-w-lg rounded-lg bg-[var(--c-surface)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-lg"><Share2 size={16} className="text-[var(--c-accent)]" /> Share exhibits</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>

        {error && <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {MODES.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors ${mode === m.id ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] hover:border-[var(--c-accent)]/40"}`}>
              <input type="radio" name="access" checked={mode === m.id} disabled={pendingMode} onChange={() => choose(m.id)} className="mt-0.5 accent-[var(--c-accent)]" />
              <span className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]">{m.icon} {m.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--c-ink-muted)]">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "restricted" && (
          <div className="mt-4 rounded-md border border-[var(--c-border)] p-3">
            <div className="mb-2 text-[11px] font-semibold text-[var(--c-ink)]">People who can view</div>
            {recipients.length === 0 && <p className="mb-2 text-[11px] text-[var(--c-ink-muted)]">No one invited yet. Add an email below — they&apos;ll get a link and verify with a one-time code.</p>}
            <ul className="space-y-1.5">
              {recipients.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] p-2 text-xs ${r.revoked ? "opacity-60" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[var(--c-ink)]">{r.email}{r.revoked ? " · revoked" : ""}</span>
                    {r.name && <span className="block truncate text-[10px] text-[var(--c-ink-muted)]">{r.name}</span>}
                  </span>
                  <button onClick={() => onCopy(`${origin}/exhibits/r/${r.token}`, "Personal link copied")} className={btn} title="Copy this person's link"><LinkIcon size={11} className="mr-1 inline" />Link</button>
                  <button onClick={() => run(() => resendExhibitInvite(r.id))} className={btn} title="Resend the invite email">Resend</button>
                  <button onClick={() => run(() => setExhibitRecipientRevoked(r.id, !r.revoked))} className={btn}>{r.revoked ? "Restore" : "Revoke"}</button>
                  <button onClick={() => { if (confirm(`Remove ${r.email}?`)) run(() => deleteExhibitRecipient(r.id)); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-[1.4fr_1fr_auto]">
              <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="email@firm.com" className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-xs" />
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Name (optional)" className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-xs" />
              <button onClick={add} disabled={adding || !email.trim()} className="btn btn-accent inline-flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50">{adding ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Invite</button>
            </div>
          </div>
        )}

        {mode === "public" && tok && (
          <div className="mt-4 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Link tree — all exhibits</div>
            <div className="mt-1 truncate text-[11px] text-[var(--c-ink)]" title={treeUrl}>{treeUrl}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => onCopy(treeUrl, "Link tree copied")} className={btn}><LinkIcon size={11} className="mr-1 inline" />Copy link</button>
              <a href={treeUrl} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={11} className="mr-1 inline" />Open</a>
              <button onClick={downloadTree} className={btn}><Download size={11} className="mr-1 inline" />Download</button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--c-ink-muted)]">Each exhibit also has its own link — the link icon on a row (or in the viewer) copies it.</p>
          </div>
        )}

        {/* Opposing counsel — a completely separate, names-only link. */}
        <div className="mt-4 rounded-md border border-[var(--c-border)] p-3">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={oc} onChange={(e) => toggleOc(e.target.checked)} className="mt-0.5 accent-[var(--c-accent)]" />
            <span className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]"><Scale size={15} /> Opposing-counsel link (names only)</span>
              <span className="mt-0.5 block text-xs text-[var(--c-ink-muted)]">A separate link that shows only the exhibit numbers and names and the files themselves — never the Bates, page counts, or descriptions. Safe to send the other side.</span>
            </span>
          </label>
          {oc && ocTok && (
            <div className="mt-2 rounded border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
              <div className="truncate text-[11px] text-[var(--c-ink)]" title={`${origin}/exhibits/oc/${ocTok}`}>{origin}/exhibits/oc/{ocTok}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button onClick={() => onCopy(`${origin}/exhibits/oc/${ocTok}`, "Opposing-counsel link copied")} className={btn}><LinkIcon size={11} className="mr-1 inline" />Copy link</button>
                <a href={`${origin}/exhibits/oc/${ocTok}`} target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={11} className="mr-1 inline" />Preview</a>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="btn btn-accent text-sm py-2 px-4">Done</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Download exhibits as a ZIP: everything, just the current side, or a number
 * range (e.g. P-1 through P-20). Files come out named in exhibit order.
 */
function DownloadZip({ setId, docs, side, includeOmitted }: { setId: number; docs: ReviewerDoc[]; side: Side; includeOmitted: boolean }) {
  const withFile = docs.filter((d) => d.hasFile);
  const sideDocs = withFile.filter((d) => d.side === side);
  const nums = sideDocs.map((d) => d.number).filter((n): n is number => n != null);
  const [rangeSide, setRangeSide] = useState<Side>(side);
  const [from, setFrom] = useState(nums.length ? String(Math.min(...nums)) : "");
  const [to, setTo] = useState(nums.length ? String(Math.max(...nums)) : "");
  useEffect(() => { setRangeSide(side); }, [side]);

  const base = `/admin/exhibit-reviewer/${setId}/zip`;
  // When omitted exhibits are hidden, the download excludes them too, so it
  // mirrors exactly what's on screen.
  const go = (qs: string) => { const full = includeOmitted ? qs : `${qs}${qs.includes("?") ? "&" : "?"}omitted=0`; const a = document.createElement("a"); a.href = `${base}${full}`; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); };
  const item = "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10";

  return (
    <PopMenu
      width={280}
      title="Download exhibits as a ZIP"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] transition-colors hover:border-[var(--c-accent)]"
      label={<><Download size={13} /> ZIP</>}
    >
      {(close) => (
        <div className="p-2">
          <button onClick={() => { close(); go(""); }} disabled={withFile.length === 0} className={item + " disabled:opacity-40"}>
            <span className="font-semibold text-[var(--c-ink)]">All exhibits</span> <span className="text-[var(--c-ink-muted)]">({withFile.length})</span>
          </button>
          <button onClick={() => { close(); go(`?side=${side}`); }} disabled={sideDocs.length === 0} className={item + " disabled:opacity-40"}>
            <span className="font-semibold text-[var(--c-ink)]">This tab — {SIDE_LABEL[side]}</span> <span className="text-[var(--c-ink-muted)]">({sideDocs.length})</span>
          </button>
          <div className="mt-1.5 border-t border-[var(--c-border)] pt-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">A range</div>
            <div className="flex flex-wrap items-center gap-1.5 px-2">
              <select value={rangeSide} onChange={(e) => setRangeSide(e.target.value as Side)} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-1 text-xs">
                <option value="plaintiff">P</option><option value="defendant">D</option><option value="joint">J</option>
              </select>
              <input value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d]/g, ""))} placeholder="from" inputMode="numeric" className="w-14 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-xs" />
              <span className="text-[var(--c-ink-muted)]">to</span>
              <input value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d]/g, ""))} placeholder="to" inputMode="numeric" className="w-14 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-xs" />
              <button
                onClick={() => { close(); const p = new URLSearchParams({ side: rangeSide }); if (from) p.set("from", from); if (to) p.set("to", to); go(`?${p.toString()}`); }}
                className="btn btn-accent ml-auto text-xs py-1 px-2.5"
              >
                <Download size={12} /> Get
              </button>
            </div>
            <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-[var(--c-ink-muted)]">e.g. {SIDE_LABEL[rangeSide].replace("'s exhibits", "")} {from || "1"}&ndash;{to || "20"}. Files come out numbered in order.</p>
          </div>
        </div>
      )}
    </PopMenu>
  );
}

/**
 * Print-optimized ("cheaper printing") copy. Scans read as color at the print
 * shop even when the document is black-and-white — the exhibit sticker and
 * scanner noise trip the printer's auto color detection, doubling the cost.
 * This prepares a grayscale copy of every effectively-B&W page (disregarding
 * the sticker) while leaving genuinely-color pages in color, then downloads it
 * as one book the printer bills correctly on its own. Deliberately low-key.
 */
function PrintPrep({ setId, docs, side, includeOmitted }: { setId: number; docs: ReviewerDoc[]; side: Side; includeOmitted: boolean }) {
  const router = useRouter();
  const withFile = docs.filter((d) => d.hasFile);
  const prepared = withFile.filter((d) => d.colorStatus != null);
  const pending = withFile.filter((d) => d.colorStatus == null);
  const colorPagesTotal = prepared.reduce((n, d) => n + (d.colorPageCount || 0), 0);
  const flagged = withFile.filter((d) => (d.reviewPages?.length ?? 0) > 0);
  const reviewCount = flagged.reduce((n, d) => n + (d.reviewPages?.length ?? 0), 0);
  const sideDocs = withFile.filter((d) => d.side === side);
  const nums = sideDocs.map((d) => d.number).filter((n): n is number => n != null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rangeSide, setRangeSide] = useState<Side>(side);
  const [from, setFrom] = useState(nums.length ? String(Math.min(...nums)) : "");
  const [to, setTo] = useState(nums.length ? String(Math.max(...nums)) : "");
  useEffect(() => { setRangeSide(side); }, [side]);

  const base = `/admin/exhibit-reviewer/${setId}/print-book`;
  const go = (qs: string) => { const full = includeOmitted ? qs : `${qs}${qs.includes("?") ? "&" : "?"}omitted=0`; const a = document.createElement("a"); a.href = `${base}${full}`; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); };
  const item = "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10";

  // Prepare copies one exhibit at a time (keeps each request small), optionally
  // rebuilding everything. Refreshes the page data when done.
  const prepare = async (all: boolean) => {
    const targets = all ? withFile : pending;
    if (targets.length === 0 || busy) return;
    setBusy(true); setErr(null); setProg({ done: 0, total: targets.length });
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      try { const r = await buildPrintCopy(targets[i].id); if (!r?.ok) failed++; } catch { failed++; }
      setProg({ done: i + 1, total: targets.length });
    }
    router.refresh();
    setBusy(false); setProg(null);
    if (failed) setErr(`${failed} exhibit${failed === 1 ? "" : "s"} couldn't be prepared (too large or unreadable).`);
  };

  return (
    <>
    <PopMenu
      width={300}
      title={reviewCount > 0 ? `Print — ${reviewCount} page${reviewCount === 1 ? "" : "s"} need review` : "Print-optimized (cheaper printing)"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${reviewCount > 0 ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)]"}`}
      label={<><Printer size={13} /> Print{reviewCount > 0 ? <span className="ml-0.5 inline-flex items-center gap-0.5"><Flag size={11} /> {reviewCount}</span> : null}</>}
    >
      {(close) => (
        <div className="p-2">
          <div className="px-2 pb-2">
            <div className="text-xs font-semibold text-[var(--c-ink)]">Cheaper printing (grayscale)</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
              Re-saves black-and-white pages as true grayscale so the printer bills them as mono — the exhibit sticker is disregarded, and genuine color pages stay color.
            </p>
          </div>

          {reviewCount > 0 && (
            <button onClick={() => { close(); setReviewOpen(true); }} className="mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 px-2.5 py-2 text-left text-[11px] text-amber-800 hover:bg-amber-500/20 dark:text-amber-200">
              <Flag size={13} className="shrink-0" />
              <span><strong>{reviewCount} page{reviewCount === 1 ? "" : "s"}</strong> across {flagged.length} exhibit{flagged.length === 1 ? "" : "s"} need your call — color or grayscale.</span>
            </button>
          )}

          <div className="mx-2 rounded-md bg-[var(--c-surface2)] px-2.5 py-2 text-[11px] text-[var(--c-ink-muted)]">
            {busy && prog ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--c-accent)]"><Loader2 size={12} className="animate-spin" /> Preparing {prog.done} / {prog.total}…</span>
            ) : (
              <>
                <span className="font-semibold text-[var(--c-ink)]">{prepared.length}</span> of {withFile.length} prepared
                {prepared.length > 0 && <> · <span className="font-semibold text-[var(--c-ink)]">{colorPagesTotal}</span> color page{colorPagesTotal === 1 ? "" : "s"}</>}
              </>
            )}
          </div>
          {err && <p className="mx-2 mt-1.5 text-[11px] text-red-600">{err}</p>}

          <div className="mt-2 flex gap-1.5 px-2">
            <button onClick={() => prepare(false)} disabled={busy || pending.length === 0} className="btn btn-accent flex-1 text-xs py-1.5 disabled:opacity-40">
              {pending.length === 0 && !busy ? "All prepared" : `Prepare ${pending.length || ""}`.trim()}
            </button>
            <button onClick={() => prepare(true)} disabled={busy || withFile.length === 0} title="Rebuild every exhibit's print copy" className="rounded-md border border-[var(--c-border)] px-2 py-1.5 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] disabled:opacity-40">
              <RefreshCw size={12} />
            </button>
          </div>

          <div className="mt-2 border-t border-[var(--c-border)] pt-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Download print book</div>
            <button onClick={() => { close(); go(""); }} disabled={withFile.length === 0} className={item + " disabled:opacity-40"}>
              <span className="font-semibold text-[var(--c-ink)]">All exhibits</span> <span className="text-[var(--c-ink-muted)]">({withFile.length})</span>
            </button>
            <button onClick={() => { close(); go(`?side=${side}`); }} disabled={sideDocs.length === 0} className={item + " disabled:opacity-40"}>
              <span className="font-semibold text-[var(--c-ink)]">This tab — {SIDE_LABEL[side]}</span> <span className="text-[var(--c-ink-muted)]">({sideDocs.length})</span>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-2">
              <select value={rangeSide} onChange={(e) => setRangeSide(e.target.value as Side)} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-1 text-xs">
                <option value="plaintiff">P</option><option value="defendant">D</option><option value="joint">J</option>
              </select>
              <input value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d]/g, ""))} placeholder="from" inputMode="numeric" className="w-14 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-xs" />
              <span className="text-[var(--c-ink-muted)]">to</span>
              <input value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d]/g, ""))} placeholder="to" inputMode="numeric" className="w-14 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-xs" />
              <button onClick={() => { close(); const p = new URLSearchParams({ side: rangeSide }); if (from) p.set("from", from); if (to) p.set("to", to); go(`?${p.toString()}`); }} className="btn btn-accent ml-auto text-xs py-1 px-2.5">
                <Download size={12} /> Get
              </button>
            </div>
            <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-[var(--c-ink-muted)]">Exhibits you haven&apos;t prepared yet fall back to the original file.</p>
          </div>
        </div>
      )}
    </PopMenu>
    {reviewOpen && <ColorReviewDialog setId={setId} docs={flagged} onClose={() => setReviewOpen(false)} />}
    </>
  );
}

/**
 * Resolve the pages the color detector was unsure about. Each flagged page is
 * kept in color by default (never wrongly grayscaled); here the user confirms
 * color or switches it to grayscale with one click. "View" opens the page so
 * they can see it before deciding. Decisions rebuild that exhibit's print copy.
 */
function ColorReviewDialog({ setId, docs, onClose }: { setId: number; docs: ReviewerDoc[]; onClose: () => void }) {
  const router = useRouter();
  const proxyBase = `/admin/exhibit-reviewer/${setId}/doc`;
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows = docs.flatMap((d) => (d.reviewPages ?? []).map((p) => ({ doc: d, page: p })));

  const decide = async (docId: number, page: number, choice: "gray" | "color") => {
    setPendingKey(`${docId}:${page}`); setErr(null);
    try {
      const r = await decideColorPage(docId, page, choice);
      if (!r?.ok) setErr(r?.error ?? "Couldn't save that choice.");
    } catch { setErr("Couldn't save that choice."); }
    router.refresh();
    setPendingKey(null);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-3">
          <Flag size={16} className="text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[var(--c-ink)]">Pages to review</div>
            <div className="text-[11px] text-[var(--c-ink-muted)]">Kept in color for now. Confirm color or switch to grayscale for cheaper printing.</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={16} /></button>
        </div>
        {err && <p className="mx-4 mt-2 text-[11px] text-red-600">{err}</p>}
        <div className="max-h-[65vh] overflow-y-auto p-3">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--c-ink-muted)]"><Check size={20} className="mx-auto mb-2 text-green-600" /> All pages reviewed.</div>
          ) : (
            <ul className="space-y-1.5">
              {rows.map(({ doc, page }) => {
                const key = `${doc.id}:${page}`;
                const working = pendingKey === key;
                return (
                  <li key={key} className="flex items-center gap-2 rounded-md border border-[var(--c-border)] px-3 py-2">
                    <span className="inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 py-1 text-xs font-bold text-[var(--c-accent)]">{doc.label || (doc.number ?? "—")}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--c-ink)]">{doc.title || "Exhibit"} <span className="text-[var(--c-ink-muted)]">· page {page}</span></span>
                    <a href={`${proxyBase}/${doc.id}?v=${doc.fileTag}#page=${page}`} target="_blank" rel="noopener noreferrer" title="View this page" className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ExternalLink size={13} /></a>
                    {working ? (
                      <span className="px-2"><Loader2 size={14} className="animate-spin text-[var(--c-accent)]" /></span>
                    ) : (
                      <>
                        <button onClick={() => decide(doc.id, page, "gray")} className="rounded-md border border-[var(--c-border)] px-2 py-1 text-xs font-medium text-[var(--c-ink)] hover:border-[var(--c-accent)]">Grayscale</button>
                        <button onClick={() => decide(doc.id, page, "color")} className="rounded-md border border-[var(--c-accent)] px-2 py-1 text-xs font-medium text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10">Color</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end border-t border-[var(--c-border)] px-4 py-3">
          <button onClick={onClose} className="btn btn-accent text-sm py-1.5 px-4">Done</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The right-hand summary in the frozen bar. Reads at a glance how many exhibits
 * are admitted (and excluded), and opens a grouped, clickable list so you can
 * jump straight to any of them — across both parties.
 */
function StatusSummary({ docs, onOpen }: { docs: ReviewerDoc[]; onOpen: (d: ReviewerDoc) => void }) {
  const groups = STATUS_ORDER.filter((s) => s !== "none").map((id) => ({ id, meta: STATUS_META[id], items: docs.filter((d) => d.trialStatus === id) }));
  const admitted = groups.find((g) => g.id === "admitted")?.items.length ?? 0;
  const excluded = groups.find((g) => g.id === "excluded")?.items.length ?? 0;
  const anyRuled = groups.some((g) => g.items.length);
  return (
    <PopMenu
      width={300}
      title="Exhibits by trial status"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--c-accent)]"
      label={
        <>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META.admitted.color }} />
          <span className="font-semibold text-[var(--c-ink)]">{admitted}</span>
          <span className="text-[var(--c-ink-muted)]">admitted</span>
          {excluded > 0 && <><span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META.excluded.color }} /><span className="font-semibold text-[var(--c-ink)]">{excluded}</span></>}
        </>
      }
    >
      {(close) => (
        <div className="py-1">
          {!anyRuled && <div className="px-3 py-3 text-xs text-[var(--c-ink-muted)]">No trial rulings recorded yet. Set an exhibit&apos;s status with the solid dot on its row.</div>}
          {groups.map((g) => g.items.length ? (
            <div key={g.id} className="py-0.5">
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.meta.color }} /> {g.meta.label} · {g.items.length}
              </div>
              {g.items.map((d) => (
                <button key={d.id} onMouseDown={(e) => { e.preventDefault(); close(); onOpen(d); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10">
                  <span className="min-w-[3rem] shrink-0 font-semibold text-[var(--c-accent)]">{d.label || (d.number != null ? `#${d.number}` : "—")}</span>
                  <span className="flex-1 truncate text-[var(--c-ink)]">{d.title || "Untitled exhibit"}</span>
                  <span className="shrink-0 text-[10px] uppercase text-[var(--c-ink-muted)]">{d.side[0]}</span>
                </button>
              ))}
            </div>
          ) : null)}
        </div>
      )}
    </PopMenu>
  );
}

const SIDES: Side[] = ["plaintiff", "defendant", "joint"];
const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtSize = (b?: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
/** "RES_000260–RES_000275", or just the start for a single-page exhibit. */
const batesRange = (start: string, end: string) => (start && end && end !== start ? `${start}–${end}` : start || end);
const defaultLabel = (side: Side, n: number | null) => (n == null ? "" : getScheme("dash").format(side, n));

/** A file dropped in, parsed and awaiting the user's confirmation before upload.
 *  `parsed` is the number read from the filename (immutable); `number`/`label`
 *  are the working values shown and saved. */
type Staged = { key: string; file: File; side: Side; parsed: number | null; number: number | null; label: string; title: string; bates: string };

/** How the staged batch gets numbered before it's saved. */
export type NumMode = "keep" | "sequential" | "manual";

/**
 * Work out each staged exhibit's number, so nobody types 200 of them.
 *
 *  - "keep" (default): honour the number read from each filename, so an
 *    intentional gap in the chain (P-1, P-2, P-4 …) is preserved rather than
 *    collapsed. Files with no readable number continue the sequence from the
 *    highest so far.
 *  - "sequential": ignore the filenames and number straight 1, 2, 3 … in order.
 *  - "manual": leave the working values alone for hand editing.
 *
 * All modes count separately per side and continue from what the set already has.
 */
function computeNumbers(items: Staged[], mode: NumMode, startAt: Record<Side, number>): Staged[] {
  if (mode === "manual") return items;
  if (mode === "sequential") {
    const c: Record<Side, number> = { ...startAt };
    return items.map((s) => { const n = c[s.side]++; return { ...s, number: n, label: defaultLabel(s.side, n) }; });
  }
  // keep: use the parsed number where there is one; fill blanks after the max.
  const maxN: Record<Side, number> = { plaintiff: startAt.plaintiff - 1, defendant: startAt.defendant - 1, joint: startAt.joint - 1 };
  return items.map((s) => {
    const n = s.parsed ?? maxN[s.side] + 1;
    maxN[s.side] = Math.max(maxN[s.side], n);
    return { ...s, number: n, label: defaultLabel(s.side, n) };
  });
}

/** Per-side gaps (skipped numbers) and clashes, so the user can eyeball the
 *  chain before saving. A gap is usually fine (an omitted exhibit); a clash
 *  (same number twice, or one that already exists in the set) usually isn't. */
function numberingReport(items: Staged[], existing: Record<Side, Set<number>>) {
  const out: Record<Side, { count: number; min: number; max: number; gaps: number[]; clashes: number[] }> = {
    plaintiff: { count: 0, min: 0, max: 0, gaps: [], clashes: [] },
    defendant: { count: 0, min: 0, max: 0, gaps: [], clashes: [] },
    joint: { count: 0, min: 0, max: 0, gaps: [], clashes: [] },
  };
  for (const s of SIDES) {
    const nums = items.filter((i) => i.side === s && i.number != null).map((i) => i.number as number);
    if (!nums.length) continue;
    const set = new Set(nums);
    const min = Math.min(...nums), max = Math.max(...nums);
    const gaps: number[] = [];
    for (let n = min; n <= max; n++) if (!set.has(n)) gaps.push(n);
    const seen = new Set<number>(), clashes = new Set<number>();
    for (const n of nums) { if (seen.has(n)) clashes.add(n); seen.add(n); if (existing[s]?.has(n)) clashes.add(n); }
    out[s] = { count: nums.length, min, max, gaps, clashes: [...clashes].sort((a, b) => a - b) };
  }
  return out;
}

/**
 * A single grid cell: the exhibit's first page rendered as a thumbnail. The
 * iframe is only mounted while the card is near the viewport (and unmounted when
 * far away) so a set of hundreds of exhibits doesn't try to render every PDF at
 * once. Clicking anywhere on the card opens that exhibit in the reader.
 */
function GridCard({ d, proxyBase, onOpen }: { d: ReviewerDoc; proxyBase: string; onOpen: (id: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((entries) => { for (const e of entries) setNear(e.isIntersecting); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <button ref={ref} onClick={() => onOpen(d.id)} title={`${d.label || d.number || ""} ${d.title || ""}`.trim() || "Exhibit"} className="group flex flex-col overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-left transition-shadow hover:border-[var(--c-accent)] hover:shadow-md">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-white">
        {d.hasFile && near ? (
          <iframe
            src={`${proxyBase}/${d.id}?v=${d.fileTag}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&view=FitH&page=1`}
            title={d.title || d.label || "Exhibit"}
            className="pointer-events-none absolute inset-0 h-full w-full border-0"
            loading="lazy"
            tabIndex={-1}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--c-ink-muted)]"><FileText size={28} className="opacity-40" /></div>
        )}
        {/* Transparent layer so the click always lands on the card, not the PDF. */}
        <span className="absolute inset-0" aria-hidden />
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--c-border)] px-2.5 py-2">
        <span className="inline-flex min-w-[2.75rem] shrink-0 items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-xs font-bold text-[var(--c-accent)]">{d.label || (d.number ?? "—")}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--c-ink)]">{d.title || "Exhibit"}</span>
      </div>
    </button>
  );
}

/** The thumbnail wall for the current side — rows of four on wide screens. */
function ExhibitGrid({ docs, side, proxyBase, onOpen }: { docs: ReviewerDoc[]; side: Side; proxyBase: string; onOpen: (id: number) => void }) {
  if (docs.length === 0) {
    return <p className="rounded-lg border border-dashed border-[var(--c-border)] p-6 text-center text-sm text-[var(--c-ink-muted)]">No {SIDE_LABEL[side].toLowerCase()} to show.</p>;
  }
  return (
    <div>
      <p className="mb-3 text-xs text-[var(--c-ink-muted)]">Showing {docs.length} {SIDE_LABEL[side].toLowerCase()} in order — click any exhibit to open it. Handy for spotting duplicates or gaps.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {docs.map((d) => <GridCard key={d.id} d={d} proxyBase={proxyBase} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

export function ExhibitReviewer({ setId, docs, witnesses, claims, elements, blobReady, access, publicToken, recipients, ocEnabled, ocToken, hasList, listName, listTag }: {
  setId: number; docs: ReviewerDoc[]; witnesses: WitnessLite[]; claims: ClaimLite[]; elements: ElementLite[]; blobReady: boolean;
  access: string; publicToken: string | null; recipients: RecipientLite[]; ocEnabled: boolean; ocToken: string | null;
  hasList: boolean; listName: string | null; listTag: string;
}) {
  const router = useRouter();
  const isPublic = access === "public";
  // The exhibit whose full details dialog (pencil) is open.
  const [editId, setEditId] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // A styled confirm dialog (replaces the browser's confirm box).
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  // Brief confirmation toast (copied a link, etc.).
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); }, []);
  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => flash(label)).catch(() => flash("Couldn't copy — copy it manually."));
  }, [flash]);
  // A per-exhibit public link (works only while sharing is on).
  const exhibitLink = useCallback((docId: number) => (publicToken && typeof window !== "undefined" ? `${window.location.origin}/exhibits/${publicToken}/e/${docId}` : ""), [publicToken]);

  // Quick name/text lookups for showing sponsors and elements in the viewer.
  const witnessName = useMemo(() => new Map(witnesses.map((w) => [w.id, w.name])), [witnesses]);
  const elementText = useMemo(() => new Map(elements.map((e) => [e.id, e.text])), [elements]);
  const foundationLabel = useMemo(() => new Map(FOUNDATION_OPTIONS.map((f) => [f.id, f.label])), []);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  }, [router]);

  /* -------- replace an exhibit's PDF (keeps all its metadata) -------- */
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<number | null>(null);
  const [replacing, setReplacing] = useState(false);
  const askReplace = useCallback((docId: number) => {
    if (!blobReady) { setError("Connect a Blob store to replace files."); return; }
    setConfirmState({
      title: "Replace exhibit file",
      message: "Replace this exhibit's file? The number, label, title, notes and everything else stay — only the PDF changes.",
      confirmLabel: "Choose file…",
      onConfirm: () => { replaceIdRef.current = docId; replaceInputRef.current?.click(); },
    });
  }, [blobReady]);
  async function onReplaceFile(file: File) {
    const docId = replaceIdRef.current;
    replaceIdRef.current = null;
    if (!docId) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setError("Pick a PDF to replace the exhibit."); return; }
    setReplacing(true); setError(null); flash("Replacing the exhibit…");
    try {
      const blob = await upload(`exhibit-reviewer/${setId}/${file.name}`, file, {
        access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId), multipart: true,
      });
      const r = await replaceExhibitFile(docId, { url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size });
      if (r.ok) flash("Exhibit replaced"); else setError(r.error ?? "Couldn't replace the file.");
    } catch (err) {
      setError(`Couldn't replace: ${(err as Error).message}`);
    }
    setReplacing(false);
    router.refresh();
  }

  /* -------- high-res version: upload one, or view it -------- */
  const hiResInputRef = useRef<HTMLInputElement>(null);
  const hiResIdRef = useRef<number | null>(null);
  // When true, the viewer shows the current exhibit's high-res file.
  const [hiResView, setHiResView] = useState(false);
  // Which exhibit's hi-res is uploading, and its percent (shown in the row's box).
  const [hiResBusy, setHiResBusy] = useState<{ id: number; pct: number } | null>(null);
  const askHiRes = useCallback((docId: number) => {
    if (!blobReady) { setError("Connect a Blob store to upload a high-res version."); return; }
    hiResIdRef.current = docId;
    hiResInputRef.current?.click();
  }, [blobReady]);
  async function onHiResFile(file: File) {
    const docId = hiResIdRef.current;
    hiResIdRef.current = null;
    if (!docId) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setError("The high-res version must be a PDF."); return; }
    setError(null);
    setHiResBusy({ id: docId, pct: 0 });
    try {
      const blob = await upload(`exhibit-reviewer/${setId}/hires-${file.name}`, file, {
        access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId), multipart: true,
        onUploadProgress: (e) => setHiResBusy({ id: docId, pct: Math.round(e.percentage) }),
      });
      const r = await setExhibitHiRes(docId, { url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size });
      if (r.ok) flash("High-res version saved"); else setError(r.error ?? "Couldn't save the high-res version.");
    } catch (err) {
      setError(`Couldn't upload: ${(err as Error).message}`);
    }
    setHiResBusy(null);
    router.refresh();
  }

  /* -------- the set's "exhibit list" document: view it, or upload one -------- */
  const listInputRef = useRef<HTMLInputElement>(null);
  // When true, the viewer shows the exhibit-list document instead of an exhibit.
  const [listView, setListView] = useState(false);
  const [listBusy, setListBusy] = useState<number | null>(null); // upload %, or null
  const viewList = useCallback(() => setListView(true), []);
  async function onListFile(file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setError("The exhibit list must be a PDF."); return; }
    setError(null); setListBusy(0);
    try {
      const blob = await upload(`exhibit-reviewer/${setId}/list-${file.name}`, file, {
        access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId), multipart: true,
        onUploadProgress: (e) => setListBusy(Math.round(e.percentage)),
      });
      const r = await setExhibitListDoc(setId, { url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size, name: file.name });
      if (r.ok) { flash("Exhibit list uploaded"); setListView(true); } else setError(r.error ?? "Couldn't save the exhibit list.");
    } catch (err) {
      setError(`Couldn't upload: ${(err as Error).message}`);
    }
    setListBusy(null);
    router.refresh();
  }

  /* --------- draggable split between the list and the viewer --------- */
  const splitRef = useRef<HTMLDivElement>(null);
  const [listW, setListW] = useState(320);
  const listWRef = useRef(listW);
  useEffect(() => { listWRef.current = listW; }, [listW]);
  const draggingRef = useRef(false);
  useEffect(() => {
    const saved = Number(localStorage.getItem("tms_exhibit_listw"));
    if (Number.isFinite(saved) && saved >= 220 && saved <= 720) setListW(saved);
  }, []);
  useEffect(() => {
    function move(e: MouseEvent | TouchEvent) {
      if (!draggingRef.current || !splitRef.current) return;
      const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const rect = splitRef.current.getBoundingClientRect();
      const w = Math.max(220, Math.min(rect.width - 360, clientX - rect.left));
      setListW(w);
    }
    function up() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { localStorage.setItem("tms_exhibit_listw", String(Math.round(listWRef.current))); } catch { /* ignore */ }
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, []);
  function startDrag() {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  // Which sides actually have exhibits — plaintiff & defendant always shown,
  // joint only when used.
  const sidesInUse = useMemo(() => {
    const present = new Set(docs.map((d) => d.side));
    return SIDES.filter((s) => s === "plaintiff" || s === "defendant" || present.has(s));
  }, [docs]);
  const [side, setSide] = useState<Side>("plaintiff");

  // "Include omitted" toggle: when off, exhibits taken off the list drop out of
  // the reviewer (and, via the download param, out of the ZIP/print downloads).
  const [showOmitted, setShowOmitted] = useState(true);
  const omittedCount = useMemo(() => docs.filter((d) => d.side === side && d.omitted).length, [docs, side]);

  const ordered = useMemo(() => {
    const inSide = docs.filter((d) => d.side === side && (showOmitted || !d.omitted));
    return inSide.slice().sort((a, b) => {
      const an = a.number ?? Infinity, bn = b.number ?? Infinity;
      if (an !== bn) return an - bn;
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.id - b.id;
    });
  }, [docs, side, showOmitted]);

  const [currentId, setCurrentId] = useState<number | null>(null);
  // Keep a valid selection as the side/list changes.
  useEffect(() => {
    if (ordered.length === 0) { setCurrentId(null); return; }
    if (!ordered.some((d) => d.id === currentId)) setCurrentId(ordered[0].id);
  }, [ordered, currentId]);

  const current = ordered.find((d) => d.id === currentId) ?? null;
  const currentIndex = current ? ordered.findIndex((d) => d.id === current.id) : -1;

  const [viewerPage, setViewerPage] = useState(1);
  // Opening an exhibit normally shows the standard file; openHiRes shows the
  // high-res version. Both are set in the same handler, so the last write wins.
  const openDoc = useCallback((id: number, page = 1) => { setCurrentId(id); setViewerPage(page); setHiResView(false); setListView(false); }, []);
  const openHiRes = useCallback((id: number) => { openDoc(id, 1); setHiResView(true); }, [openDoc]);
  // Grid view: a wall of first-page thumbnails for the current side, for
  // eyeballing duplicates / gaps. Clicking one drops back to the reader on it.
  const [gridView, setGridView] = useState(false);

  function step(delta: number) {
    if (currentIndex < 0) return;
    const next = ordered[currentIndex + delta];
    if (next) openDoc(next.id, 1);
  }

  /* ------------------------- go to number ------------------------- */
  const [gotoNum, setGotoNum] = useState("");
  function goToNumber() {
    const n = Number(gotoNum);
    if (!Number.isFinite(n)) return;
    const hit = ordered.find((d) => d.number === n);
    if (hit) { openDoc(hit.id, 1); setGotoNum(""); }
    else setError(`No exhibit numbered ${n} in ${SIDE_LABEL[side].toLowerCase()}.`);
  }

  /* ---------------------- cross-set search ------------------------ */
  const [setQuery, setSetQuery] = useState("");
  const [setHits, setSetHits] = useState<SetSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = setQuery.trim();
    if (q.length < 2) { setSetHits(null); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const hits = await searchExhibitSet(setId, q);
      setSetHits(hits);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [setQuery, setId]);

  function openHit(h: SetSearchHit) {
    setSide((h.side as Side) ?? "plaintiff");
    openDoc(h.docId, h.pages[0] ?? 1);
    setSetQuery("");
    setSetHits(null);
  }

  // Open any exhibit regardless of which side tab is showing (used by the
  // admitted/status summary, which spans both parties).
  const openAnySide = useCallback((d: ReviewerDoc) => {
    setSide((d.side as Side) ?? "plaintiff");
    openDoc(d.id, 1);
  }, [openDoc]);

  /* --------------------- in-document search ----------------------- */
  const [docPages, setDocPages] = useState<string[]>([]);
  const [docQuery, setDocQuery] = useState("");
  const [docMatches, setDocMatches] = useState<number[]>([]);
  const [matchPos, setMatchPos] = useState(0);
  // Load the current document's text when it changes.
  useEffect(() => {
    let alive = true;
    setDocPages([]); setDocQuery(""); setDocMatches([]); setMatchPos(0);
    if (current?.id) getDocPages(current.id).then((p) => { if (alive) setDocPages(p); });
    return () => { alive = false; };
  }, [current?.id]);
  useEffect(() => {
    const q = docQuery.trim().toLowerCase();
    if (q.length < 2 || docPages.length === 0) { setDocMatches([]); setMatchPos(0); return; }
    const pages: number[] = [];
    for (let i = 0; i < docPages.length; i++) if ((docPages[i] ?? "").toLowerCase().includes(q)) pages.push(i + 1);
    setDocMatches(pages);
    setMatchPos(0);
    if (pages.length) setViewerPage(pages[0]);
  }, [docQuery, docPages]);
  function stepMatch(delta: number) {
    if (!docMatches.length) return;
    const pos = (matchPos + delta + docMatches.length) % docMatches.length;
    setMatchPos(pos);
    setViewerPage(docMatches[pos]);
  }

  /* ------------------------- add / upload ------------------------- */
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number; pct?: number } | null>(null);
  // The "organic read": right after upload we analyze each new exhibit's color
  // so the print-optimized copy is ready and any unsure pages get flagged.
  const [autoRead, setAutoRead] = useState<{ done: number; total: number } | null>(null);
  const [numMode, setNumMode] = useState<NumMode>("keep");

  // Any upload in flight (batch add, replace, or hi-res). While true we warn the
  // browser AND show an on-screen banner, because leaving the page drops it.
  const uploadingActive = !!uploading || replacing || !!hiResBusy || listBusy != null;
  useEffect(() => {
    if (!uploadingActive) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingActive]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Numbers already used per side, and the next free number, so a second batch
  // continues rather than restarting at 1 (and so clashes can be flagged).
  const existingBySide = useMemo<Record<Side, Set<number>>>(() => {
    const m: Record<Side, Set<number>> = { plaintiff: new Set(), defendant: new Set(), joint: new Set() };
    for (const d of docs) {
      const s: Side = d.side === "defendant" ? "defendant" : d.side === "joint" ? "joint" : "plaintiff";
      if (typeof d.number === "number") m[s].add(d.number);
    }
    return m;
  }, [docs]);
  const startAt = useMemo<Record<Side, number>>(() => ({
    plaintiff: (existingBySide.plaintiff.size ? Math.max(...existingBySide.plaintiff) : 0) + 1,
    defendant: (existingBySide.defendant.size ? Math.max(...existingBySide.defendant) : 0) + 1,
    joint: (existingBySide.joint.size ? Math.max(...existingBySide.joint) : 0) + 1,
  }), [existingBySide]);

  // What the staged rows show and what actually gets uploaded.
  const numberedStaged = useMemo(() => computeNumbers(staged, numMode, startAt), [staged, numMode, startAt]);
  const report = useMemo(() => numberingReport(numberedStaged, existingBySide), [numberedStaged, existingBySide]);

  function changeMode(next: NumMode) {
    // Switching to manual bakes the current numbers in, so hand editing starts
    // from the filled-in sequence rather than blanks.
    if (next === "manual") setStaged((prev) => computeNumbers(prev, numMode === "manual" ? "keep" : numMode, startAt));
    setNumMode(next);
  }

  const stageFiles = useCallback((picked: PickedFile[]) => {
    const pdfs = picked.filter((p) => /\.pdf$/i.test(p.file.name) || p.file.type === "application/pdf");
    if (!pdfs.length) { setError("Drop PDF files — the reviewer reads exhibits as PDFs."); return; }
    const parsed = pdfs.map((p) => ({ picked: p, ...parseExhibitName(p.file.name) }));
    const sorted = suggestOrder(parsed);
    const items: Staged[] = sorted.map((p, i) => {
      const s = (p.side as Side | null) ?? side;
      return {
        key: `${p.picked.file.name}-${i}-${p.picked.file.size}`,
        file: p.picked.file,
        side: s,
        parsed: p.number,
        number: p.number,
        label: defaultLabel(s, p.number),
        title: p.title,
        bates: p.bates,
      };
    });
    setStaged((prev) => [...prev, ...items]);
  }, [side]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const count = countDropItems(e.dataTransfer);
    try {
      const picked = await filesFromDrop(e.dataTransfer);
      if (picked.length === 0 && count > 0) setError("Couldn't read the dropped items. Try the “Choose files” button instead.");
      else stageFiles(picked);
    } catch { setError("Couldn't read the drop. Try the “Choose files” button."); }
  }, [stageFiles]);

  async function doUpload() {
    if (!staged.length || !blobReady) return;
    setError(null);
    const finalItems = computeNumbers(staged, numMode, startAt);
    setUploading({ done: 0, total: finalItems.length });
    let done = 0;
    const newIds: number[] = [];
    for (const item of finalItems) {
      try {
        const blob = await upload(`exhibit-reviewer/${setId}/${item.file.name}`, item.file, {
          access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId),
          // multipart chunks the file so a large PDF uploads reliably instead of
          // being pushed in one fragile request; progress shows it's moving.
          multipart: true,
          onUploadProgress: (e) => setUploading({ done, total: finalItems.length, pct: Math.round(e.percentage) }),
        });
        const saved = await addExhibitDoc(setId, {
          side: item.side, number: item.number, label: item.label.trim(), title: item.title.trim(), bates: item.bates.trim(),
          file: { url: blob.url, pathname: blob.pathname, contentType: item.file.type || blob.contentType, size: item.file.size },
        });
        if (saved?.ok && saved.id) newIds.push(saved.id);
      } catch (err) {
        setError(`Couldn't upload ${item.file.name}: ${(err as Error).message}`);
      }
      done++;
      setUploading({ done, total: staged.length });
    }
    setStaged([]);
    setUploading(null);
    router.refresh();

    // Organic color read: analyze each new exhibit now. Effectively-B&W pages
    // become grayscale for cheaper printing; anything the detector is unsure of
    // is flagged for review (the Print menu turns amber). Best-effort per file.
    if (newIds.length) {
      setAutoRead({ done: 0, total: newIds.length });
      for (let i = 0; i < newIds.length; i++) {
        try { await buildPrintCopy(newIds[i]); } catch { /* leave unprepared; user can Prepare later */ }
        setAutoRead({ done: i + 1, total: newIds.length });
      }
      setAutoRead(null);
      router.refresh();
    }
  }

  const patchStaged = (key: string, patch: Partial<Staged>) => setStaged((prev) => prev.map((s) => {
    if (s.key !== key) return s;
    const next = { ...s, ...patch };
    // Keep the label in step with side/number unless the user typed one.
    if ((patch.side !== undefined || patch.number !== undefined) && (s.label === defaultLabel(s.side, s.number) || !s.label)) {
      next.label = defaultLabel(next.side, next.number);
    }
    return next;
  }));

  const proxyBase = `/admin/exhibit-reviewer/${setId}/doc`;
  // The ?v= tag busts the browser cache when a file is replaced, while staying
  // stable across page jumps (same v) so stepping pages still hits the cache.
  const showingHiRes = !!current && hiResView && current.hasHiRes;
  const viewerSrc = current
    ? `${proxyBase}/${current.id}?${showingHiRes ? `hires=1&v=${current.hiResTag}` : `v=${current.fileTag}`}#page=${viewerPage}&zoom=page-width&view=FitH`
    : "";

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-14 right-5 z-[9999] rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg" style={{ background: "var(--c-success, #16a34a)" }}>✓ {toast}</div>}
      {/* Stay-on-page warning while anything is uploading — leaving drops it. */}
      {uploadingActive && (
        <div className="fixed left-1/2 top-14 z-[9999] flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-lg dark:bg-amber-950 dark:text-amber-100">
          <Loader2 size={16} className="animate-spin text-amber-600" />
          <span><strong>Uploading{uploading ? ` ${uploading.done + 1}/${uploading.total}` : ""}…</strong> Please don&apos;t close this tab or leave the page until it finishes, or the upload will be lost.</span>
        </div>
      )}
      {!uploadingActive && autoRead && (
        <div className="fixed left-1/2 top-14 z-[9999] flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5 text-sm text-[var(--c-ink)] shadow-lg">
          <Loader2 size={16} className="animate-spin text-[var(--c-accent)]" />
          <span><strong>Reading for color {autoRead.done}/{autoRead.total}…</strong> Preparing cheaper-to-print copies. You can keep working.</span>
        </div>
      )}
      {/* Hidden picker used by the per-exhibit "replace file" action. */}
      <input ref={replaceInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplaceFile(f); if (replaceInputRef.current) replaceInputRef.current.value = ""; }} />
      {/* Hidden picker for the per-exhibit high-res upload. */}
      <input ref={hiResInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onHiResFile(f); if (hiResInputRef.current) hiResInputRef.current.value = ""; }} />
      {/* Hidden picker for the set's exhibit-list document. */}
      <input ref={listInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onListFile(f); if (listInputRef.current) listInputRef.current.value = ""; }} />
      {error && (
        <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </p>
      )}

      {/* Frozen controls: the side tabs and the go-to / arrows / search bar stay
          put at the top while the exhibit list and the viewer scroll on their
          own, so you never lose them behind a long list. */}
      <div className="sticky top-9 z-20 -mx-6 space-y-3 border-b border-[var(--c-border)] bg-[var(--c-bg)] px-6 pb-3 pt-2">
      {/* Side tabs, with the list/grid view toggle pinned to the right */}
      <div className="flex flex-wrap items-center gap-1 pb-1">
        {sidesInUse.map((s) => {
          const n = docs.filter((d) => d.side === s).length;
          return (
            <button key={s} onClick={() => setSide(s)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${side === s ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]"}`}>
              {SIDE_LABEL[s]} <span className={`rounded-full px-1.5 ${side === s ? "bg-white/20" : "bg-[var(--c-surface2)]"}`}>{n}</span>
            </button>
          );
        })}
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
          <button onClick={() => setGridView(false)} title="Reader view" className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${!gridView ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"}`}><ListIcon size={13} /> <span className="hidden sm:inline">Reader</span></button>
          <button onClick={() => setGridView(true)} title="Grid view — thumbnails to scan for duplicates" className={`inline-flex items-center gap-1.5 border-l border-[var(--c-border)] px-2.5 py-1.5 text-xs font-medium ${gridView ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"}`}><LayoutGrid size={13} /> <span className="hidden sm:inline">Grid</span></button>
        </div>
      </div>

      {/* Toolbar: go-to-number, prev/next, cross-set search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1">
          <Hash size={13} className="text-[var(--c-ink-muted)]" />
          <input value={gotoNum} onChange={(e) => setGotoNum(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") goToNumber(); }} placeholder="Go to #" inputMode="numeric" className="w-16 bg-transparent text-sm outline-none" />
          <button onClick={goToNumber} className="rounded p-0.5 text-[var(--c-accent)] hover:bg-[var(--c-surface2)]" title="Go"><CornerDownLeft size={14} /></button>
        </div>

        <div className="inline-flex items-center gap-1">
          <button onClick={() => step(-1)} disabled={currentIndex <= 0} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] disabled:opacity-40" title="Previous exhibit"><ChevronLeft size={16} /></button>
          <span className="min-w-[7.5rem] text-center text-xs text-[var(--c-ink-muted)]">
            {current ? `${current.label || current.title || "Exhibit"} · ${currentIndex + 1} of ${ordered.length}` : `${ordered.length} exhibits`}
          </span>
          <button onClick={() => step(1)} disabled={currentIndex < 0 || currentIndex >= ordered.length - 1} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] disabled:opacity-40" title="Next exhibit"><ChevronRight size={16} /></button>
        </div>

        {/* Exhibit list document — kept apart from the exhibits themselves. View
            opens it in the side screen; the icon uploads/replaces it. */}
        <span className={`inline-flex shrink-0 items-stretch overflow-hidden rounded-md border ${listBusy != null ? "border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}>
          <button
            onClick={viewList}
            disabled={!hasList || listBusy != null}
            title={listBusy != null ? "Uploading — don't leave the page" : hasList ? "View the exhibit list" : "No exhibit list yet — upload one with the icon"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${listBusy != null ? "bg-[var(--c-accent)] text-white" : hasList ? (listView ? "bg-[var(--c-accent)]/15 text-[var(--c-accent)]" : "text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10") : "text-[var(--c-ink-muted)] opacity-70"}`}
          >
            <ListChecks size={13} /> {listBusy != null ? `${listBusy}%` : "Exhibit List"}
          </button>
          <button onClick={() => listInputRef.current?.click()} disabled={listBusy != null} title={hasList ? "Replace the exhibit list" : "Upload an exhibit list"} className="border-l border-[var(--c-border)] px-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-accent)] disabled:opacity-50">
            {listBusy != null ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          </button>
        </span>

        <div className="ml-auto flex min-w-[260px] flex-1 items-center gap-2 lg:max-w-2xl">
          {/* Download exhibits as a ZIP — all, this side, or a number range. */}
          <DownloadZip setId={setId} docs={docs} side={side} includeOmitted={showOmitted} />
          {/* Print-optimized (grayscale) copy for cheaper printing. Low-key, by
              the other download/share controls. */}
          <PrintPrep setId={setId} docs={docs} side={side} includeOmitted={showOmitted} />
          {/* Share: opens the sharing dialog (off / restricted / public). */}
          <button
            onClick={() => setShareOpen(true)}
            title="Share exhibits"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${access === "off" ? "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)]" : "border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 text-[var(--c-accent)]"}`}
          >
            {access === "public" ? <Globe size={13} /> : access === "restricted" ? <Share2 size={13} /> : <Share2 size={13} />} Share
            {access !== "off" && <span className="hidden sm:inline">· {access === "public" ? "anyone" : "restricted"}</span>}
          </button>
          {/* The admitted/trial-status summary sits on the right of the frozen
              bar: a tally that opens a grouped, clickable list of exhibits. */}
          <StatusSummary docs={docs} onOpen={openAnySide} />
          <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={setQuery} onChange={(e) => setSetQuery(e.target.value)} placeholder="Search across all exhibits…" className={`${input} pl-8 pr-8`} />
          {setQuery && <button onClick={() => { setSetQuery(""); setSetHits(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={14} /></button>}
          {setHits !== null && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
              {searching && <div className="px-3 py-2 text-xs text-[var(--c-ink-muted)]"><Loader2 size={12} className="mr-1 inline animate-spin" /> Searching…</div>}
              {!searching && setHits.length === 0 && <div className="px-3 py-3 text-xs text-[var(--c-ink-muted)]">No exhibits match “{setQuery}”.</div>}
              {setHits.map((h) => (
                <button key={h.docId} onClick={() => openHit(h)} className="block w-full border-b border-[var(--c-border)] px-3 py-2 text-left last:border-0 hover:bg-[var(--c-surface2)]">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-[var(--c-accent)]">{h.label || h.title || "Exhibit"}</span>
                    <span className="rounded bg-[var(--c-surface2)] px-1.5 text-[10px] uppercase text-[var(--c-ink-muted)]">{h.side}</span>
                    {h.batesHit && <span className="rounded bg-[var(--c-accent)]/10 px-1.5 text-[10px] font-semibold text-[var(--c-accent)]">Bates</span>}
                    {h.pages.length > 0 && <span className="text-[11px] text-[var(--c-ink-muted)]">p. {h.pages.slice(0, 6).join(", ")}{h.pages.length > 6 ? "…" : ""}</span>}
                  </div>
                  {h.title && <div className="truncate text-xs text-[var(--c-ink-muted)]">{h.title}</div>}
                  {h.snippet && <div className="mt-0.5 truncate text-[11px] italic text-[var(--c-ink-muted)]">…{h.snippet}…</div>}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
      </div>

      {/* Grid view: a wall of first-page thumbnails for the current side. */}
      {gridView && (
        <ExhibitGrid docs={ordered} side={side} proxyBase={proxyBase} onOpen={(id) => { openDoc(id); setGridView(false); }} />
      )}

      {/* Main: list + viewer — each column is one viewport tall and scrolls
          inside itself, so paging through 200 exhibits on the left never drags
          the viewer (or the page) along with it. On desktop a draggable divider
          between them sets how wide the list is; on mobile they stack. Kept
          mounted (just hidden) in grid view so the divider width and selection
          survive toggling back. */}
      <div ref={splitRef} className={`flex flex-col gap-4 lg:h-[80vh] lg:flex-row lg:gap-0 ${gridView ? "hidden" : ""}`}>
        {/* Exhibit list — fixed (draggable) width on desktop, full width stacked on mobile */}
        <div style={{ width: listW }} className="flex flex-col gap-2 max-lg:!w-full lg:h-full lg:min-h-0 lg:shrink-0">
          <AddExhibits
            blobReady={blobReady} dragOver={dragOver} uploading={uploading} items={numberedStaged}
            numMode={numMode} onSetMode={changeMode} report={report}
            fileRef={fileRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPick={(list) => stageFiles(fromInput(list))}
            onPatch={patchStaged}
            onRemove={(key) => setStaged((prev) => prev.filter((s) => s.key !== key))}
            onClear={() => setStaged([])}
            onUpload={doUpload}
          />

          {/* Include-omitted toggle — appears once anything on this side is
              omitted. Off hides them here and from the ZIP/print downloads. */}
          {omittedCount > 0 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-xs text-[var(--c-ink)]">
              <input type="checkbox" checked={showOmitted} onChange={(e) => setShowOmitted(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
              <span>Include omitted exhibits <span className="text-[var(--c-ink-muted)]">({omittedCount})</span></span>
              <span className="ml-auto text-[10px] text-[var(--c-ink-muted)]">{showOmitted ? "showing" : "hidden — downloads exclude them"}</span>
            </label>
          )}

          {ordered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--c-border)] p-4 text-center text-xs text-[var(--c-ink-muted)]">
              No {SIDE_LABEL[side].toLowerCase()} {omittedCount > 0 && !showOmitted ? "on the list" : "yet. Drop exhibit PDFs above."}
            </p>
          ) : (
            <ul className="space-y-1 overflow-y-auto pr-1 max-h-[60vh] lg:max-h-none lg:flex-1 lg:min-h-0">
              {ordered.map((d, i) => (
                <ExhibitRow key={d.id} d={d} active={d.id === currentId} index={i}
                  onOpen={() => openDoc(d.id, 1)}
                  onSave={(patch) => run(() => updateExhibitDoc(d.id, patch))}
                  onToggleOmit={() => run(() => setExhibitOmitted(d.id, !d.omitted))}
                  onEdit={() => setEditId(d.id)}
                  onReplace={() => askReplace(d.id)}
                  onHiResUpload={() => askHiRes(d.id)}
                  onViewHiRes={() => openHiRes(d.id)}
                  hiResPct={hiResBusy?.id === d.id ? hiResBusy.pct : null}
                  onCopyLink={isPublic && publicToken ? () => copy(exhibitLink(d.id), "Exhibit link copied") : undefined}
                  onDelete={() => { if (confirm(`Remove ${d.label || d.title || "this exhibit"}?`)) run(() => deleteExhibitDoc(d.id)); }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Drag handle — desktop only. Grab and slide to widen either side. */}
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          title="Drag to resize"
          className="group hidden shrink-0 cursor-col-resize items-center justify-center px-1.5 lg:flex"
        >
          <div className="flex h-16 w-1.5 items-center justify-center rounded-full bg-[var(--c-border)] transition-colors group-hover:bg-[var(--c-accent)]">
            <GripVertical size={12} className="text-[var(--c-surface)] opacity-0 group-hover:opacity-100" />
          </div>
        </div>

        {/* Viewer — takes the remaining width. */}
        <div className="h-[80vh] min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] lg:h-full">
          {listView && hasList ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-2.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--c-ink)]"><ListChecks size={15} className="text-[var(--c-accent)]" /> Exhibit list</span>
                {listName && <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--c-ink-muted)]">{listName}</span>}
                <button onClick={() => setListView(false)} className="ml-auto rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">Back to exhibits</button>
                <button onClick={() => listInputRef.current?.click()} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Replace the exhibit list"><RefreshCw size={15} /></button>
                <a href={`/admin/exhibit-reviewer/${setId}/list?v=${listTag}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open in a new tab"><ExternalLink size={15} /></a>
              </div>
              <a href={`/admin/exhibit-reviewer/${setId}/list?v=${listTag}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-accent)] px-3 py-2.5 text-sm font-semibold text-white lg:hidden"><ExternalLink size={16} /> Open exhibit list full screen</a>
              <iframe key={`list:${listTag}`} src={`/admin/exhibit-reviewer/${setId}/list?v=${listTag}#zoom=page-width`} title="Exhibit list" className="min-h-0 flex-1 w-full bg-white" />
            </div>
          ) : !current ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--c-ink-muted)]">
              <FileText size={28} className="opacity-40" />
              {ordered.length ? "Select an exhibit to view it." : "Add exhibits to get started."}
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {/* Viewer header + in-document search */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{current.label ? `${current.label} — ` : ""}{current.title || "Exhibit"}</div>
                  {current.description && <div className="truncate text-[11px] text-[var(--c-ink)]" title={current.description}>{current.description}</div>}
                  <div className="truncate text-[11px] text-[var(--c-ink-muted)]">
                    {batesRange(current.bates, current.batesEnd) ? `${batesRange(current.bates, current.batesEnd)} · ` : ""}{current.pageCount ? `${current.pageCount} page${current.pageCount === 1 ? "" : "s"}` : ""}{current.sizeBytes ? ` · ${fmtSize(current.sizeBytes)}` : ""}
                  </div>
                </div>

                <div className="relative inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1">
                  <Search size={13} className="text-[var(--c-ink-muted)]" />
                  <input
                    value={docQuery}
                    onChange={(e) => setDocQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") stepMatch(e.shiftKey ? -1 : 1); }}
                    placeholder="Find in this exhibit…"
                    className="w-40 bg-transparent text-sm outline-none"
                    disabled={docPages.length === 0}
                    title={docPages.length === 0 ? "This PDF has no searchable text layer (it may be scanned images)." : "Search this exhibit"}
                  />
                  {docQuery.trim().length >= 2 && (
                    <span className="whitespace-nowrap text-[11px] text-[var(--c-ink-muted)]">
                      {docMatches.length ? `${matchPos + 1}/${docMatches.length} pp` : "0"}
                    </span>
                  )}
                  <button onClick={() => stepMatch(-1)} disabled={!docMatches.length} className="rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-30" title="Previous match"><ChevronUp size={14} /></button>
                  <button onClick={() => stepMatch(1)} disabled={!docMatches.length} className="rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-30" title="Next match"><ChevronDown size={14} /></button>
                </div>

                {current.hasHiRes && (
                  <span className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)] text-[11px]">
                    <button onClick={() => setHiResView(false)} className={`px-2 py-1 font-medium ${!showingHiRes ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"}`}>Standard</button>
                    <button onClick={() => setHiResView(true)} className={`px-2 py-1 font-medium ${showingHiRes ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"}`}>High-res</button>
                  </span>
                )}
                {isPublic && publicToken && (
                  <button onClick={() => copy(exhibitLink(current.id), "Exhibit link copied")} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Copy this exhibit's share link"><LinkIcon size={15} /></button>
                )}
                <button onClick={() => askReplace(current.id)} disabled={replacing} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-50" title="Replace this exhibit's file">{replacing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
                <button onClick={() => setEditId(current.id)} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit this exhibit"><Pencil size={15} /></button>
                <a href={`${proxyBase}/${current.id}?v=${current.fileTag}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open in a new tab"><ExternalLink size={15} /></a>
              </div>

              {/* How it comes in, and what it proves — the trial-facing detail. */}
              {(current.witnessIds.length > 0 || current.foundation.length > 0 || current.elementIds.length > 0) && (
                <div className="space-y-0.5 border-b border-[var(--c-border)] bg-[var(--c-surface2)]/50 px-3 py-1.5 text-[11px]">
                  {(current.witnessIds.length > 0 || current.foundation.length > 0) && (
                    <div className="text-[var(--c-ink-muted)]">
                      <span className="font-semibold text-[var(--c-ink)]">In through:</span>{" "}
                      {[...current.witnessIds.map((id) => witnessName.get(id)).filter(Boolean), ...current.foundation.map((f) => foundationLabel.get(f)).filter(Boolean)].join(", ") || "—"}
                    </div>
                  )}
                  {current.elementIds.length > 0 && (
                    <div className="text-[var(--c-ink-muted)]">
                      <span className="font-semibold text-[var(--c-ink)]">Proves:</span>{" "}
                      {current.elementIds.map((id) => elementText.get(id)).filter(Boolean).join("  ·  ") || "—"}
                    </div>
                  )}
                </div>
              )}

              {docPages.length === 0 && (
                <p className="border-b border-[var(--c-border)] bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  This PDF has no text layer, so “find in exhibit” can’t search it. You can still use your browser’s find (Ctrl/⌘-F) inside the viewer.
                </p>
              )}

              {/* On phones, PDFs in an embedded frame often render blank (iOS in
                  particular), so give a clear full-screen open. Shown only below
                  the desktop breakpoint — the desktop viewer is unchanged. */}
              <a
                href={`${proxyBase}/${current.id}?v=${current.fileTag}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-accent)] px-3 py-2.5 text-sm font-semibold text-white lg:hidden"
              >
                <ExternalLink size={16} /> Open exhibit full screen
              </a>

              {/* The PDF itself — native viewer gives scrolling, zoom, and its own
                  find. Keyed on file+page so a replace (new fileTag) or a #page
                  jump always reloads. */}
              <iframe
                key={`${current.id}:${showingHiRes ? `hi${current.hiResTag}` : current.fileTag}:${viewerPage}`}
                src={viewerSrc}
                title={current.label || current.title || "Exhibit"}
                className="min-h-0 flex-1 w-full rounded-b-lg bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {editId != null && (() => {
        const d = docs.find((x) => x.id === editId);
        return d ? (
          <ExhibitEditDialog setId={setId} doc={d} witnesses={witnesses} claims={claims} elements={elements} onClose={() => setEditId(null)} />
        ) : null;
      })()}

      {shareOpen && (
        <ShareDialog setId={setId} access={access} token={publicToken} recipients={recipients} docs={docs} ocEnabled={ocEnabled} ocToken={ocToken} onCopy={copy} onFlash={flash} onClose={() => setShareOpen(false)} />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

/** A small confirm dialog styled to match the site (in place of window.confirm). */
function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm rounded-lg bg-[var(--c-surface)] p-5 shadow-2xl">
        <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-base"><RefreshCw size={16} className="text-[var(--c-accent)]" /> {title}</h3>
        <p className="mt-2 text-sm text-[var(--c-ink-muted)]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={onConfirm} autoFocus className="btn btn-accent text-sm py-2 px-4">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- add / staged panel --------------------------- */
type Report = ReturnType<typeof numberingReport>;

/** Per-side numbering summary, e.g. "P-1–P-120 · D-1–D-80". */
function rangeSummary(items: Staged[]): string {
  const parts: string[] = [];
  for (const s of SIDES) {
    const nums = items.filter((i) => i.side === s && i.number != null).map((i) => i.number as number);
    if (!nums.length) continue;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    parts.push(lo === hi ? defaultLabel(s, lo) : `${defaultLabel(s, lo)}–${defaultLabel(s, hi)}`);
  }
  return parts.join("  ·  ");
}

const MODE_LABEL: Record<NumMode, string> = {
  keep: "Keep the numbers from the files",
  sequential: "Renumber 1, 2, 3… in order",
  manual: "I’ll set the numbers by hand",
};

function AddExhibits({ blobReady, dragOver, uploading, items, numMode, onSetMode, report, fileRef, onDragOver, onDragLeave, onDrop, onPick, onPatch, onRemove, onClear, onUpload }: {
  blobReady: boolean; dragOver: boolean; uploading: { done: number; total: number; pct?: number } | null; items: Staged[];
  numMode: NumMode; onSetMode: (m: NumMode) => void; report: Report;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  onPick: (list: FileList | null) => void; onPatch: (key: string, patch: Partial<Staged>) => void;
  onRemove: (key: string) => void; onClear: () => void; onUpload: () => void;
}) {
  // Collect gaps and clashes across sides for the notice.
  const gaps: string[] = [];
  const clashes: string[] = [];
  for (const s of SIDES) {
    for (const n of report[s].gaps) gaps.push(defaultLabel(s, n));
    for (const n of report[s].clashes) clashes.push(defaultLabel(s, n));
  }

  return (
    <div>
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-3 text-center transition-colors ${dragOver ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}
      >
        <Upload size={18} className="mx-auto mb-1 text-[var(--c-ink-muted)]" />
        <p className="text-xs text-[var(--c-ink-muted)]">Drop exhibit PDFs here, or</p>
        <button onClick={() => fileRef.current?.click()} className="mt-1 text-xs font-semibold text-[var(--c-accent)] hover:underline">Choose files</button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { onPick(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
        {!blobReady && <p className="mt-1 text-[11px] text-amber-600">Connect a Blob store to upload files.</p>}
      </div>

      {items.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><ListOrdered size={13} className="text-[var(--c-accent)]" /> {items.length} to add</span>
            <button onClick={onClear} disabled={!!uploading} className="text-[11px] text-[var(--c-ink-muted)] hover:text-red-600">Clear</button>
          </div>

          {/* Plain-language notice of exactly how these will be numbered before
              anything is saved — so nobody is surprised after the upload. */}
          <div className="mb-2 rounded-md border border-[var(--c-border)] bg-[var(--c-surface2)] p-2 text-[11px]">
            <div className="mb-1.5 flex items-start gap-1.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
              <span className="text-[var(--c-ink)]">
                These will be saved as <span className="font-semibold">{rangeSummary(items) || "numbered below"}</span> when you add them. Review the numbers first — change the option below if they’re not right.
              </span>
            </div>
            <select value={numMode} onChange={(e) => onSetMode(e.target.value as NumMode)} className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-[11px]">
              {(["keep", "sequential", "manual"] as NumMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>

            {numMode === "keep" && gaps.length > 0 && (
              <p className="mt-1.5 text-[var(--c-ink-muted)]">
                <span className="font-semibold text-[var(--c-ink)]">Skipped:</span> {gaps.join(", ")} — left out of the sequence. That’s expected if those exhibits were intentionally omitted; switch to “Renumber 1, 2, 3…” to close the gaps.
              </p>
            )}
            {clashes.length > 0 && (
              <p className="mt-1.5 text-red-600">
                <span className="font-semibold">Duplicate number{clashes.length === 1 ? "" : "s"}:</span> {clashes.join(", ")} — two exhibits share a number (or it already exists in this set). Fix it by hand or renumber before adding.
              </p>
            )}
          </div>

          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {items.map((s) => {
              const clash = s.number != null && report[s.side].clashes.includes(s.number);
              return (
                <li key={s.key} className={`rounded-md border bg-[var(--c-bg)] p-2 ${clash ? "border-red-500/50" : "border-[var(--c-border)]"}`}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <select value={s.side} onChange={(e) => onPatch(s.key, { side: e.target.value as Side })} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" title="Side">
                      <option value="plaintiff">P</option>
                      <option value="defendant">D</option>
                      <option value="joint">J</option>
                    </select>
                    {numMode === "manual" ? (
                      <>
                        <input value={s.number ?? ""} onChange={(e) => onPatch(s.key, { number: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} placeholder="#" inputMode="numeric" className="w-10 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" />
                        <input value={s.label} onChange={(e) => onPatch(s.key, { label: e.target.value })} placeholder="P-1" className="w-16 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" />
                      </>
                    ) : (
                      <span className={`inline-flex h-[22px] min-w-[3rem] items-center justify-center rounded px-1.5 text-[11px] font-bold ${clash ? "bg-red-500/15 text-red-600" : "bg-[var(--c-accent)]/10 text-[var(--c-accent)]"}`} title={clash ? "Duplicate number" : "Numbered from the order"}>{s.label || "—"}</span>
                    )}
                    <button onClick={() => onRemove(s.key)} disabled={!!uploading} className="ml-auto text-[var(--c-ink-muted)] hover:text-red-600"><X size={13} /></button>
                  </div>
                  <input value={s.title} onChange={(e) => onPatch(s.key, { title: e.target.value })} placeholder="Title" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5 text-[11px]" />
                  <div className="mt-0.5 truncate text-[10px] text-[var(--c-ink-muted)]" title={s.file.name}>{s.file.name}</div>
                </li>
              );
            })}
          </ul>
          <button onClick={onUpload} disabled={!blobReady || !!uploading} className="btn btn-accent mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs py-2 disabled:opacity-50">
            {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading {uploading.done + 1}/{uploading.total}{uploading.pct != null ? ` · ${uploading.pct}%` : "…"}</> : <><Upload size={13} /> Add {items.length} exhibit{items.length === 1 ? "" : "s"}</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ list row ------------------------------ */
function ExhibitRow({ d, active, index, onOpen, onSave, onToggleOmit, onEdit, onReplace, onCopyLink, onDelete, onHiResUpload, onViewHiRes, hiResPct }: {
  d: ReviewerDoc; active: boolean; index: number;
  onOpen: () => void; onSave: (patch: { priority?: string; trialStatus?: string; notes?: string }) => void; onToggleOmit: () => void; onEdit: () => void; onReplace: () => void; onCopyLink?: () => void; onDelete: () => void;
  onHiResUpload: () => void; onViewHiRes: () => void; hiResPct: number | null;
}) {
  // Keep the selected exhibit visible in the list when you page with the arrows.
  // "nearest" nudges only the list's own scroll, never the page.
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => { if (active) rowRef.current?.scrollIntoView({ block: "nearest" }); }, [active]);

  return (
    <li ref={rowRef} className={`group flex items-stretch overflow-hidden rounded-md border transition-colors ${active ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)]/40"}`}>
      {/* Left sliver tab: a thin strip of vertical text you click to keep an
          exhibit on the list or take it off — kept, never deleted. */}
      <button
        onClick={onToggleOmit}
        title={d.omitted ? "Omitted from the exhibit list — click to put it back on" : "On the exhibit list — click to omit it (kept, not deleted)"}
        className={`flex w-5 shrink-0 items-center justify-center border-r ${d.omitted ? "border-red-500/30 bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "border-green-500/30 bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"}`}
      >
        <span className="[writing-mode:vertical-rl] rotate-180 py-1 text-[9px] font-bold uppercase tracking-wide">{d.omitted ? "Omitted" : "On list"}</span>
      </button>
      <button onClick={onOpen} className={`flex min-w-0 flex-1 items-start gap-2 p-2 text-left ${d.omitted ? "opacity-55" : ""}`}>
        <span className={`mt-0.5 inline-flex h-6 min-w-[2.25rem] shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold ${active ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-surface2)] text-[var(--c-ink)]"}`}>
          {d.label || (d.number ?? index + 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-[var(--c-ink)]">{d.title || "Untitled exhibit"}</span>
          {/* The description sits between the title and the Bates line, showing up
              to two full lines of whatever was typed. */}
          {d.description && <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-[11px] leading-snug text-[var(--c-ink-muted)]" title={d.description}>{d.description}</span>}
          {(d.bates || d.batesEnd || d.pageCount) && <span className="mt-0.5 block truncate text-[10px] text-[var(--c-ink-muted)]">{batesRange(d.bates, d.batesEnd)}{batesRange(d.bates, d.batesEnd) && d.pageCount ? " · " : ""}{d.pageCount ? `${d.pageCount} pp` : ""}</span>}
        </span>
      </button>
      {/* Right column: flags + actions at the top, the High Res control pinned to
          the bottom-right of the row's box. */}
      <div className={`flex shrink-0 flex-col items-end justify-between gap-2 self-stretch p-2 pl-0 ${d.omitted ? "opacity-55" : ""}`}>
        <div className="flex items-start gap-1">
          {/* Prep priority (faded word pill) + trial status (solid dot) — always visible. */}
          <PriorityChip value={d.priority} onChange={(v) => onSave({ priority: v })} />
          <StatusBubble value={d.trialStatus} onChange={(v) => onSave({ trialStatus: v })} />
          {/* Notepad: always visible so its amber "has a note" state shows. */}
          <NoteButton notes={d.notes} onSave={(v) => onSave({ notes: v })} />
          {/* Always visible on touch (no hover there); hover-reveal kept on desktop. */}
          <span className="flex items-center opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
            {onCopyLink && <button onClick={onCopyLink} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Copy this exhibit's share link"><LinkIcon size={12} /></button>}
            <button onClick={onReplace} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Replace this exhibit's file"><RefreshCw size={12} /></button>
            <button onClick={onEdit} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit details, sponsors & elements"><Pencil size={12} /></button>
            <button onClick={onDelete} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={12} /></button>
          </span>
        </div>

        {/* High Res: the label opens the high-res version (when one exists); the
            icon uploads / replaces it. */}
        <span className={`inline-flex shrink-0 items-stretch overflow-hidden rounded-md border ${hiResPct != null ? "border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}>
          <button
            onClick={onViewHiRes}
            disabled={!d.hasHiRes || hiResPct != null}
            title={hiResPct != null ? "Uploading — don't leave the page" : d.hasHiRes ? "View the high-res version" : "No high-res version yet — upload one with the icon"}
            className={`min-w-[3.5rem] px-1.5 py-0.5 text-center text-[10px] font-bold ${hiResPct != null ? "bg-[var(--c-accent)] text-white" : d.hasHiRes ? "bg-[var(--c-accent)]/10 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/20" : "text-[var(--c-ink-muted)] opacity-60"}`}
          >
            {hiResPct != null ? `${hiResPct}%` : "High Res"}
          </button>
          <button onClick={onHiResUpload} disabled={hiResPct != null} title={d.hasHiRes ? "Replace the high-res version" : "Upload a high-res version"} className="border-l border-[var(--c-border)] px-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-accent)] disabled:opacity-50">
            {hiResPct != null ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          </button>
        </span>
      </div>
    </li>
  );
}

/* --------------------------- edit dialog --------------------------- */
/**
 * The full editor behind the pencil: the exhibit's own fields, plus the two
 * boxes the trial team needs — how it comes in (sponsoring witnesses and/or a
 * foundation shortcut) and what it proves (elements of a cause of action). The
 * witness list and the causes/elements are the set's own pick-lists, grown right
 * here from the "add" inputs so they're a click next time.
 */
function ExhibitEditDialog({ setId, doc, witnesses, claims, elements, onClose }: {
  setId: number; doc: ReviewerDoc; witnesses: WitnessLite[]; claims: ClaimLite[]; elements: ElementLite[]; onClose: () => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    side: doc.side, number: doc.number, label: doc.label, title: doc.title, description: doc.description, bates: doc.bates, batesEnd: doc.batesEnd,
    priority: doc.priority, trialStatus: doc.trialStatus,
    witnessIds: doc.witnessIds, foundation: doc.foundation, elementIds: doc.elementIds,
  });
  const [newWitness, setNewWitness] = useState("");
  const [newClaim, setNewClaim] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { await fn(); router.refresh(); });
  const toggleId = (key: "witnessIds" | "elementIds", id: number) =>
    setF((s) => ({ ...s, [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id] }));
  const toggleFoundation = (id: string) =>
    setF((s) => ({ ...s, foundation: s.foundation.includes(id) ? s.foundation.filter((x) => x !== id) : [...s.foundation, id] }));

  async function addWitness() {
    const name = newWitness.trim();
    if (!name) return;
    setNewWitness("");
    const r = await addExhibitWitness(setId, name);
    if (r.ok && r.id) setF((s) => ({ ...s, witnessIds: [...s.witnessIds, r.id!] }));
    router.refresh();
  }
  async function addClaim() {
    const name = newClaim.trim();
    if (!name) return;
    setNewClaim("");
    await addExhibitClaim(setId, name);
    router.refresh();
  }

  function save() {
    setSaving(true);
    updateExhibitDoc(doc.id, { ...f })
      .then(() => { router.refresh(); onClose(); })
      .finally(() => setSaving(false));
  }

  const field = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="my-6 w-full max-w-lg rounded-lg bg-[var(--c-surface)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-lg">Edit exhibit {f.label && <span className="text-[var(--c-accent)]">{f.label}</span>}</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[auto_auto_1fr] gap-2">
            <label className="block"><span className="mb-1 block text-[11px] font-semibold">Side</span>
              <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} className={field}>
                <option value="plaintiff">Plaintiff</option><option value="defendant">Defendant</option><option value="joint">Joint</option>
              </select>
            </label>
            <label className="block"><span className="mb-1 block text-[11px] font-semibold">No.</span>
              <input value={f.number ?? ""} onChange={(e) => setF({ ...f, number: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} inputMode="numeric" className={`${field} w-16`} />
            </label>
            <label className="block"><span className="mb-1 block text-[11px] font-semibold">Label</span>
              <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="P-1" className={field} />
            </label>
          </div>

          <label className="block"><span className="mb-1 block text-[11px] font-semibold">Title</span>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={field} />
          </label>
          <label className="block"><span className="mb-1 block text-[11px] font-semibold">Description</span>
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} className={`${field} resize-y`} />
          </label>
          <div>
            <span className="mb-1 block text-[11px] font-semibold">Bates range</span>
            <div className="flex items-center gap-2">
              <input value={f.bates} onChange={(e) => setF({ ...f, bates: e.target.value })} placeholder="from — e.g. RES_000260" className={field} />
              <span className="text-[var(--c-ink-muted)]">to</span>
              <input value={f.batesEnd} onChange={(e) => setF({ ...f, batesEnd: e.target.value })} placeholder="to — e.g. RES_000275" className={field} />
            </div>
            <p className="mt-1 text-[10px] text-[var(--c-ink-muted)]">Leave “to” blank for a single page. Search across all exhibits finds any number inside this range — even just the digits.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2"><span className="text-[11px] font-semibold">Priority</span><PriorityChip value={f.priority} onChange={(v) => setF({ ...f, priority: v })} /></div>
            <div className="flex items-center gap-2"><span className="text-[11px] font-semibold">Trial status</span><StatusBubble value={f.trialStatus} onChange={(v) => setF({ ...f, trialStatus: v })} /></div>
          </div>

          {/* Sponsoring witness / foundation */}
          <div className="rounded-md border border-[var(--c-border)] p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-[var(--c-ink)]">How it comes in — witness &amp; foundation</div>
            <div className="space-y-1">
              {witnesses.length === 0 && <p className="text-[11px] text-[var(--c-ink-muted)]">No witnesses yet. Add one below.</p>}
              {witnesses.map((w) => (
                <label key={w.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={f.witnessIds.includes(w.id)} onChange={() => toggleId("witnessIds", w.id)} className="accent-[var(--c-accent)]" />
                  <span className="flex-1 text-[var(--c-ink)]">{w.name}</span>
                  <button onClick={() => run(() => deleteExhibitWitness(w.id))} className="text-[var(--c-ink-muted)] hover:text-red-600" title="Remove from list"><X size={12} /></button>
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <input value={newWitness} onChange={(e) => setNewWitness(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWitness(); } }} placeholder="Add a witness…" className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-xs" />
              <button onClick={addWitness} className="rounded border border-[var(--c-border)] px-2 text-xs hover:bg-[var(--c-surface2)]">Add</button>
            </div>
            <div className="mt-2 border-t border-[var(--c-border)] pt-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Or a foundation shortcut</div>
              {FOUNDATION_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex items-start gap-2 py-0.5 text-xs">
                  <input type="checkbox" checked={f.foundation.includes(opt.id)} onChange={() => toggleFoundation(opt.id)} className="mt-0.5 accent-[var(--c-accent)]" />
                  <span><span className="text-[var(--c-ink)]">{opt.label}</span> <span className="text-[var(--c-ink-muted)]">— {opt.hint}</span></span>
                </label>
              ))}
            </div>
          </div>

          {/* Elements it covers */}
          <div className="rounded-md border border-[var(--c-border)] p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-[var(--c-ink)]">What it proves — elements</div>
            {claims.length === 0 && <p className="text-[11px] text-[var(--c-ink-muted)]">No causes of action yet. Add one below, then add its elements.</p>}
            <div className="space-y-2">
              {claims.map((c) => (
                <ClaimBlock key={c.id} setId={setId} claim={c} elements={elements.filter((e) => e.claimId === c.id)} selected={f.elementIds} onToggle={(id) => toggleId("elementIds", id)} onRefresh={() => router.refresh()} onDeleteClaim={() => run(() => deleteExhibitClaim(c.id))} />
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 border-t border-[var(--c-border)] pt-2">
              <input value={newClaim} onChange={(e) => setNewClaim(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClaim(); } }} placeholder="Add a cause of action…" className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-xs" />
              <button onClick={addClaim} className="rounded border border-[var(--c-border)] px-2 text-xs hover:bg-[var(--c-surface2)]">Add</button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** One cause of action inside the edit dialog: its elements as checkboxes, plus
 *  an inline "add element" input. */
function ClaimBlock({ setId, claim, elements, selected, onToggle, onRefresh, onDeleteClaim }: {
  setId: number; claim: ClaimLite; elements: ElementLite[]; selected: number[];
  onToggle: (id: number) => void; onRefresh: () => void; onDeleteClaim: () => void;
}) {
  const [text, setText] = useState("");
  async function add() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await addExhibitElement(setId, claim.id, t);
    onRefresh();
  }
  return (
    <div className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold text-[var(--c-accent)]">{claim.name}</span>
        <button onClick={onDeleteClaim} className="text-[var(--c-ink-muted)] hover:text-red-600" title="Remove this cause of action"><Trash2 size={12} /></button>
      </div>
      {elements.map((e) => (
        <label key={e.id} className="flex items-start gap-2 py-0.5 text-xs">
          <input type="checkbox" checked={selected.includes(e.id)} onChange={() => onToggle(e.id)} className="mt-0.5 accent-[var(--c-accent)]" />
          <span className="flex-1 text-[var(--c-ink)]">{e.text}</span>
          <button onClick={async () => { await deleteExhibitElement(e.id); onRefresh(); }} className="text-[var(--c-ink-muted)] hover:text-red-600" title="Remove element"><X size={11} /></button>
        </label>
      ))}
      <div className="mt-1 flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Add an element…" className="flex-1 rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-0.5 text-[11px]" />
        <button onClick={add} className="rounded border border-[var(--c-border)] px-2 text-[11px] hover:bg-[var(--c-surface2)]">Add</button>
      </div>
    </div>
  );
}
