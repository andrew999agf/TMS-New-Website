"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, Loader2, Trash2, X } from "lucide-react";
import { addDebtWin, deleteDebtWin } from "@/app/admin/(panel)/debt-wins/actions";

export type DebtWinRow = {
  id: number; amount: number; outcome: string; wonAt: string;
  court: string; caseNumber: string; plaintiff: string; note: string; createdBy: string;
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const OUTCOME_LABEL: Record<string, string> = { nonsuit: "Non-suited", judgment: "Judgment for the defendant", other: "Other win" };
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

/** Log won debt-defense cases and watch the marketing counter climb. */
export function DebtWinsManager({ rows, courts, plaintiffs }: { rows: DebtWinRow[]; courts: string[]; plaintiffs: string[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [outcome, setOutcome] = useState("nonsuit");
  const [wonAt, setWonAt] = useState(todayISO());
  const [court, setCourt] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const count = rows.length;
  const total = rows.reduce((s, r) => s + r.amount, 0);

  function add() {
    setError(null);
    start(async () => {
      const res = await addDebtWin({ amount: parseFloat(amount) || 0, outcome, wonAt, court, caseNumber, plaintiff, note });
      if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
      setAmount(""); setCourt(""); setCaseNumber(""); setPlaintiff(""); setNote(""); setWonAt(todayISO());
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
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

      {/* Log a win */}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck size={15} className="text-[var(--c-accent)]" /> Log a win</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Amount sued on ($)</span>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g., 8500" className={`${input} w-full`} />
          </label>
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
            <span className="mb-1 block text-[var(--c-ink-muted)]">How it was won</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={`${input} w-full`}>
              <option value="nonsuit">Non-suited</option>
              <option value="judgment">Judgment for the defendant</option>
              <option value="other">Other win</option>
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
        <button onClick={add} disabled={pending || !amount.trim()} className="btn btn-accent mt-3 text-sm disabled:opacity-50">
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
                <td className="px-3 py-2.5 whitespace-nowrap">{r.wonAt}</td>
                <td className="px-3 py-2.5 tabular-nums">{money(r.amount)}</td>
                <td className="px-3 py-2.5">{r.plaintiff || "—"}</td>
                <td className="px-3 py-2.5">{r.court || "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{r.caseNumber || "—"}</td>
                <td className="px-3 py-2.5">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</td>
                <td className="max-w-[16rem] px-3 py-2.5 text-xs text-[var(--c-ink-muted)]"><span title={r.note}>{r.note ? (r.note.length > 90 ? r.note.slice(0, 90) + "…" : r.note) : "—"}</span></td>
                <td className="px-3 py-2.5 text-xs text-[var(--c-ink-muted)]">{r.createdBy.split("@")[0]}</td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => { if (confirm(`Remove this ${money(r.amount)} win from the counter?`)) start(async () => { await deleteDebtWin(r.id); router.refresh(); }); }}
                    title="Remove (adjusts the counter)"
                    className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
