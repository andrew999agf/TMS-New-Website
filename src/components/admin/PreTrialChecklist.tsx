"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, Pencil, CalendarClock, CalendarPlus, ListChecks, X, ChevronRight, UserRound, UserPlus, CornerDownRight, Gavel, Clock, StickyNote } from "lucide-react";
import {
  TEMPLATES, nestDeadlines, urgencyOf, duePhrase, fmtDate,
  URGENCY_CLASS, URGENCY_LABEL, DONE_CLASS, type Urgency,
} from "@/lib/pretrial/template";
import { addDeadline, updateDeadline, toggleDeadline, deleteDeadline, applyTemplate, shiftAllDeadlines, assignDeadline, setPretrialDate, timeEntryDefaults, completeWithTime, setDeadlineDoneBy } from "@/app/admin/(panel)/pre-trial/actions";
import { PopMenu, PopMenuItem } from "./PopMenu";
import { MatterPicker, type MatterOption } from "./MatterPicker";
import { cleanMatterCode, buildActivityNote } from "@/lib/time-entry";

export type DeadlineRow = { id: number; parentId: number | null; assignee: string; title: string; dueDate: string | null; done: boolean; doneAt: string | null; doneBy: string | null; notes: string; sort: number };
export type TeamMember = { name: string };

/** "Aug 10" — the day something was ticked off. */
const fmtStamp = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

