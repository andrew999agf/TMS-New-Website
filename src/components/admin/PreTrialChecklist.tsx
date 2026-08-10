"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, Pencil, CalendarClock, ListChecks, X, ChevronRight, UserRound, CornerDownRight } from "lucide-react";
import {
  TEMPLATES, nestDeadlines, urgencyOf, duePhrase, fmtDate,
  URGENCY_CLASS, URGENCY_LABEL, type Urgency,
} from "@/lib/pretrial/template";
import { addDeadline, updateDeadline, toggleDeadline, deleteDeadline, applyTemplate, shiftAllDeadlines, assignDeadline } from "@/app/admin/(panel)/pre-trial/actions";

export type DeadlineRow = { id: number; parentId: number | null; assignee: string; title: string; dueDate: string | null; done: boolean; doneAt: string | null; doneBy: string | null; notes: string; sort: number };
export type TeamMember = { name: string };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

export function PreTrialChecklist({ caseId, trialDate, pretrialDate, rows, team }: { caseId: number; trialDate: string | null; pretrialDate: string | null; rows: DeadlineRow[]; team: TeamMember[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [newTrial, setNewTrial] = useState(trialDate ?? "");

  const tree = useMemo(() => nestDeadlines(rows), [rows]);
  const openTree = tree.filter((t) => !(t.done && t.children.every((c) => c.done)));
  const doneTree = tree.filter((t) => t.done && t.children.every((c) => c.done));
  const openCount = rows.filter((r) => !r.done).length;
  const overdue = rows.filter((r) => !r.done && urgencyOf(r.dueDate) === "overdue").length;

  const run: Run = (fn) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  };

  function submitNew() {
    const t = newTitle.trim();
    if (!t) return;
    run(async () => {
      const r = await addDeadline(caseId, t, newDate || undefined);
      if (r.ok) { setNewTitle(""); setNewDate(""); setAdding(false); }
      return r;
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary + setup */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--c-ink)]"><ListChecks size={15} className="text-[var(--c-accent)]" /> {openCount} open</span>
        {overdue > 0 && <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600">{overdue} overdue</span>}
        <span className="text-[var(--c-ink-muted)]">{rows.length - openCount} completed</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={input} aria-label="Checklist template">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button onClick={() => run(() => applyTemplate(caseId, tpl))} disabled={pending} title="Add this template's deadlines. Items already on the list are skipped." className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50">
            <ListChecks size={14} /> Run setup
          </button>
        </div>
      </div>

      {/* Key settings */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Trial date</label>
          <input type="date" value={newTrial} onChange={(e) => setNewTrial(e.target.value)} className={input} />
        </div>
        <button onClick={() => run(() => shiftAllDeadlines(caseId, newTrial))} disabled={pending || !newTrial || newTrial === trialDate} title="Move the trial date and slide every dated deadline by the same number of days" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-xs hover:bg-[var(--c-surface2)] disabled:opacity-50">
          <CalendarClock size={14} /> {trialDate ? "Reset date & slide schedule" : "Set trial date"}
        </button>
        <div className="ml-auto flex flex-wrap gap-4 pb-1 text-xs">
          {pretrialDate && <span className="text-[var(--c-ink-muted)]">Pretrial: <span className="font-medium text-[var(--c-ink)]">{fmtDate(pretrialDate)}</span> · {duePhrase(pretrialDate)}</span>}
          {trialDate && <span className="text-[var(--c-ink-muted)]">Trial: <span className="font-medium text-[var(--c-ink)]">{fmtDate(trialDate)}</span> · {duePhrase(trialDate)}</span>}
        </div>
      </div>

      {!trialDate && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          No trial date set yet. Template items are added without dates — set the trial date above and the whole schedule fills in.
        </p>
      )}

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      {/* Tasks */}
      <div className="space-y-2">
        {openTree.length === 0 ? (
          <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
            Nothing outstanding. Use <strong>Run setup</strong> above to add a standard checklist, or add a task below.
          </p>
        ) : (
          openTree.map((t) => <TaskCard key={t.id} caseId={caseId} node={t} team={team} run={run} pending={pending} />)
        )}
      </div>

      {/* Add a top-level task */}
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Task</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }} placeholder="e.g. File motions in limine" autoFocus className={`${input} w-full`} />
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
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:bg-[var(--c-surface2)]"><Plus size={15} /> Add a task</button>
      )}

      {/* Completed */}
      {doneTree.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-semibold text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
            {showDone ? "Hide" : "Show"} {doneTree.length} completed task{doneTree.length === 1 ? "" : "s"}
          </button>
          {showDone && <div className="mt-2 space-y-2">{doneTree.map((t) => <TaskCard key={t.id} caseId={caseId} node={t} team={team} run={run} pending={pending} />)}</div>}
        </div>
      )}

      <p className="text-[11px] text-[var(--c-ink-muted)]">
        <Check size={11} className="inline" /> Templates are a starting point drawn from typical scheduling orders — always confirm every date against the court&apos;s actual scheduling order in the case.
      </p>
    </div>
  );
}

