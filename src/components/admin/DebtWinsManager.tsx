"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, Loader2, Trash2, X, Pencil, Check, Eye, EyeOff, Lock } from "lucide-react";
import { addDebtWin, updateDebtWin, deleteDebtWin, setDebtWinsPublic } from "@/app/admin/(panel)/debt-wins/actions";
import { DebtWinsMetrics } from "./DebtWinsMetrics";

export type DebtWinRow = {
  id: number; amount: number; settledPaid: number; outcome: string; wonAt: string;
  court: string; caseNumber: string; plaintiff: string; note: string; createdBy: string;
  /** Confidential settlement; `redacted` = this viewer received masked fields. */
  confidential: boolean; redacted: boolean;
};

/** Blurred stand-in for details this viewer isn't allowed to see. */
const Redacted = () => <span className="select-none blur-[3px] text-[var(--c-ink-muted)]" aria-label="Confidential">Confidential</span>;

/** What the counter may claim: for settlements, only the unpaid difference. */
export const netAmount = (r: Pick<DebtWinRow, "amount" | "settledPaid" | "outcome">) =>
  r.outcome === "settled" ? Math.max(0, r.amount - r.settledPaid) : r.amount;

/**
 * Whether an entry counts as a WIN in the totals. Plaintiff judgments never
 * do; a settlement only qualifies when it settled for MORE than 90% below the
 * claim (client paid under 10% of what was demanded). Anything else is logged
 * for the record but kept out of the counter.
 */
export const qualifiesAsWin = (r: Pick<DebtWinRow, "amount" | "settledPaid" | "outcome">) =>
  r.outcome !== "judgment-plaintiff" &&
  (r.outcome !== "settled" || (r.amount > 0 && r.settledPaid < r.amount * 0.1));

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const OUTCOME_LABEL: Record<string, string> = {
  nonsuit: "Non-suited",
  judgment: "Judgment for the defendant",
  "dismissed-wp": "Dismissed with prejudice",
  "dismissed-wop": "Dismissed without prejudice",
  "dismissed-smj": "Dismissed — lack of subject-matter jurisdiction",
  settled: "Settled",
  "judgment-plaintiff": "Judgment for the plaintiff",
  other: "Other win",
};
/** Everything except a plaintiff judgment counts toward the totals. */
const isWin = (outcome: string) => outcome !== "judgment-plaintiff";
const OUTCOME_OPTIONS = ["nonsuit", "judgment", "dismissed-wp", "dismissed-wop", "dismissed-smj", "settled", "judgment-plaintiff", "other"] as const;
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/**
 * A text input that remembers: suggestions from every value previously
 * entered, filtered as you type, so the same court or plaintiff is always
 * spelled the same way. A value that matches nothing shows a "+ add" row —
 * picking it (or just leaving the text) records the new spelling for next time.
 */
