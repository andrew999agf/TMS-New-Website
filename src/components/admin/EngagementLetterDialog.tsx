"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Download, Send, Check, FileSignature, Trash2, CircleAlert, Eye } from "lucide-react";
import { saveEngagementLetter, setEngagementStatus, deleteEngagementLetter, type EngagementInput } from "@/app/admin/(panel)/intake/engagement-actions";
import {
  resolveOffice, defaultFees, defaultOpenUntil, OFFICE_INFO,
  PHASE1_STANDARD, PHASE2_STANDARD,
  type EngagementOffice, type EngagementSide,
} from "@/lib/engagement/config";
import { engagementPrefill } from "@/lib/intake/config";
import type { EngagementFees } from "@/db/schema";

/** Serialized engagement letter row, as the intake page ships it to the client. */
export type LetterRow = {
  id: number;
  intakeId: number | null;
  clientName: string; businessName: string; officerTitle: string; andIndividually: boolean;
  email: string; street: string; city: string; state: string; zip: string; county: string;
  office: EngagementOffice; side: EngagementSide;
  generalDescription: string; caseNumber: string; caseStyling: string;
  phase1Custom: string; phase2Custom: string;
  phase1: boolean; phase2: boolean;
  fees: EngagementFees;
  openUntil: string | null;
  status: "draft" | "sent" | "signed" | "declined";
  sentAt: string | null;
  createdAt: string;
};

const input = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]";
const CT = { timeZone: "America/Chicago" } as const;
const ymdCT = (d: Date) => d.toLocaleDateString("en-CA", CT);
const hmCT = (d: Date) => d.toLocaleTimeString("en-US", { ...CT, hour12: false, hour: "2-digit", minute: "2-digit" });

const STATUS_CHIP: Record<LetterRow["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-[var(--c-surface-2)] text-[var(--c-ink-muted)]" },
  sent: { label: "Sent — awaiting signature", cls: "bg-amber-500/15 text-amber-600" },
  signed: { label: "Signed", cls: "bg-green-600/15 text-green-700" },
  declined: { label: "Declined", cls: "bg-red-600/10 text-red-600" },
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="block text-sm font-medium mb-1.5">{label}</label>{children}</div>;
}

/**
 * Build (and manage) engagement letters for one intake lead. The office is
 * decided once from the client's county — Bosque, Hamilton, Coryell, or
 * Somervell → Meridian, everything else → Fort Worth — and every fee default
 * follows from that choice. All figures stay editable.
 */