/** One overarching task, its assignee, and the sub-tasks under it. */
function TaskCard({ caseId, node, team, run, pending }: {
  caseId: number;
  node: DeadlineRow & { children: DeadlineRow[] };
  team: TeamMember[]; run: Run; pending: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subDate, setSubDate] = useState("");

  const kids = node.children;
  const doneKids = kids.filter((k) => k.done).length;
  const u = urgencyOf(node.dueDate) as Urgency;
  // A parent with no date of its own shows the most urgent thing beneath it.
  const childU = kids.filter((k) => !k.done).map((k) => urgencyOf(k.dueDate)).sort((a, b) => (a === "overdue" ? -1 : b === "overdue" ? 1 : 0))[0];
  const showU: Urgency = node.dueDate ? u : (childU as Urgency) ?? "none";

  function submitSub() {
    const t = subTitle.trim();
    if (!t) return;
    run(async () => {
      const r = await addDeadline(caseId, t, subDate || undefined, undefined, node.id);
      if (r.ok) { setSubTitle(""); setSubDate(""); setAddingSub(false); }
      return r;
    });
  }

  return (
    <div className={`overflow-hidden rounded-lg border bg-[var(--c-surface)] ${showU === "overdue" && !node.done ? "border-red-500/40" : "border-[var(--c-border)]"}`}>
      <div className={`flex flex-wrap items-center gap-2 p-3 ${showU === "overdue" && !node.done ? "bg-red-500/[0.04]" : ""}`}>
        {kids.length > 0 ? (
          <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[var(--c-ink-muted)]"><ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} /></button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <input type="checkbox" checked={node.done} onChange={() => run(() => toggleDeadline(node.id, !node.done))} disabled={pending} title={node.done ? "Reopen" : "Mark complete"} className="h-4 w-4 shrink-0 cursor-pointer" />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${node.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{node.title}</span>
          <span className="block text-xs text-[var(--c-ink-muted)]">
            {kids.length > 0 && <>{doneKids}/{kids.length} done · </>}
            {node.dueDate ? <>{fmtDate(node.dueDate)} · {duePhrase(node.dueDate)}</> : "No date"}
            {node.notes && <> · {node.notes}</>}
          </span>
        </span>
        <AssigneePicker id={node.id} value={node.assignee} team={team} run={run} pending={pending} />
        {(node.dueDate || childU) && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${URGENCY_CLASS[showU]}`}>{URGENCY_LABEL[showU]}</span>}
        <RowActions id={node.id} title={node.title} dueDate={node.dueDate} run={run} pending={pending} onAddSub={() => { setAddingSub(true); setOpen(true); }} />
      </div>

      {open && (kids.length > 0 || addingSub) && (
        <div className="border-t border-[var(--c-border)]">
          {kids.map((k) => <SubRow key={k.id} row={k} team={team} run={run} pending={pending} />)}
          {addingSub && (
            <div className="flex flex-wrap items-end gap-2 border-t border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 pl-10">
              <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSub(); } }} placeholder="Sub-task…" autoFocus className={`${input} min-w-[200px] flex-1`} />
              <input type="date" value={subDate} onChange={(e) => setSubDate(e.target.value)} className={input} />
              <button onClick={submitSub} disabled={pending || !subTitle.trim()} className="btn btn-accent text-xs py-1.5 px-3 disabled:opacity-50">Add</button>
              <button onClick={() => setAddingSub(false)} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
            </div>
          )}
        </div>
      )}

      {open && kids.length > 0 && !addingSub && (
        <button onClick={() => setAddingSub(true)} className="w-full border-t border-[var(--c-border)] px-3 py-1.5 pl-10 text-left text-[11px] text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-accent)]">
          <Plus size={11} className="inline" /> Add a sub-task
        </button>
      )}
    </div>
  );
}

function SubRow({ row, team, run, pending }: { row: DeadlineRow; team: TeamMember[]; run: Run; pending: boolean }) {
  const u = urgencyOf(row.dueDate) as Urgency;
  return (
    <div className={`flex flex-wrap items-center gap-2 border-t border-[var(--c-border)] py-2 pl-10 pr-3 first:border-t-0 ${u === "overdue" && !row.done ? "bg-red-500/[0.04]" : ""}`}>
      <CornerDownRight size={12} className="shrink-0 text-[var(--c-ink-muted)]/60" />
      <input type="checkbox" checked={row.done} onChange={() => run(() => toggleDeadline(row.id, !row.done))} disabled={pending} className="h-3.5 w-3.5 shrink-0 cursor-pointer" />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${row.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{row.title}</span>
        <span className="block text-[11px] text-[var(--c-ink-muted)]">
          {row.dueDate ? <>{fmtDate(row.dueDate)} · {duePhrase(row.dueDate)}</> : "No date"}
          {row.notes && <> · {row.notes}</>}
          {row.done && row.doneBy && <> · done by {row.doneBy}</>}
        </span>
      </span>
      <AssigneePicker id={row.id} value={row.assignee} team={team} run={run} pending={pending} />
      {row.dueDate && !row.done && <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${URGENCY_CLASS[u]}`}>{URGENCY_LABEL[u]}</span>}
      <RowActions id={row.id} title={row.title} dueDate={row.dueDate} run={run} pending={pending} />
    </div>
  );
}

/** Assign a task to a Time Tracker team member. */
function AssigneePicker({ id, value, team, run, pending }: { id: number; value: string; team: TeamMember[]; run: Run; pending: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <UserRound size={12} className={value ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)]/60"} />
      <select
        value={value}
        onChange={(e) => run(() => assignDeadline(id, e.target.value))}
        disabled={pending}
        title={value ? `Assigned to ${value}` : "Assign to a team member"}
        className={`max-w-[130px] rounded border px-1 py-0.5 text-[11px] outline-none ${value ? "border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 text-[var(--c-ink)]" : "border-[var(--c-border)] bg-transparent text-[var(--c-ink-muted)]"}`}
      >
        <option value="">Unassigned</option>
        {team.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        {value && !team.some((m) => m.name === value) && <option value={value}>{value}</option>}
      </select>
    </span>
  );
}

function RowActions({ id, title, dueDate, run, pending, onAddSub }: { id: number; title: string; dueDate: string | null; run: Run; pending: boolean; onAddSub?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);
  const [d, setD] = useState(dueDate ?? "");

  if (editing) {
    return (
      <span className="flex w-full flex-wrap items-center gap-2 pt-2">
        <input value={t} onChange={(e) => setT(e.target.value)} className={`${input} min-w-[180px] flex-1`} autoFocus />
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={input} />
        <button onClick={() => { if (t.trim()) run(async () => { const r = await updateDeadline(id, { title: t, dueDate: d || null }); if (r.ok) setEditing(false); return r; }); }} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3">Save</button>
        <button onClick={() => { setEditing(false); setT(title); setD(dueDate ?? ""); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center">
      {onAddSub && (
        <button onClick={onAddSub} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Add a sub-task"><Plus size={13} /></button>
      )}
      <button onClick={() => setEditing(true)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={13} /></button>
      <button onClick={() => { if (confirm(`Remove “${title}”${onAddSub ? " and its sub-tasks" : ""}?`)) run(() => deleteDeadline(id)); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
    </span>
  );
}
