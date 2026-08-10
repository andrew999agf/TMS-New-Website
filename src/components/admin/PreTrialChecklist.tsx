"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, Pencil, CalendarClock, CalendarPlus, ListChecks, X, ChevronRight, UserRound, CornerDownRight, Gavel } from "lucide-react";
import {
  TEMPLATES, nestDeadlines, urgencyOf, duePhrase, fmtDate,
  URGENCY_CLASS, URGENCY_LABEL, type Urgency,
} from "@/lib/pretrial/template";
import { addDeadline, updateDeadline, toggleDeadline, deleteDeadline, applyTemplate, shiftAllDeadlines, assignDeadline, setPretrialDate } from "@/app/admin/(panel)/pre-trial/actions";

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
      {/* The two dates that anchor everything — front and centre. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <KeyDateCard
          label="Pretrial conference"
          icon={<CalendarClock size={15} />}
          date={pretrialDate}
          pending={pending}
          onSave={(d) => run(() => setPretrialDate(caseId, d))}
          hint="Set the 166 & 248 hearing date"
        />
        <KeyDateCard
          label="Trial"
          icon={<Gavel size={15} />}
          date={trialDate}
          pending={pending}
          onSave={(d) => run(() => shiftAllDeadlines(caseId, d))}
          hint="Set the trial date"
          footnote="Changing this slides every dated deadline by the same number of days."
        />
      </div>

      {/* Progress + template setup */}
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

      {!trialDate && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          No trial date yet. Template items go in undated — set the trial date above and the whole schedule fills in.
        </p>
      )}

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      <div className="space-y-2">
        {openTree.length === 0 ? (
          <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
            Nothing outstanding. Use <strong>Run setup</strong> for a standard checklist, or add a deadline below.
          </p>
        ) : (
          openTree.map((t) => <TaskCard key={t.id} caseId={caseId} node={t} team={team} run={run} pending={pending} />)
        )}
      </div>

      {/* Add a top-level deadline */}
      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-dashed border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">New deadline</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }} placeholder="e.g. File motions in limine" autoFocus className={`${input} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">Due (optional)</label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={input} />
          </div>
          <button onClick={submitNew} disabled={pending || !newTitle.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-3 disabled:opacity-50">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add deadline
          </button>
          <button onClick={() => { setAdding(false); setNewTitle(""); setNewDate(""); }} className="rounded-md border border-[var(--c-border)] px-2 py-2 text-sm text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"><X size={14} /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--c-border)] px-3 py-2.5 text-sm font-medium text-[var(--c-ink-muted)] transition-colors hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
          <Plus size={16} /> Add a deadline
        </button>
      )}

      {doneTree.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-semibold text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
            {showDone ? "Hide" : "Show"} {doneTree.length} completed deadline{doneTree.length === 1 ? "" : "s"}
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

/** A big, obvious card for the pretrial and trial dates — click to set or change. */
function KeyDateCard({ label, icon, date, pending, onSave, hint, footnote }: {
  label: string; icon: React.ReactNode; date: string | null; pending: boolean;
  onSave: (d: string) => void; hint: string; footnote?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(date ?? "");
  const u = urgencyOf(date) as Urgency;
  const tone = date ? URGENCY_CLASS[u] : "border-dashed border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-ink-muted)]";

  if (editing) {
    return (
      <div className="rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={v} autoFocus onChange={(e) => setV(e.target.value)} className={input} />
          <button onClick={() => { if (v) onSave(v); setEditing(false); }} disabled={pending || !v} className="btn btn-accent text-xs py-1.5 px-3 disabled:opacity-50">Save</button>
          <button onClick={() => { setEditing(false); setV(date ?? ""); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
        </div>
        {footnote && <p className="mt-1.5 text-[11px] text-[var(--c-ink-muted)]">{footnote}</p>}
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} title={date ? `Change the ${label.toLowerCase()} date` : hint} className={`rounded-lg border p-3 text-left transition-colors hover:brightness-105 ${tone}`}>
      <p className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-80">{icon} {label}</p>
      {date ? (
        <>
          <p className="text-lg font-bold leading-tight">{fmtDate(date)}</p>
          <p className="text-xs font-medium opacity-90">{duePhrase(date)}</p>
        </>
      ) : (
        <p className="inline-flex items-center gap-1.5 py-1 text-sm font-medium"><CalendarPlus size={15} /> {hint}</p>
      )}
    </button>
  );
}

/** One deadline, its assignee, and the sub-deadlines under it. */
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
  const openKidU = kids.filter((k) => !k.done).map((k) => urgencyOf(k.dueDate));
  const hotChild = openKidU.includes("overdue");
  const alarming = !node.done && (urgencyOf(node.dueDate) === "overdue" || hotChild);

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
    <div className={`overflow-hidden rounded-lg border bg-[var(--c-surface)] ${alarming ? "border-red-500/40" : "border-[var(--c-border)]"}`}>
      <div className={`flex flex-wrap items-center gap-2 p-3 ${alarming ? "bg-red-500/[0.04]" : ""}`}>
        {kids.length > 0 ? (
          <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[var(--c-ink-muted)]" title={open ? "Collapse" : "Expand"}><ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} /></button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <input type="checkbox" checked={node.done} onChange={() => run(() => toggleDeadline(node.id, !node.done))} disabled={pending} title={node.done ? "Reopen" : "Mark complete"} className="h-4 w-4 shrink-0 cursor-pointer" />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${node.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{node.title}</span>
          {(kids.length > 0 || node.notes) && (
            <span className="block text-xs text-[var(--c-ink-muted)]">
              {kids.length > 0 && <>{doneKids}/{kids.length} sub-deadlines done{node.notes ? " · " : ""}</>}
              {node.notes}
            </span>
          )}
        </span>
        <AssigneePicker id={node.id} value={node.assignee} team={team} run={run} pending={pending} />
        <DateChip id={node.id} date={node.dueDate} done={node.done} run={run} pending={pending} />
        <RowActions id={node.id} title={node.title} hasKids run={run} pending={pending} />
      </div>

      {open && (
        <div className="border-t border-[var(--c-border)] bg-[var(--c-bg)]/40">
          {kids.map((k) => <SubRow key={k.id} row={k} team={team} run={run} pending={pending} />)}

          {addingSub ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-[var(--c-border)] p-2.5 pl-10">
              <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSub(); } }} placeholder="Sub-deadline…" autoFocus className={`${input} min-w-[200px] flex-1`} />
              <input type="date" value={subDate} onChange={(e) => setSubDate(e.target.value)} className={input} />
              <button onClick={submitSub} disabled={pending || !subTitle.trim()} className="btn btn-accent text-xs py-1.5 px-3 disabled:opacity-50">Add</button>
              <button onClick={() => { setAddingSub(false); setSubTitle(""); setSubDate(""); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
            </div>
          ) : (
            // Always visible, on every card — the way sub-deadlines get created.
            <button onClick={() => setAddingSub(true)} className="flex w-full items-center gap-1.5 border-t border-[var(--c-border)] px-3 py-2 pl-10 text-left text-xs font-medium text-[var(--c-ink-muted)] transition-colors hover:bg-[var(--c-surface2)] hover:text-[var(--c-accent)]">
              <Plus size={13} /> Add a sub-deadline
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SubRow({ row, team, run, pending }: { row: DeadlineRow; team: TeamMember[]; run: Run; pending: boolean }) {
  const u = urgencyOf(row.dueDate);
  return (
    <div className={`flex flex-wrap items-center gap-2 border-t border-[var(--c-border)] py-2 pl-10 pr-3 first:border-t-0 ${u === "overdue" && !row.done ? "bg-red-500/[0.05]" : ""}`}>
      <CornerDownRight size={12} className="shrink-0 text-[var(--c-ink-muted)]/60" />
      <input type="checkbox" checked={row.done} onChange={() => run(() => toggleDeadline(row.id, !row.done))} disabled={pending} className="h-3.5 w-3.5 shrink-0 cursor-pointer" />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${row.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{row.title}</span>
        {(row.notes || (row.done && row.doneBy)) && (
          <span className="block text-[11px] text-[var(--c-ink-muted)]">
            {row.notes}
            {row.done && row.doneBy && <>{row.notes ? " · " : ""}done by {row.doneBy}</>}
          </span>
        )}
      </span>
      <AssigneePicker id={row.id} value={row.assignee} team={team} run={run} pending={pending} compact />
      <DateChip id={row.id} date={row.dueDate} done={row.done} run={run} pending={pending} compact />
      <RowActions id={row.id} title={row.title} run={run} pending={pending} />
    </div>
  );
}

/**
 * The date control: one click opens the picker. Shows the due date colour-coded
 * by urgency, or a clear "Set date" affordance when there isn't one — no pencil
 * needed.
 */
function DateChip({ id, date, done, run, pending, compact }: { id: number; date: string | null; done: boolean; run: Run; pending: boolean; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const u = urgencyOf(date) as Urgency;

  if (editing) {
    return (
      <input
        type="date"
        defaultValue={date ?? ""}
        autoFocus
        disabled={pending}
        onChange={(e) => { run(() => updateDeadline(id, { dueDate: e.target.value || null })); setEditing(false); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        className="shrink-0 rounded-md border border-[var(--c-accent)] bg-[var(--c-bg)] px-2 py-1 text-xs outline-none"
      />
    );
  }

  const size = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  if (!date) {
    return (
      <button onClick={() => setEditing(true)} title="Set a due date" className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--c-border)] font-medium text-[var(--c-ink-muted)] transition-colors hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] ${size}`}>
        <CalendarPlus size={compact ? 11 : 12} /> Set date
      </button>
    );
  }
  return (
    <button onClick={() => setEditing(true)} title="Change the due date" className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold transition-opacity hover:opacity-80 ${URGENCY_CLASS[u]} ${size} ${done ? "opacity-60" : ""}`}>
      {fmtDate(date)}
      {!done && <span className="font-normal opacity-80">· {URGENCY_LABEL[u]}</span>}
    </button>
  );
}

/** Assign a deadline to a Time Tracker team member. */
function AssigneePicker({ id, value, team, run, pending, compact }: { id: number; value: string; team: TeamMember[]; run: Run; pending: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <UserRound size={compact ? 11 : 12} className={value ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)]/60"} />
      <select
        value={value}
        onChange={(e) => run(() => assignDeadline(id, e.target.value))}
        disabled={pending}
        title={value ? `Assigned to ${value}` : "Assign to a team member"}
        className={`max-w-[128px] rounded border px-1 py-0.5 outline-none ${compact ? "text-[10px]" : "text-[11px]"} ${value ? "border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 text-[var(--c-ink)]" : "border-[var(--c-border)] bg-transparent text-[var(--c-ink-muted)]"}`}
      >
        <option value="">Unassigned</option>
        {team.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        {value && !team.some((m) => m.name === value) && <option value={value}>{value}</option>}
      </select>
    </span>
  );
}

/** Rename and delete. The date and assignee are edited directly on the row. */
function RowActions({ id, title, hasKids, run, pending }: { id: number; title: string; hasKids?: boolean; run: Run; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);

  if (editing) {
    return (
      <span className="flex w-full flex-wrap items-center gap-2 pt-2">
        <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (t.trim()) run(async () => { const r = await updateDeadline(id, { title: t }); if (r.ok) setEditing(false); return r; }); } }} className={`${input} min-w-[180px] flex-1`} autoFocus />
        <button onClick={() => { if (t.trim()) run(async () => { const r = await updateDeadline(id, { title: t }); if (r.ok) setEditing(false); return r; }); }} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3">Save</button>
        <button onClick={() => { setEditing(false); setT(title); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center">
      <button onClick={() => setEditing(true)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename"><Pencil size={13} /></button>
      <button onClick={() => { if (confirm(`Remove “${title}”${hasKids ? " and its sub-deadlines" : ""}?`)) run(() => deleteDeadline(id)); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
    </span>
  );
}
