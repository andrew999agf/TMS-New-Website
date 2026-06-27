"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";
import { TEXAS_RULES_KEY, type TexasRule } from "@/lib/texas-rules";

function uid() {
  return `r-${Math.random().toString(36).slice(2, 9)}`;
}

export function TexasRulesManager({ initial }: { initial: TexasRule[] }) {
  const [rules, setRules] = useState<TexasRule[]>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (id: string, patch: Partial<TexasRule>) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => setRules((rs) => [...rs, { id: uid(), title: "", lastAmended: "" }]);
  const remove = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));
  const move = (i: number, d: number) =>
    setRules((rs) => {
      const a = [...rs];
      const j = i + d;
      if (j < 0 || j >= a.length) return rs;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  function save() {
    start(async () => {
      const clean = rules.filter((r) => r.title.trim());
      const res = await saveSetting(TEXAS_RULES_KEY, clean);
      if (res.ok) {
        setRules(clean);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  const input =
    "w-full rounded-lg border border-[color:var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30";
  const iconBtn = "rounded-md border border-[color:var(--color-line)] p-1.5 text-[color:var(--color-muted)] hover:bg-[var(--color-surface2)] disabled:opacity-40";

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-[color:var(--color-muted)]">
        This list is what appears on the public <b>Texas Rules</b> page. When a rule changes, update its{" "}
        <b>PDF link</b> and <b>last amended</b> date here — you&apos;ll get an email reminder every three months.
      </p>

      <div className="space-y-3">
        {rules.map((r, i) => (
          <div key={r.id} className="rounded-xl border border-[color:var(--color-line)] bg-[var(--color-surface)] p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={r.title} onChange={(e) => update(r.id, { title: e.target.value })} placeholder="Rule name" className={`${input} sm:col-span-2`} />
              <input value={r.lastAmended} onChange={(e) => update(r.id, { lastAmended: e.target.value })} placeholder="Last amended (e.g. March 1, 2026)" className={input} />
              <input value={r.sourceUrl ?? ""} onChange={(e) => update(r.id, { sourceUrl: e.target.value || undefined })} placeholder="txcourts.gov page (optional)" className={input} />
              <input value={r.pdfUrl ?? ""} onChange={(e) => update(r.id, { pdfUrl: e.target.value || undefined })} placeholder="Direct PDF download URL" className={`${input} sm:col-span-2`} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Move up"><ChevronUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rules.length - 1} className={iconBtn} aria-label="Move down"><ChevronDown size={14} /></button>
              <button type="button" onClick={() => remove(r.id)} className="ml-auto inline-flex items-center gap-1 text-xs text-[color:var(--color-error)] hover:underline">
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-sm font-medium text-[color:var(--color-ink)] hover:bg-[var(--color-surface2)]">
          <Plus size={15} /> Add rule
        </button>
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
