"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, DollarSign } from "lucide-react";
import { saveBlocks } from "@/app/admin/(panel)/pages/actions";

type Rates = { attorneyRate: number; associateRate: number; staffRate: number };

/**
 * The firm's standard hourly rates for engagement letters. When a letter is
 * drafted below one of these, the letter prints the standard rate struck
 * through, then the reduced rate — no commentary needed.
 */
export function EngagementDefaults({ initial }: { initial: Rates }) {
  const router = useRouter();
  const [rates, setRates] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "w-28 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

  function save() {
    setError(null);
    start(async () => {
      const r = await saveBlocks([
        { key: "engagement.rate.attorney", value: String(rates.attorneyRate || "") },
        { key: "engagement.rate.associate", value: String(rates.associateRate || "") },
        { key: "engagement.rate.staff", value: String(rates.staffRate || "") },
      ]);
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); router.refresh(); }
      else setError(r.error ?? "Save failed.");
    });
  }

  const set = (k: keyof Rates, v: string) => { setRates((r) => ({ ...r, [k]: parseFloat(v) || 0 })); setSaved(false); };

  return (
    <details className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
        <DollarSign size={15} className="text-[var(--c-accent)]" /> Standard hourly rates (engagement letters)
        <span className="ml-auto text-xs font-normal text-[var(--c-ink-muted)]">
          ${rates.attorneyRate} / ${rates.associateRate} / ${rates.staffRate}
        </span>
      </summary>
      <div className="border-t border-[var(--c-border)] p-4">
        <p className="mb-3 text-xs text-[var(--c-ink-muted)]">
          When an engagement letter is drafted <b>below</b> one of these rates, the letter prints the standard rate struck through, then the reduced rate — the client sees the break without a word about it.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs text-[var(--c-ink-muted)]">Attorney ($/hr)
            <input type="number" step="5" className={`${input} mt-1 block`} value={rates.attorneyRate} onChange={(e) => set("attorneyRate", e.target.value)} />
          </label>
          <label className="text-xs text-[var(--c-ink-muted)]">Associates / contract ($/hr)
            <input type="number" step="5" className={`${input} mt-1 block`} value={rates.associateRate} onChange={(e) => set("associateRate", e.target.value)} />
          </label>
          <label className="text-xs text-[var(--c-ink-muted)]">Staff / clerical ($/hr)
            <input type="number" step="5" className={`${input} mt-1 block`} value={rates.staffRate} onChange={(e) => set("staffRate", e.target.value)} />
          </label>
          <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">Save</button>
          {saved && <span className="flex items-center gap-1 text-sm text-[var(--c-success)]"><Check size={14} /> Saved</span>}
          {error && <span className="text-sm text-[var(--c-error)]">{error}</span>}
        </div>
      </div>
    </details>
  );
}
