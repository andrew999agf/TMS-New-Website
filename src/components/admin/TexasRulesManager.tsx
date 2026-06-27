"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  FileDown,
  ExternalLink,
} from "lucide-react";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";
import { TEXAS_RULES_KEY, type TexasRule } from "@/lib/texas-rules";

function uid() {
  return `r-${Math.random().toString(36).slice(2, 9)}`;
}

export function TexasRulesManager({ initial }: { initial: TexasRule[] }) {
  const [rules, setRules] = useState<TexasRule[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (id: string, patch: Partial<TexasRule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    const id = uid();
    setRules((rs) => [...rs, { id, title: "", lastAmended: "" }]);
    setEditing(id);
  };
  const remove = (id: string) => {
    setRules((rs) => rs.filter((r) => r.id !== id));
    setEditing((e) => (e === id ? null : e));
  };
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
        setEditing(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  const input =
    "w-full rounded-lg border border-[color:var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30";
  const iconBtn =
    "rounded-md border border-[color:var(--color-line)] p-1.5 text-[color:var(--color-muted)] hover:bg-[var(--color-surface2)] disabled:opacity-40";

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-[color:var(--color-muted)]">
        This list is what appears on the public <b>Texas Rules</b> page. Click a rule&apos;s links to open
        them, or the <Pencil size={13} className="inline -mt-0.5" aria-label="edit" /> pencil to change its
        name, date, or links — you&apos;ll also get an email reminder every three months.
      </p>

      <div className="space-y-2.5">
        {rules.map((r, i) =>
          editing === r.id ? (
            /* ---- Edit mode ---- */
            <div
              key={r.id}
              className="rounded-xl border border-[color:var(--color-accent)] bg-[var(--color-surface)] p-4 shadow-sm"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={r.title}
                  onChange={(e) => update(r.id, { title: e.target.value })}
                  placeholder="Rule name"
                  autoFocus
                  className={`${input} sm:col-span-2`}
                />
                <input
                  value={r.lastAmended}
                  onChange={(e) => update(r.id, { lastAmended: e.target.value })}
                  placeholder="Last amended (e.g. March 1, 2026)"
                  className={input}
                />
                <input
                  value={r.sourceUrl ?? ""}
                  onChange={(e) => update(r.id, { sourceUrl: e.target.value || undefined })}
                  placeholder="txcourts.gov page (optional)"
                  className={input}
                />
                <input
                  value={r.pdfUrl ?? ""}
                  onChange={(e) => update(r.id, { pdfUrl: e.target.value || undefined })}
                  placeholder="Direct PDF download URL"
                  className={`${input} sm:col-span-2`}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className={iconBtn}
                  aria-label="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rules.length - 1}
                  className={iconBtn}
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="inline-flex items-center gap-1 text-xs text-[color:var(--color-error)] hover:underline"
                >
                  <Trash2 size={13} /> Remove
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ink)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-paper)] hover:opacity-90"
                >
                  <Check size={14} /> Done
                </button>
              </div>
            </div>
          ) : (
            /* ---- View mode ---- */
            <div
              key={r.id}
              className="group flex items-center gap-4 rounded-xl border border-[color:var(--color-line)] bg-[var(--color-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[color:var(--color-ink)]">
                  {r.title || <span className="italic text-[color:var(--color-muted)]">Untitled rule</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--color-muted)]">
                  {r.lastAmended && <span>Last amended {r.lastAmended}</span>}
                  {r.pdfUrl && (
                    <a
                      href={r.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[color:var(--color-accent)] hover:underline"
                    >
                      <FileDown size={12} /> PDF
                    </a>
                  )}
                  {r.sourceUrl && (
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[color:var(--color-accent)] hover:underline"
                    >
                      <ExternalLink size={12} /> txcourts.gov
                    </a>
                  )}
                  {!r.pdfUrl && !r.sourceUrl && <span className="italic">No links yet</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(r.id)}
                className="shrink-0 rounded-md border border-[color:var(--color-line)] p-2 text-[color:var(--color-muted)] hover:bg-[var(--color-surface2)] hover:text-[color:var(--color-ink)]"
                aria-label={`Edit ${r.title || "rule"}`}
                title="Edit"
              >
                <Pencil size={15} />
              </button>
            </div>
          ),
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-sm font-medium text-[color:var(--color-ink)] hover:bg-[var(--color-surface2)]"
        >
          <Plus size={15} /> Add rule
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
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