export function PreTrialChecklist({ caseId, trialDate, pretrialDate, rows, team, categories, caseMatter, matters }: { caseId: number; trialDate: string | null; pretrialDate: string | null; rows: DeadlineRow[]; team: TeamMember[]; categories: string[]; caseMatter: string; matters: MatterOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Completed items stay visible by default so the list reads as a record of
  // what's been done, not just what's left. Still collapsible.
  const [showDone, setShowDone] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  // When a task is checked off we ask whether to log time for it.
  const [timeFor, setTimeFor] = useState<{ id: number; title: string; who: string } | null>(null);

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
          openTree.map((t) => <TaskCard key={t.id} caseId={caseId} node={t} team={team} run={run} pending={pending} onCompleted={(id, title, who) => setTimeFor({ id, title, who })} />)
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
        <div className="pt-2">
          <button
            onClick={() => setShowDone((s) => !s)}
            aria-expanded={showDone}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--c-ink)] transition-colors hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check size={13} /></span>
            {doneTree.length} completed deadline{doneTree.length === 1 ? "" : "s"}
            <ChevronRight size={15} className={`transition-transform ${showDone ? "rotate-90" : ""}`} />
          </button>
          {showDone && <div className="mt-3 space-y-2 opacity-90">{doneTree.map((t) => <TaskCard key={t.id} caseId={caseId} node={t} team={team} run={run} pending={pending} onCompleted={(id, title, who) => setTimeFor({ id, title, who })} />)}</div>}
        </div>
      )}

      <p className="text-[11px] text-[var(--c-ink-muted)]">
        <Check size={11} className="inline" /> Templates are a starting point drawn from typical scheduling orders — always confirm every date against the court&apos;s actual scheduling order in the case.
      </p>

      {timeFor && (
        <LogTimeDialog
          deadlineId={timeFor.id}
          title={timeFor.title}
          team={team}
          defaultWho={timeFor.who}
          categories={categories}
          fallbackMatter={caseMatter}
          matters={matters}
          onClose={() => { setTimeFor(null); router.refresh(); }}
        />
      )}
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
function TaskCard({ caseId, node, team, run, pending, onCompleted }: {
  caseId: number;
  node: DeadlineRow & { children: DeadlineRow[] };
  team: TeamMember[]; run: Run; pending: boolean;
  onCompleted: (id: number, title: string, who: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
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
        <input
          type="checkbox"
          checked={node.done}
          onChange={() => { const next = !node.done; run(() => toggleDeadline(node.id, next)); if (next) onCompleted(node.id, node.title, node.assignee); }}
          disabled={pending}
          title={node.done ? "Reopen" : "Mark complete"}
          className="h-4 w-4 shrink-0 cursor-pointer"
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${node.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{node.title}</span>
          {kids.length > 0 && (
            <span className="block text-xs text-[var(--c-ink-muted)]">{doneKids}/{kids.length} sub-deadlines done</span>
          )}
        </span>
        <AssigneePicker id={node.id} value={node.assignee} team={team} run={run} pending={pending} />
        <DateChip id={node.id} date={node.dueDate} done={node.done} doneAt={node.doneAt} doneBy={node.doneBy} run={run} pending={pending} />
        <RowActions id={node.id} title={node.title} hasKids hasNote={!!node.notes} onNote={() => setNoteOpen((v) => !v)} run={run} pending={pending} />
      </div>

      <NoteBlock id={node.id} notes={node.notes} open={noteOpen} onClose={() => setNoteOpen(false)} run={run} pending={pending} indent="ml-10" />

      {open && (
        <div className="border-t border-[var(--c-border)] bg-[var(--c-bg)]/40">
          {kids.map((k) => <SubRow key={k.id} row={k} team={team} run={run} pending={pending} onCompleted={onCompleted} />)}

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

function SubRow({ row, team, run, pending, onCompleted }: { row: DeadlineRow; team: TeamMember[]; run: Run; pending: boolean; onCompleted: (id: number, title: string, who: string) => void }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const u = urgencyOf(row.dueDate);
  return (
    <div className={`border-t border-[var(--c-border)] first:border-t-0 ${u === "overdue" && !row.done ? "bg-red-500/[0.05]" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 py-2 pl-10 pr-3">
      <CornerDownRight size={12} className="shrink-0 text-[var(--c-ink-muted)]/60" />
      <input
        type="checkbox"
        checked={row.done}
        onChange={() => { const next = !row.done; run(() => toggleDeadline(row.id, next)); if (next) onCompleted(row.id, row.title, row.assignee); }}
        disabled={pending}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer"
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${row.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{row.title}</span>
        {row.done && row.doneBy && (
          <span className="block text-[11px] text-[var(--c-ink-muted)]">done by {row.doneBy}</span>
        )}
      </span>
      <AssigneePicker id={row.id} value={row.assignee} team={team} run={run} pending={pending} compact />
      <DateChip id={row.id} date={row.dueDate} done={row.done} doneAt={row.doneAt} doneBy={row.doneBy} run={run} pending={pending} compact />
      <RowActions id={row.id} title={row.title} hasNote={!!row.notes} onNote={() => setNoteOpen((v) => !v)} run={run} pending={pending} />
      </div>
      <NoteBlock id={row.id} notes={row.notes} open={noteOpen} onClose={() => setNoteOpen(false)} run={run} pending={pending} indent="ml-[3.75rem]" />
    </div>
  );
}

/**
 * A little notepad tucked under the item. A saved note always shows, so it reads
 * in the list without opening anything; the notepad button turns it into a
 * textarea for editing.
 */
function NoteBlock({ id, notes, open, onClose, run, pending, indent }: {
  id: number; notes: string; open: boolean; onClose: () => void; run: Run; pending: boolean; indent: string;
}) {
  const [draft, setDraft] = useState(notes);
  useEffect(() => { if (open) setDraft(notes); }, [open, notes]);

  if (!open && !notes.trim()) return null;

  const shell = `${indent} mb-2 mr-3 rounded-md border-l-[3px] border-amber-400/70 bg-amber-100/50 px-2.5 py-1.5 dark:bg-amber-500/[0.08]`;

  if (!open) {
    return (
      <div className={shell}>
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--c-ink)]">{notes}</p>
      </div>
    );
  }

  const save = (value: string) => { run(() => updateDeadline(id, { notes: value })); onClose(); };
  return (
    <div className={shell}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(notes); onClose(); }
          // Enter saves; Shift+Enter keeps a multi-line note going.
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(draft); }
        }}
        rows={2}
        autoFocus
        placeholder="Add a note…"
        className="w-full resize-y rounded border border-amber-400/40 bg-[var(--c-bg)] px-2 py-1 text-[11px] leading-relaxed outline-none focus:border-amber-500"
      />
      <div className="mt-1 flex items-center gap-2">
        <button onClick={() => save(draft)} disabled={pending} className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-500/30 disabled:opacity-50 dark:text-amber-300">Save note</button>
        <button onClick={() => { setDraft(notes); onClose(); }} className="text-[10px] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
        {notes.trim() && (
          <button onClick={() => save("")} className="ml-auto text-[10px] text-[var(--c-ink-muted)] hover:text-red-600">Delete note</button>
        )}
      </div>
    </div>
  );
}

/**
 * The date control: one click opens the picker. Shows the due date colour-coded
 * by urgency, or a clear "Set date" affordance when there isn't one — no pencil
 * needed.
 */
function DateChip({ id, date, done, doneAt, doneBy, run, pending, compact }: { id: number; date: string | null; done: boolean; doneAt?: string | null; doneBy?: string | null; run: Run; pending: boolean; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(date ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const u = urgencyOf(date) as Urgency;

  const cancelPending = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => cancelPending, []);

  function save(value: string) {
    cancelPending();
    if ((value || null) !== (date || null)) run(() => updateDeadline(id, { dueDate: value || null }));
  }

  if (editing) {
    return (
      <input
        type="date"
        value={draft}
        autoFocus
        disabled={pending}
        /*
         * A native date input fires `change` on every segment edit the moment the
         * three parts happen to form a real date. Committing there closed the
         * field mid-entry: typing a year passed through 0002, and re-typing the
         * month or day on an existing date produced a valid date on the very
         * first digit. So we never commit straight from `change` — we hold the
         * draft, save it shortly after typing stops, and leave the field open so
         * the remaining segments can still be edited. Blur and Enter save at
         * once, which also covers picking from the calendar and clicking away.
         */
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          cancelPending();
          timer.current = setTimeout(() => save(v), 900);
        }}
        onBlur={(e) => { save(e.target.value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save((e.target as HTMLInputElement).value); setEditing(false); }
          if (e.key === "Escape") { cancelPending(); setDraft(date ?? ""); setEditing(false); }
        }}
        className="shrink-0 rounded-md border border-[var(--c-accent)] bg-[var(--c-bg)] px-2 py-1 text-xs outline-none"
      />
    );
  }

  const size = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  // Once it's done, the deadline stops mattering — show when it was finished.
  if (done) {
    return (
      <button
        onClick={() => { setDraft(date ?? ""); setEditing(true); }}
        title={doneAt ? `Completed ${fmtStamp(doneAt)}${doneBy ? ` by ${doneBy}` : ""}` : "Completed"}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold ${DONE_CLASS} ${size}`}
      >
        <Check size={compact ? 10 : 11} /> Done{doneAt ? ` ${fmtStamp(doneAt)}` : ""}
      </button>
    );
  }
  if (!date) {
    return (
      <button onClick={() => { setDraft(""); setEditing(true); }} title="Set a due date" className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--c-border)] font-medium text-[var(--c-ink-muted)] transition-colors hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] ${size}`}>
        <CalendarPlus size={compact ? 11 : 12} /> Set date
      </button>
    );
  }
  return (
    <button onClick={() => { setDraft(date); setEditing(true); }} title="Change the due date" className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold transition-opacity hover:opacity-80 ${URGENCY_CLASS[u]} ${size}`}>
      {fmtDate(date)}
      <span className="font-normal opacity-80">· {URGENCY_LABEL[u]}</span>
    </button>
  );
}

/**
 * Assignment chip, deliberately matching the date chip: it reads "Not assigned"
 * until someone owns the task, and one click opens the team list. Team members
 * come from the Time Tracker's activity users. The list is a portal-backed
 * PopMenu so it can overlay the deadlines below and scroll when the firm has
 * more names than fit.
 */
function AssigneePicker({ id, value, team, run, pending, compact }: { id: number; value: string; team: TeamMember[]; run: Run; pending: boolean; compact?: boolean }) {
  const size = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  return (
    <PopMenu
      disabled={pending}
      title={value ? `Assigned to ${value} — click to change` : "Assign this to a team member"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-medium transition-colors ${size} ${
        value
          ? "border-[var(--c-accent)]/40 bg-[var(--c-accent)]/10 text-[var(--c-accent)]"
          : "border-dashed border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
      }`}
      label={
        <>
          {value ? <UserRound size={compact ? 11 : 12} /> : <UserPlus size={compact ? 11 : 12} />}
          {value || "Not assigned"}
        </>
      }
    >
      {(close) => (
        <>
          {team.length === 0 && <span className="block px-3 py-2 text-xs text-[var(--c-ink-muted)]">No team members found. Add them in the Time Tracker.</span>}
          {team.map((m) => (
            <PopMenuItem key={m.name} active={m.name === value} onClick={() => { close(); run(() => assignDeadline(id, m.name)); }}>
              {m.name}
            </PopMenuItem>
          ))}
          {value && (
            <span className="mt-1 block border-t border-[var(--c-border)] pt-1">
              <PopMenuItem muted onClick={() => { close(); run(() => assignDeadline(id, "")); }}>Clear assignment</PopMenuItem>
            </span>
          )}
        </>
      )}
    </PopMenu>
  );
}

/**
 * After a task is checked off: offer to log the time it took. Everything that
 * can be prefilled is — the person (the assignee), their billing rate, the
 * case's matter, and a note built from the task — so only the hours are left.
 */
function LogTimeDialog({ deadlineId, title, team, defaultWho, categories, fallbackMatter, matters, onClose }: {
  deadlineId: number; title: string; team: TeamMember[]; defaultWho: string;
  categories: string[]; fallbackMatter: string; matters: MatterOption[]; onClose: () => void;
}) {
  // Who actually did the work — defaults to whoever the task was assigned to.
  const [who, setWho] = useState(defaultWho);
  const [step, setStep] = useState<"ask" | "form">("ask");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<{ name: string; rate: number }[]>([]);
  const matterDesc = useMemo(() => Object.fromEntries(matters.map((m) => [m.displayNumber, m.description])), [matters]);
  const [f, setF] = useState({
    activityUserName: "",
    price: 0,
    quantity: "",
    // The bare Clio display number only — same as a Time Tracker entry — so it
    // merges on the right key. The case's linked matter is often stored as
    // "NUMBER — Description"; strip it back to the number here.
    matter: cleanMatterCode(fallbackMatter, matters),
    // The category (e.g. DRAFTING) — goes INTO the note like the tracker does,
    // not into the activity_description column.
    category: "",
    // Free-text notes. Defaults to the task, which is what was done.
    note: title,
    entryDate: new Date().toISOString().slice(0, 10),
    nonBillable: false,
  });

  /** Just record who did it and close — no time entry. */
  function saveWhoOnly() {
    setSaving(true);
    setDeadlineDoneBy(deadlineId, who).finally(() => { setSaving(false); onClose(); });
  }

  async function openForm() {
    setLoading(true);
    const d = await timeEntryDefaults(deadlineId);
    if (d) {
      setUsers(d.users);
      // Bill it to the person who did the work, at their rate when we know it.
      const chosen = who || d.activityUserName;
      const rate = d.users.find((u) => u.name.toLowerCase() === chosen.toLowerCase())?.rate ?? d.price;
      setF((s) => ({ ...s, activityUserName: chosen, price: rate, matter: cleanMatterCode(d.matter || fallbackMatter, matters), note: d.taskTitle || s.note }));
    }
    setLoading(false);
    setStep("form");
  }

  // The user we bill under (the "Who" select, falling back to who did it).
  const billUser = f.activityUserName || who;
  // Exactly the string the tracker would write: "CATEGORY - Name (Role) - note".
  const finalNote = buildActivityNote(f.category, f.note, billUser);

  function save() {
    setSaving(true);
    setError(null);
    completeWithTime(
      deadlineId,
      {
        activityUserName: billUser,
        price: Number(f.price) || 0,
        quantity: Number(f.quantity),
        matter: cleanMatterCode(f.matter, matters),
        // Matches Time Tracker exactly: activity_description stays empty; the
        // category is folded into the note.
        activityDescription: "",
        note: finalNote,
        entryDate: f.entryDate,
        nonBillable: f.nonBillable,
      },
      billUser,
    )
      .then((r) => { if (r.ok) onClose(); else setError(r.error ?? "Couldn't save."); })
      .finally(() => setSaving(false));
  }

  const amount = (Number(f.quantity) || 0) * (Number(f.price) || 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-[var(--c-surface)] p-5 shadow-2xl">
        {step === "ask" ? (
          <>
            <h4 className="mb-1.5 inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-base"><Check size={16} className="text-emerald-600" /> Marked complete</h4>
            <p className="mb-3 text-sm text-[var(--c-ink-muted)]">
              <strong className="text-[var(--c-ink)]">{title}</strong>
            </p>

            <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Who completed this?</label>
            <div className="mb-4">
              <PopMenu
                width={240}
                title="Pick the team member who did the work"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  who ? "border-[var(--c-accent)]/40 bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "border-dashed border-[var(--c-border)] text-[var(--c-ink-muted)]"
                }`}
                label={<>{who ? <UserRound size={13} /> : <UserPlus size={13} />}{who || "Choose a team member"}</>}
              >
                {(close) => (
                  <>
                    {team.length === 0 && <span className="block px-3 py-2 text-xs text-[var(--c-ink-muted)]">No team members found. Add them in the Time Tracker.</span>}
                    {team.map((m) => (
                      <PopMenuItem key={m.name} active={m.name === who} onClick={() => { close(); setWho(m.name); }}>{m.name}</PopMenuItem>
                    ))}
                  </>
                )}
              </PopMenu>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={saveWhoOnly} disabled={saving} className="btn btn-outline text-sm py-2 px-4 disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : null} Done, no time entry
              </button>
              <button onClick={openForm} disabled={loading} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />} Also log time
              </button>
            </div>
          </>
        ) : (
          <>
            <h4 className="mb-3 inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-base"><Clock size={16} className="text-[var(--c-accent)]" /> Time entry</h4>
            <div className="space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Hours *</span>
                  <input type="number" step="0.1" min="0" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} autoFocus placeholder="1.5" className={`${input} w-full`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Date</span>
                  <input type="date" value={f.entryDate} onChange={(e) => setF({ ...f, entryDate: e.target.value })} className={`${input} w-full`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Who</span>
                  <select
                    value={f.activityUserName}
                    onChange={(e) => { const u = users.find((x) => x.name === e.target.value); setF({ ...f, activityUserName: e.target.value, price: u ? u.rate : f.price }); }}
                    className={`${input} w-full`}
                  >
                    {!users.some((u) => u.name === f.activityUserName) && f.activityUserName && <option value={f.activityUserName}>{f.activityUserName}</option>}
                    {users.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Rate ($/hr)</span>
                  <input type="number" step="1" min="0" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} className={`${input} w-full`} />
                </label>
              </div>
              <div className="block">
                <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Matter (case code)</span>
                <MatterPicker
                  matters={matters}
                  value={f.matter}
                  onChange={(v) => setF((s) => ({ ...s, matter: v }))}
                  placeholder="Search by code, client, or description…"
                  inputClass={`${input} w-full`}
                />
                {matterDesc[f.matter] && (
                  <span className="mt-1 block text-[11px] text-[var(--c-ink-muted)]">{matterDesc[f.matter]}</span>
                )}
              </div>
              {categories.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Category</span>
                  <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={`${input} w-full`}>
                    <option value="">— none —</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Note</span>
                <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} className={`${input} w-full`} />
              </label>
              {/* Exactly what lands in the CSV note column — same shape a Time
                  Tracker entry produces, so billing merges cleanly. */}
              <p className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface2)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
                <span className="font-semibold text-[var(--c-ink)]">Entry preview</span><br />
                <span className="text-[var(--c-ink)]">{f.matter || "—"}</span> · {finalNote}
              </p>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--c-ink-muted)]">
                <input type="checkbox" checked={f.nonBillable} onChange={(e) => setF({ ...f, nonBillable: e.target.checked })} />
                Non-billable
              </label>
              {amount > 0 && !f.nonBillable && (
                <p className="text-xs text-[var(--c-ink-muted)]">{f.quantity} hrs × ${f.price} = <strong className="text-[var(--c-ink)]">${amount.toFixed(2)}</strong></p>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-[var(--c-error)]">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} disabled={saving} className="btn btn-outline text-sm py-2 px-4 disabled:opacity-50">Skip</button>
              <button onClick={save} disabled={saving || !(Number(f.quantity) > 0)} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save time entry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Rename and delete. The date and assignee are edited directly on the row. */
function RowActions({ id, title, hasKids, hasNote, onNote, run, pending }: { id: number; title: string; hasKids?: boolean; hasNote?: boolean; onNote?: () => void; run: Run; pending: boolean }) {
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
      {onNote && (
        <button
          onClick={onNote}
          className={`rounded p-1 hover:text-[var(--c-accent)] ${hasNote ? "text-amber-600 dark:text-amber-400" : "text-[var(--c-ink-muted)]"}`}
          title={hasNote ? "Edit the note" : "Add a note"}
        >
          <StickyNote size={13} />
        </button>
      )}
      <button onClick={() => setEditing(true)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename"><Pencil size={13} /></button>
      <button onClick={() => { if (confirm(`Remove “${title}”${hasKids ? " and its sub-deadlines" : ""}?`)) run(() => deleteDeadline(id)); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
    </span>
  );
}
