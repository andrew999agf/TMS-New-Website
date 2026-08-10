"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, Pencil, CalendarClock, ListChecks, X } from "lucide-react";
import {
  TEMPLATES, sortDeadlines, urgencyOf, duePhrase, fmtDate, daysUntil,
  URGENCY_CLASS, URGENCY_LABEL, type Urgency,
} from "@/lib/pretrial/template";
import { addDeadline, updateDeadline, toggleDeadline, deleteDeadline, applyTemplate, shiftAllDeadlines } from "@/app/admin/(panel)/pre-trial/actions";

export type DeadlineRow = { id: number; title: string; dueDate: string | null; done: boolean; doneAt: string | null; doneBy: string | null; notes: string; sort: number };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

export function PreTrialChecklist({ caseId, trialDate, rows }: { caseId: number; trialDate: string | null; rows: DeadlineRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [newTrial, setNewTrial] = useState(trialDate ?? "");

  const sorted = useMemo(() => sortDeadlines(rows), [rows]);
  const open = sorted.filter((r) => !r.done);
  const done = sorted.filter((r) => r.done);
  const overdue = open.filter((r) => urgencyOf(r.dueDate) === "overdue").length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  function submitNew() {
    const t = newTitle.trim();
    if (!t) return;
    run(async () => {
      const r = await addDeadline(caseId, t, newDate || undefined);
      if (r.ok) { setNewTitle(""); setNewDate(""); setAdding(false); }
      return r;
    });
  }

  function saveEdit(id: number) {
    const t = editTitle.trim();
    if (!t) return;
    run(async () => {
      const r = await updateDeadline(id, { title: t, dueDate: editDate || null });
      if (r.ok) setEditing(null);
      return r;
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary + setup */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--c-ink)]"><ListChecks size={15} className="text-[var(--c-accent)]" /> {open.length} open</span>
        {overdue > 0 && <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600">{overdue} overdue</span>}
        <span className="text-[var(--c-ink-muted)]">{done.length} completed</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={input} aria-label="Checklist template">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button
            onClick={() => run(() => applyTemplate(caseId, tpl))}
            disabled={pending}
            title="Add this template's deadlines. Items already on the list are skipped."
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50"
          >
            <ListChecks size={14} /> Run setup
          </button>
        </div>
      </div>

      {!trialDate && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          No trial date set yet. Template items are added without dates — set the trial date below and the whole schedule fills in.
        </p>
      )}

      {/* Trial date / slide the schedule */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Trial date</label>
          <input type="date" value={newTrial} onChange={(e) => setNewTrial(e.target.value)} className={input} />
        </div>
        <button
          onClick={() => run(() => shiftAllDeadlines(caseId, newTrial))}
          disabled={pending || !newTrial || newTrial === trialDate}
          title="Move the trial date and slide every dated deadline by the same number of days"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50"
        >
          <CalendarClock size={14} /> {trialDate ? "Reset date & slide schedule" : "Set trial date"}
        </button>
        {trialDate && (
          <span className="pb-1.5 text-xs text-[var(--c-ink-muted)]">
            Currently {fmtDate(trialDate)} · {duePhrase(trialDate)}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      {/* Open items, most urgent first */}
      <div className="overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
        {open.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--c-ink-muted)]">
            Nothing outstanding. Use <strong>Run setup</strong> above to add a standard checklist, or add a deadline below.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--c-border)]">
            {open.map((d) => {
              const u = urgencyOf(d.dueDate);
              const days = daysUntil(d.dueDate);
              return (
                <li key={d.id} className={`flex flex-wrap items-center gap-3 p-3 ${u === "overdue" ? "bg-red-500/[0.04]" : ""}`}>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => run(() => toggleDeadline(d.id, true))}
                    disabled={pending}
                    title="Mark complete"
                    className="h-4 w-4 shrink-0 cursor-pointer"
                  />
                  {editing === d.id ? (
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={`${input} min-w-0 flex-1`} autoFocus />
                      <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={input} />
                      <button onClick={() => saveEdit(d.id)} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3 disabled:opacity-50">Save</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{d.title}</span>
                        <span className="block text-xs text-[var(--c-ink-muted)]">
                          {fmtDate(d.dueDate)}
                          {days !== null && <> · {duePhrase(d.dueDate)}</>}
                          {d.notes && <> · {d.notes}</>}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${URGENCY_CLASS[u as Urgency]}`}>
                        {URGENCY_LABEL[u as Urgency]}
                      </span>
                      <button
                        onClick={() => { setEditing(d.id); setEditTitle(d.title); setEditDate(d.dueDate ?? ""); }}
                        className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
                        title="Edit this deadline"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove “${d.title}” from the checklist?`)) run(() => deleteDeadline(d.id)); }}
                        className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add a deadline */}
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Deadline</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }}
              placeholder="e.g. File motions in limine"
              autoFocus
              className={`${input} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Due</label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={input} />
          </div>
          <button onClick={submitNew} disabled={pending || !newTitle.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-3 disabled:opacity-50">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
          <button onClick={() => { setAdding(false); setNewTitle(""); setNewDate(""); }} className="rounded-md border border-[var(--c-border)] px-2 py-2 text-sm text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"><X size={14} /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:bg-[var(--c-surface2)]">
          <Plus size={15} /> Add a deadline
        </button>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-semibold text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
            {showDone ? "Hide" : "Show"} {done.length} completed item{done.length === 1 ? "" : "s"}
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
              {done.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 opacity-70">
                  <input type="checkbox" checked onChange={() => run(() => toggleDeadline(d.id, false))} title="Reopen" className="h-4 w-4 shrink-0 cursor-pointer" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm line-through">{d.title}</span>
                    <span className="block text-xs text-[var(--c-ink-muted)]">
                      {fmtDate(d.dueDate)}
                      {d.doneBy && <> · completed by {d.doneBy}</>}
                      {d.doneAt && <> on {new Date(d.doneAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>}
                    </span>
                  </span>
                  <button onClick={() => run(() => toggleDeadline(d.id, false))} className="shrink-0 rounded border border-[var(--c-border)] px-2 py-1 text-[11px] hover:bg-[var(--c-surface2)]">Reopen</button>
                  <button onClick={() => { if (confirm(`Remove “${d.title}”?`)) run(() => deleteDeadline(d.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-[var(--c-ink-muted)]">
        <Check size={11} className="inline" /> Templates are a starting point drawn from typical scheduling orders — always confirm every date against the court&apos;s actual scheduling order in the case.
      </p>
    </div>
  );
}
