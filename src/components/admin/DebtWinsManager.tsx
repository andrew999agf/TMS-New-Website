"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, Loader2, Trash2 } from "lucide-react";
import { addDebtWin, deleteDebtWin } from "@/app/admin/(panel)/debt-wins/actions";

export type DebtWinRow = { id: number; amount: number; outcome: string; wonAt: string; note: string; createdBy: string };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const OUTCOME_LABEL: Record<string, string> = { nonsuit: "Non-suited", judgment: "Judgment for the defendant", other: "Other win" };
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** Log won debt-defense cases and watch the marketing counter climb. */
export function DebtWinsManager({ rows }: { rows: DebtWinRow[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [outcome, setOutcome] = useState("nonsuit");
  const [wonAt, setWonAt] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const count = rows.length;
  const total = rows.reduce((s, r) => s + r.amount, 0);

  function add() {
    setError(null);
    start(async () => {
      const res = await addDebtWin({ amount: parseFloat(amount) || 0, outcome, wonAt, note });
      if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
      setAmount(""); setNote(""); setWonAt(todayISO());
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
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
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Case note <span className="opacity-70">(internal only — e.g., cause no. or client)</span></span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={`${input} w-full`} />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
        <button onClick={add} disabled={pending || !amount.trim()} className="btn btn-accent mt-3 text-sm disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add to the counter
        </button>
      </div>

      {/* History */}
      <div className="rounded-lg border border-[var(--c-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--c-surface2)] text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Outcome</th>
              <th className="px-4 py-2.5 font-medium">Note</th>
              <th className="px-4 py-2.5 font-medium">By</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-border)]">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--c-ink-muted)]">No wins logged yet — the first one starts the counter.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="bg-[var(--c-surface)]">
                <td className="px-4 py-2.5 whitespace-nowrap">{r.wonAt}</td>
                <td className="px-4 py-2.5 tabular-nums">{money(r.amount)}</td>
                <td className="px-4 py-2.5">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</td>
                <td className="px-4 py-2.5 text-[var(--c-ink-muted)]">{r.note || "—"}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--c-ink-muted)]">{r.createdBy.split("@")[0]}</td>
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