export function EngagementLetterDialog({ intakeId, branch, answers, presetName, presetEmail, presetCounty, letters, onClose }: {
  intakeId: number;
  branch: string;
  answers: Record<string, unknown>;
  presetName: string;
  presetEmail: string;
  presetCounty: string;
  letters: LetterRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const draft = letters.find((l) => l.status === "draft");
  // Everything the intake already told us: side, matter description, active
  // case details, mailing address, business name. All editable below.
  const pre = useMemo(() => engagementPrefill(branch, answers), [branch, answers]);
  // The office comes from the client's ADDRESS county — the one they gave in
  // the intake — decided once, with everything else flowing from it.
  const initialOffice: EngagementOffice = draft?.office ?? resolveOffice(presetCounty);
  const openDefault = useMemo(() => defaultOpenUntil(), []);

  const [id, setId] = useState<number | null>(draft?.id ?? null);
  const [form, setForm] = useState(() => ({
    clientName: draft?.clientName ?? presetName,
    businessName: draft?.businessName ?? pre.businessName,
    officerTitle: draft?.officerTitle ?? "",
    andIndividually: draft?.andIndividually ?? true,
    email: draft?.email ?? presetEmail,
    street: draft?.street ?? pre.street,
    city: draft?.city ?? pre.city,
    state: draft?.state ?? pre.state,
    zip: draft?.zip ?? pre.zip,
    county: draft?.county ?? presetCounty,
    side: (draft?.side ?? pre.side ?? "plaintiff") as EngagementSide,
    generalDescription: draft?.generalDescription ?? pre.description,
    caseNumber: draft?.caseNumber ?? pre.caseNumber,
    caseStyling: draft?.caseStyling ?? pre.caseStyling,
    phase1Custom: draft?.phase1Custom ?? "",
    phase2Custom: draft?.phase2Custom ?? "",
    // An already-filed case skips the demand-letter phase by default.
    phase1: draft?.phase1 ?? !pre.activeCase,
    phase2: draft?.phase2 ?? true,
    openUntilDate: draft?.openUntil ? ymdCT(new Date(draft.openUntil)) : ymdCT(openDefault),
    openUntilTime: draft?.openUntil ? hmCT(new Date(draft.openUntil)) : "17:00",
  }));
  const [office, setOffice] = useState<EngagementOffice>(initialOffice);
  const [fees, setFees] = useState<EngagementFees>(draft?.fees ?? defaultFees(initialOffice));
  const [showStandards, setShowStandards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (k: string, v: string | boolean) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const setFee = (k: keyof EngagementFees, v: string) => { setFees((f) => ({ ...f, [k]: parseFloat(v) || 0 })); setSaved(false); };
  /** At least one phase always stays on. */
  const togglePhase = (k: "phase1" | "phase2") => {
    setForm((f) => {
      const next = !f[k];
      if (!next && !(k === "phase1" ? f.phase2 : f.phase1)) return f;
      return { ...f, [k]: next };
    });
    setSaved(false);
  };

  /** County typed → recompute the office, and reset fees to that office's defaults. */
  function onCounty(v: string) {
    set("county", v);
    const o = resolveOffice(v);
    if (o !== office) { setOffice(o); setFees(defaultFees(o)); }
  }
  function onOffice(o: EngagementOffice) {
    if (o === office) return;
    setOffice(o); setFees(defaultFees(o)); setSaved(false);
  }

  function payload(): EngagementInput {
    return { id: id ?? undefined, intakeId, office, fees, ...form };
  }

  function save(then?: (savedId: number) => void) {
    setError(null);
    start(async () => {
      const res = await saveEngagementLetter(payload());
      if (!res.ok || !res.id) { setError(res.error ?? "Save failed."); return; }
      setId(res.id); setSaved(true);
      router.refresh();
      then?.(res.id);
    });
  }

  const download = (letterId: number) => { window.open(`/admin/intake/engagement/${letterId}`, "_blank"); };

  function lifecycle(letterId: number, status: "sent" | "signed" | "declined") {
    start(async () => {
      const res = await setEngagementStatus(letterId, status);
      if (!res.ok) setError(res.error ?? "Update failed.");
      router.refresh();
    });
  }

  const others = letters.filter((l) => l.id !== id);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--c-surface)] rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-[family-name:var(--font-display)] text-lg flex items-center gap-2"><FileSignature size={18} className="text-[var(--c-accent)]" /> Engagement letter</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>
        <p className="text-xs text-[var(--c-ink-muted)] mb-4">
          Basic litigation letter. The county picks the office — Bosque, Hamilton, Coryell, or Somervell go to Meridian; everything else Fort Worth — and the fees below default from that. Change anything you need.
        </p>

        {/* Previously issued letters on this lead */}
        {others.length > 0 && (
          <div className="mb-5 rounded-md border border-[var(--c-border)] divide-y divide-[var(--c-border)]">
            {others.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{l.businessName || l.clientName}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CHIP[l.status].cls}`}>{STATUS_CHIP[l.status].label}</span>
                <span className="text-xs text-[var(--c-ink-muted)]">{new Date(l.createdAt).toLocaleDateString()}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => download(l.id)} title="Download .docx" className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><Download size={15} /></button>
                  {l.status === "draft" && (
                    <button onClick={() => lifecycle(l.id, "sent")} className="text-xs text-[var(--c-accent)] hover:underline">Mark sent</button>
                  )}
                  {l.status === "sent" && (
                    <>
                      <button onClick={() => lifecycle(l.id, "signed")} className="text-xs text-green-700 hover:underline">Signed</button>
                      <button onClick={() => lifecycle(l.id, "declined")} className="text-xs text-red-600 hover:underline">Declined</button>
                    </>
                  )}
                  {l.status === "draft" && (
                    <button onClick={() => { if (confirm("Delete this draft letter?")) start(async () => { await deleteEngagementLetter(l.id); router.refresh(); }); }} title="Delete draft" className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><Trash2 size={14} /></button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {/* Who */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Client / signer name"><input className={input} value={form.clientName} onChange={(e) => set("clientName", e.target.value)} /></Field>
            <Field label="Business name (blank = individual)"><input className={input} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Acme Widgets, LLC" /></Field>
          </div>
          {form.businessName.trim() && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Signer's title at the business"><input className={input} value={form.officerTitle} onChange={(e) => set("officerTitle", e.target.value)} placeholder="President" /></Field>
              <label className="flex items-center gap-2 text-sm self-end pb-2.5 cursor-pointer">
                <input type="checkbox" className="accent-[var(--c-accent)]" checked={form.andIndividually} onChange={(e) => set("andIndividually", e.target.checked)} />
                Also signing individually
              </label>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email (letter is sent via email)"><input className={input} value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Street address"><input className={input} value={form.street} onChange={(e) => set("street", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="City"><input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="State"><input className={input} value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
            <Field label="Zip"><input className={input} value={form.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
            <Field label="County"><input className={input} value={form.county} onChange={(e) => onCounty(e.target.value)} placeholder="Tarrant" /></Field>
          </div>

          {/* Office + side */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={`Sending office (from the county — phone ${OFFICE_INFO[office].phone})`}>
              <div className="flex gap-2">
                {(["fort-worth", "meridian"] as const).map((o) => (
                  <button key={o} onClick={() => onOffice(o)} className={`flex-1 rounded-md border px-3 py-2 text-sm ${office === o ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink)]"}`}>
                    {OFFICE_INFO[o].label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Our client is the…">
              <div className="flex gap-2">
                {(["plaintiff", "defendant"] as const).map((s) => (
                  <button key={s} onClick={() => set("side", s)} className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${form.side === s ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink)]"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Matter */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="General description" className="sm:col-span-1"><input className={input} value={form.generalDescription} onChange={(e) => set("generalDescription", e.target.value)} placeholder="Breach of contract" /></Field>
            <Field label="Cause number (if filed)"><input className={input} value={form.caseNumber} onChange={(e) => set("caseNumber", e.target.value)} /></Field>
            <Field label="Case style (if filed)"><input className={input} value={form.caseStyling} onChange={(e) => set("caseStyling", e.target.value)} placeholder="Smith v. Jones" /></Field>
          </div>

          {/* Phases — an engagement doesn't have to be demand-letter-then-lawsuit. */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">What does this engagement include?</div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="accent-[var(--c-accent)]" checked={form.phase1} onChange={() => togglePhase("phase1")} />
                {form.side === "plaintiff" ? "Pre-litigation (demand letter)" : "Pre-litigation (respond to the demand)"}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="accent-[var(--c-accent)]" checked={form.phase2} onChange={() => togglePhase("phase2")} />
                Lawsuit
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--c-ink-muted)]">
              {form.phase1 && form.phase2
                ? "Two phases: the letter presents Phase 1 (pre-litigation) with Phase 2 (lawsuit) as optional."
                : "One phase: the letter drops the phase numbering and simply calls it the representation."}
            </p>
          </div>

          {/* Case-specific scope additions, with the standard language on demand */}
          <div className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)]/50 p-3 text-xs text-[var(--c-ink-muted)]">
            <CircleAlert size={13} className="inline mr-1 -mt-0.5 text-[var(--c-accent)]" />
            The letter already includes the standard {form.side} language — add anything case-specific below (one item per line), or leave blank.
            <button onClick={() => setShowStandards((v) => !v)} className="ml-2 inline-flex items-center gap-1 font-medium text-[var(--c-accent)] hover:underline">
              <Eye size={12} /> {showStandards ? "Hide the standard language" : "See what's already included"}
            </button>
          </div>
          {showStandards && (
            <div className="rounded-md border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/[0.04] p-3 text-xs leading-relaxed">
              {form.phase1 && (
                <div>
                  <p className="font-semibold text-[var(--c-ink)]">{form.phase1 && form.phase2 ? "Phase 1" : "Representation"} — standard {form.side} items:</p>
                  <ul className="mt-1 list-disc pl-4 text-[var(--c-ink-muted)]">
                    {PHASE1_STANDARD[form.side].map((b) => <li key={b}>{b};</li>)}
                  </ul>
                </div>
              )}
              {form.phase2 && (
                <div className={form.phase1 ? "mt-2" : ""}>
                  <p className="font-semibold text-[var(--c-ink)]">{form.phase1 ? "Phase 2" : "Representation"} — standard {form.side} items:</p>
                  <ul className="mt-1 list-disc pl-4 text-[var(--c-ink-muted)]">
                    {PHASE2_STANDARD[form.side].map((b) => <li key={b}>{b};</li>)}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-[var(--c-ink-muted)]">Each list closes with: &ldquo;Assisting and otherwise counsel the Client regarding the matter.&rdquo;</p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            {form.phase1 && (
              <Field label={`${form.phase1 && form.phase2 ? "Phase 1 (pre-litigation)" : "Representation"} — case-specific additions`}>
                <textarea rows={3} className={input} value={form.phase1Custom} onChange={(e) => set("phase1Custom", e.target.value)} placeholder="One item per line — added after the standard language" />
              </Field>
            )}
            {form.phase2 && (
              <Field label={`${form.phase1 && form.phase2 ? "Phase 2 (lawsuit)" : "Representation"} — case-specific additions`}>
                <textarea rows={3} className={input} value={form.phase2Custom} onChange={(e) => set("phase2Custom", e.target.value)} placeholder="One item per line — added after the standard language" />
              </Field>
            )}
          </div>

          {/* Fees */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Rates &amp; retainers — {OFFICE_INFO[office].label} defaults, edit freely</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Attorney ($/hr)"><input type="number" step="5" className={input} value={fees.attorneyRate} onChange={(e) => setFee("attorneyRate", e.target.value)} /></Field>
              <Field label="Associates / contract ($/hr)"><input type="number" step="5" className={input} value={fees.associateRate} onChange={(e) => setFee("associateRate", e.target.value)} /></Field>
              <Field label="Staff / clerical ($/hr)"><input type="number" step="5" className={input} value={fees.staffRate} onChange={(e) => setFee("staffRate", e.target.value)} /></Field>
              {form.phase1 && (
                <Field label={form.phase2 ? "Phase 1 retainer ($)" : "Initial retainer ($)"}><input type="number" step="100" className={input} value={fees.phase1Retainer} onChange={(e) => setFee("phase1Retainer", e.target.value)} /></Field>
              )}
              {form.phase2 && (<>
                <Field label={form.phase1 ? "Phase 2 litigation retainer ($)" : "Litigation retainer ($)"}><input type="number" step="500" className={input} value={fees.litigationRetainer} onChange={(e) => setFee("litigationRetainer", e.target.value)} /></Field>
                <Field label="Minimum trust balance ($)"><input type="number" step="500" className={input} value={fees.minTrustBalance} onChange={(e) => setFee("minTrustBalance", e.target.value)} /></Field>
                <Field label="Trial retainer ($)"><input type="number" step="500" className={input} value={fees.trialRetainer} onChange={(e) => setFee("trialRetainer", e.target.value)} /></Field>
              </>)}
            </div>
          </div>

          {/* Deadline */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Offer open until (date)"><input type="date" className={input} value={form.openUntilDate} onChange={(e) => set("openUntilDate", e.target.value)} /></Field>
            <Field label="Time (Central)"><input type="time" className={input} value={form.openUntilTime} onChange={(e) => set("openUntilTime", e.target.value)} /></Field>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-[var(--c-error)]">{error}</p>}
        {saved && !error && <p className="mt-4 text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={14} /> Saved.</p>}

        <div className="mt-6 flex flex-wrap gap-2 justify-end border-t border-[var(--c-border)] pt-4">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Close</button>
          <button onClick={() => save()} disabled={pending} className="btn btn-outline text-sm py-2 px-4 disabled:opacity-50">Save draft</button>
          <button onClick={() => save((sid) => download(sid))} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50"><Download size={15} /> Save &amp; download .docx</button>
          <button
            onClick={() => save((sid) => lifecycle(sid, "sent"))}
            disabled={pending}
            title="Records that the letter went out — the lead's status becomes Letter Sent"
            className="btn text-sm py-2 px-4 text-white disabled:opacity-50" style={{ background: "var(--c-success)" }}
          >
            <Send size={15} /> Mark sent
          </button>
        </div>
      </div>
    </div>
  );
}