function SuggestInput({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 8);
  const exact = options.some((o) => o.toLowerCase() === q);
  return (
    <div className="relative">
      <div className="flex items-center rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] focus-within:border-[var(--c-accent)]">
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
        {value && (
          <button onMouseDown={(e) => { e.preventDefault(); onChange(""); }} title="Clear" className="px-2 text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={14} /></button>
        )}
      </div>
      {open && (matches.length > 0 || (q && !exact)) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
          {matches.map((o) => (
            <div key={o} onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }} className="cursor-pointer px-3 py-2 text-sm hover:bg-[var(--c-surface2)]">
              {o}
            </div>
          ))}
          {q && !exact && (
            <div onMouseDown={(e) => { e.preventDefault(); onChange(value.trim()); setOpen(false); }} className="flex cursor-pointer items-center gap-1.5 border-t border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-accent)] hover:bg-[var(--c-surface2)]">
              <Plus size={13} /> Add &ldquo;{value.trim()}&rdquo; as new
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Edit one logged win — same fields as the add form, in a dialog. */
function EditWinDialog({ row, courts, plaintiffs, onClose }: { row: DebtWinRow; courts: string[]; plaintiffs: string[]; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(row.amount));
  const [paid, setPaid] = useState(row.settledPaid ? String(row.settledPaid) : "");
  const [confidential, setConfidential] = useState(row.confidential);
  const [outcome, setOutcome] = useState(row.outcome);
  const [wonAt, setWonAt] = useState(row.wonAt);
  const [court, setCourt] = useState(row.court);
  const [caseNumber, setCaseNumber] = useState(row.caseNumber);
  const [plaintiff, setPlaintiff] = useState(row.plaintiff);
  const [note, setNote] = useState(row.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateDebtWin(row.id, { amount: parseFloat(amount) || 0, settledPaid: parseFloat(paid) || 0, outcome, confidential, wonAt, court, caseNumber, plaintiff, note });
      if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-lg bg-[var(--c-surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg">
            <Pencil size={16} className="text-[var(--c-accent)]" /> Edit this win
            {confidential && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]"><Lock size={11} /> Confidential</span>
            )}
          </h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">{outcome === "settled" ? "Amount claimed in the lawsuit ($)" : "Amount sued on ($)"}{isWin(outcome) ? "" : " — n/a for a plaintiff judgment"}</span>
            <input type="number" step="0.01" min="0" value={isWin(outcome) ? amount : ""} disabled={!isWin(outcome)} onChange={(e) => setAmount(e.target.value)} className={`${input} w-full disabled:cursor-not-allowed disabled:opacity-40`} />
          </label>
          {outcome === "settled" && (
            <label className="text-xs">
              <span className="mb-1 block text-[var(--c-ink-muted)]">Amount paid at settlement ($)</span>
              <input type="number" step="0.01" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} className={`${input} w-full`} />
              {amount.trim() && paid.trim() && (
                (parseFloat(paid) || 0) < (parseFloat(amount) || 0) * 0.1
                  ? <span className="mt-1 block text-[11px] text-[var(--c-ink-muted)]">Counts as <strong className="text-[var(--c-ink)]">{money(Math.max(0, (parseFloat(amount) || 0) - (parseFloat(paid) || 0)))}</strong> defeated.</span>
                  : <span className="mt-1 block text-[11px] font-medium text-amber-600">Settled at 10%+ of the claim — logged, but NOT counted as a win (must be more than 90% below the claim).</span>
              )}
            </label>
          )}
          {outcome === "settled" && (
            <label className="flex items-center gap-2 text-xs cursor-pointer sm:col-span-2">
              <input type="checkbox" className="accent-[var(--c-accent)]" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
              <span className="inline-flex items-center gap-1"><Lock size={12} className="text-[var(--c-accent)]" /> Confidential settlement — details visible only to the owner and whoever logged it; only the amount stays visible to others.</span>
            </label>
          )}
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Plaintiff (who sued)</span>
            <SuggestInput value={plaintiff} onChange={setPlaintiff} options={plaintiffs} placeholder="e.g., LVNV Funding, LLC" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Court / location</span>
            <SuggestInput value={court} onChange={setCourt} options={courts} placeholder="e.g., JP Precinct 4, Tarrant County" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Case / cause number</span>
            <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} className={`${input} w-full`} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={`${input} w-full`}>
              {OUTCOME_OPTIONS.map((k) => <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Date won</span>
            <input type="date" value={wonAt} onChange={(e) => setWonAt(e.target.value)} className={`${input} w-full`} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Notes from the attorney <span className="opacity-70">(internal only)</span></span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${input} w-full`} />
          </label>
        </div>
        {error && <p className="mt-3 text-xs text-[var(--c-error)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={save} disabled={pending || (isWin(outcome) && !amount.trim()) || (outcome === "settled" && !paid.trim())} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/** Log won debt-defense cases and watch the marketing counter climb. */
export function DebtWinsManager({ rows, courts, plaintiffs, publicOn }: { rows: DebtWinRow[]; courts: string[]; plaintiffs: string[]; publicOn: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [outcome, setOutcome] = useState("nonsuit");
  const [wonAt, setWonAt] = useState(todayISO());
  const [court, setCourt] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<DebtWinRow | null>(null);
  const [pending, start] = useTransition();

  // Scoreboard = wins only; a judgment for the plaintiff is logged for the
  // record but never joins the public totals.
  const wins = rows.filter(qualifiesAsWin);
  const losses = rows.filter((r) => r.outcome === "judgment-plaintiff").length;
  const weakSettlements = rows.length - wins.length - losses;
  const count = wins.length;
  const total = wins.reduce((s, r) => s + netAmount(r), 0);

  function add() {
    setError(null);
    start(async () => {
      const res = await addDebtWin({ amount: parseFloat(amount) || 0, settledPaid: parseFloat(paid) || 0, outcome, confidential, wonAt, court, caseNumber, plaintiff, note });
      if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
      setAmount(""); setPaid(""); setConfidential(false); setCourt(""); setCaseNumber(""); setPlaintiff(""); setNote(""); setWonAt(todayISO());
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Master switch — nothing shows on the website until this is on. */}
      <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-4 ${publicOn ? "border-green-600/40 bg-green-600/[0.06]" : "border-[var(--c-border)] bg-[var(--c-surface)]"}`}>
        {publicOn ? <Eye size={18} className="text-green-700" /> : <EyeOff size={18} className="text-[var(--c-ink-muted)]" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{publicOn ? "Debt Defense Results are LIVE on the debt-defense page" : "Debt Defense Results are hidden from the website"}</p>
          <p className="text-xs text-[var(--c-ink-muted)]">{publicOn ? "Turn it off anytime — entries here are kept either way. The case count shows publicly only at 100+, rounded down in 50s (100+, 150+, …); the dollar figure shows from the first win." : "Log everything first, then flip it on when the numbers are ready to show. The case count shows publicly only at 100+, rounded down in 50s; the dollar figure shows from the first win."}</p>
        </div>
        <button
          onClick={() => start(async () => { await setDebtWinsPublic(!publicOn); router.refresh(); })}
          disabled={pending}
          className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 ${publicOn ? "border border-[var(--c-border)] text-[var(--c-ink)] hover:border-[var(--c-error)] hover:text-[var(--c-error)]" : "bg-[var(--c-accent)] text-white hover:brightness-110"}`}
        >
          {publicOn ? "Turn off" : "Turn on"}
        </button>
      </div>

      {/* The running tally — the same numbers the website shows. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center">
          <div className="font-[family-name:var(--font-display)] text-4xl text-[var(--c-accent)]">{count}</div>
          <div className="mt-1 text-xs text-[var(--c-ink-muted)]">Collection suits defeated</div>
        </div>
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center">
          <div className="font-[family-name:var(--font-display)] text-4xl text-[var(--c-accent)]">{money(total)}</div>
          <div className="mt-1 text-xs text-[var(--c-ink-muted)]">In claims defeated</div>
        </div>
      </div>
      {losses > 0 && (
        <p className="text-xs text-[var(--c-ink-muted)]">{losses} judgment{losses === 1 ? "" : "s"} for the plaintiff logged for the record — never counted in the totals above or shown on the website.</p>
      )}
      {weakSettlements > 0 && (
        <p className="text-xs text-[var(--c-ink-muted)]">{weakSettlements} settlement{weakSettlements === 1 ? "" : "s"} at 10% or more of the claim — logged for the record, but only settlements more than 90% below the claim count as wins.</p>
      )}

      <DebtWinsMetrics rows={rows} />

      {/* Log a case result */}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck size={15} className="text-[var(--c-accent)]" /> Log a case result</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">{outcome === "settled" ? "Amount claimed in the lawsuit ($)" : "Amount sued on ($)"}{isWin(outcome) ? "" : " — n/a for a plaintiff judgment"}</span>
            <input type="number" step="0.01" min="0" value={isWin(outcome) ? amount : ""} disabled={!isWin(outcome)} onChange={(e) => setAmount(e.target.value)} placeholder="e.g., 8500" className={`${input} w-full disabled:cursor-not-allowed disabled:opacity-40`} />
          </label>
          {outcome === "settled" && (
            <label className="text-xs">
              <span className="mb-1 block text-[var(--c-ink-muted)]">Amount paid at settlement ($)</span>
              <input type="number" step="0.01" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="e.g., 1500" className={`${input} w-full`} />
              {amount.trim() && paid.trim() && (
                (parseFloat(paid) || 0) < (parseFloat(amount) || 0) * 0.1
                  ? <span className="mt-1 block text-[11px] text-[var(--c-ink-muted)]">Counts as <strong className="text-[var(--c-ink)]">{money(Math.max(0, (parseFloat(amount) || 0) - (parseFloat(paid) || 0)))}</strong> defeated — only the part the client didn&apos;t pay.</span>
                  : <span className="mt-1 block text-[11px] font-medium text-amber-600">Settled at 10%+ of the claim — logged, but NOT counted as a win (must be more than 90% below the claim).</span>
              )}
            </label>
          )}
          {outcome === "settled" && (
            <label className="flex items-center gap-2 self-end pb-2.5 text-xs cursor-pointer">
              <input type="checkbox" className="accent-[var(--c-accent)]" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
              <span className="inline-flex items-center gap-1"><Lock size={12} className="text-[var(--c-accent)]" /> Confidential settlement — hide the plaintiff, case number, court, date, and notes from everyone except the owner and whoever logs it. Only the amount stays visible. Never shown on the website.</span>
            </label>
          )}
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Plaintiff (who sued) — reuses past spellings</span>
            <SuggestInput value={plaintiff} onChange={setPlaintiff} options={plaintiffs} placeholder="e.g., LVNV Funding, LLC" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Court / location — reuses past spellings</span>
            <SuggestInput value={court} onChange={setCourt} options={courts} placeholder="e.g., JP Precinct 4, Tarrant County" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Case / cause number</span>
            <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="e.g., JP04-24-SC-00123" className={`${input} w-full`} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={`${input} w-full`}>
              {OUTCOME_OPTIONS.map((k) => <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Date won</span>
            <input type="date" value={wonAt} onChange={(e) => setWonAt(e.target.value)} className={`${input} w-full`} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Notes from the attorney <span className="opacity-70">(internal only)</span></span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering about how this one was won…" className={`${input} w-full`} />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
        <button onClick={add} disabled={pending || (isWin(outcome) && !amount.trim()) || (outcome === "settled" && !paid.trim())} className="btn btn-accent mt-3 text-sm disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add to the counter
        </button>
      </div>

      {/* History */}
      <div className="overflow-x-auto rounded-lg border border-[var(--c-border)]">
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead className="bg-[var(--c-surface2)] text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">Plaintiff</th>
              <th className="px-3 py-2.5 font-medium">Court</th>
              <th className="px-3 py-2.5 font-medium">Case #</th>
              <th className="px-3 py-2.5 font-medium">Outcome</th>
              <th className="px-3 py-2.5 font-medium">Notes</th>
              <th className="px-3 py-2.5 font-medium">By</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-border)]">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--c-ink-muted)]">No wins logged yet — the first one starts the counter.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="bg-[var(--c-surface)] align-top">
                <td className="px-3 py-2.5 whitespace-nowrap">{r.redacted ? <Redacted /> : r.wonAt}</td>
                <td className="px-3 py-2.5 tabular-nums" title={r.outcome === "settled" && !r.redacted ? `Claimed ${money(r.amount)} — paid ${money(r.settledPaid)}` : undefined}>{isWin(r.outcome) ? money(netAmount(r)) : "—"}{r.outcome === "settled" ? <span className="text-[var(--c-ink-muted)]"> net</span> : null}{r.outcome === "settled" && !qualifiesAsWin(r) ? <span className="block text-[10px] font-medium text-amber-600">not counted</span> : null}</td>
                <td className="px-3 py-2.5">{r.redacted ? <Redacted /> : r.plaintiff || "—"}</td>
                <td className="px-3 py-2.5">{r.redacted ? <Redacted /> : r.court || "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{r.redacted ? <Redacted /> : r.caseNumber || "—"}</td>
                <td className={`px-3 py-2.5 ${isWin(r.outcome) ? "" : "font-medium text-[var(--c-error)]"}`}>
                  {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                  {r.confidential && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--c-accent)]" title="Confidential settlement — details limited to the owner and whoever logged it"><Lock size={9} /> conf.</span>}
                </td>
                <td className="max-w-[16rem] px-3 py-2.5 text-xs text-[var(--c-ink-muted)]">{r.redacted ? <Redacted /> : <span title={r.note}>{r.note ? (r.note.length > 90 ? r.note.slice(0, 90) + "…" : r.note) : "—"}</span>}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--c-ink-muted)]">{r.createdBy.split("@")[0]}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  {r.redacted ? (
                    <Lock size={14} className="text-[var(--c-ink-muted)]" aria-label="Only the owner or the person who logged this can change it" />
                  ) : (<>
                    <button onClick={() => setEditFor(r)} title="Edit this entry" className="mr-2 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Remove this ${money(r.amount)} win from the counter?`)) start(async () => { await deleteDebtWin(r.id); router.refresh(); }); }}
                      title="Remove (adjusts the counter)"
                      className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editFor && <EditWinDialog key={editFor.id} row={editFor} courts={courts} plaintiffs={plaintiffs} onClose={() => setEditFor(null)} />}
    </div>
  );
}
