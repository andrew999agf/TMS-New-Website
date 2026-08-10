/**
 * Pre-trial deadline templates and urgency rules. Client-safe (no server
 * imports) so the list page, the checklist, and the server actions can all share
 * one definition of "how urgent is this?".
 *
 * Dates are plain YYYY-MM-DD strings throughout — these are court calendar
 * dates and must never shift with a timezone.
 */

export type TemplateItem = {
  title: string;
  /** Days BEFORE the trial date. 0 = the day of trial. */
  daysBefore: number;
  notes?: string;
};

export type DeadlineTemplate = {
  id: string;
  label: string;
  description: string;
  items: TemplateItem[];
};

/**
 * Starting checklists. These are conventional scheduling-order milestones, not
 * legal advice — every date is editable after setup, and the controlling
 * scheduling order always governs.
 */
export const TEMPLATES: DeadlineTemplate[] = [
  {
    id: "civil-standard",
    label: "Civil case — standard scheduling order",
    description: "The usual civil pre-trial sequence, counted back from the trial date.",
    items: [
      { title: "Amend pleadings deadline", daysBefore: 120 },
      { title: "Designate testifying experts — party with burden of proof", daysBefore: 90 },
      { title: "Designate responsive/rebuttal experts", daysBefore: 60 },
      { title: "Mediation completed", daysBefore: 45 },
      { title: "Dispositive motions filed", daysBefore: 45 },
      { title: "Discovery period closes", daysBefore: 30 },
      { title: "Exchange witness lists", daysBefore: 30 },
      { title: "Exchange exhibit lists and exhibits", daysBefore: 30 },
      { title: "Serve trial subpoenas on witnesses", daysBefore: 21 },
      { title: "File motions in limine", daysBefore: 14 },
      { title: "Objections to deposition designations", daysBefore: 14 },
      { title: "Pre-trial conference", daysBefore: 14 },
      { title: "File joint pre-trial order", daysBefore: 7 },
      { title: "File proposed jury charge / findings of fact", daysBefore: 7 },
      { title: "Final witness and exhibit prep; trial notebook assembled", daysBefore: 3 },
      { title: "TRIAL", daysBefore: 0 },
    ],
  },
  {
    id: "criminal-standard",
    label: "Criminal case — pre-trial sequence",
    description: "Common criminal pre-trial milestones counted back from the trial setting.",
    items: [
      { title: "Review discovery / Article 39.14 production complete", daysBefore: 90 },
      { title: "File pre-trial motions (suppress, quash)", daysBefore: 45 },
      { title: "Expert notice / designation", daysBefore: 30 },
      { title: "Pre-trial motions hearing", daysBefore: 30 },
      { title: "Plea deadline / final plea setting", daysBefore: 21 },
      { title: "Serve subpoenas on defense witnesses", daysBefore: 21 },
      { title: "File motions in limine", daysBefore: 14 },
      { title: "Exchange witness and exhibit lists", daysBefore: 14 },
      { title: "Proposed jury charge / requested instructions", daysBefore: 7 },
      { title: "Voir dire outline and trial notebook prepared", daysBefore: 3 },
      { title: "TRIAL", daysBefore: 0 },
    ],
  },
  {
    id: "blank",
    label: "Blank checklist",
    description: "Start empty and add your own deadlines.",
    items: [],
  },
];

export function getTemplate(id: string): DeadlineTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/* ------------------------------ date helpers ------------------------------ */

/** Today as YYYY-MM-DD in the firm's local (Central) calendar. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Shift a YYYY-MM-DD date by whole days. Pure string/UTC math — no drift. */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from today until `iso`. Negative = overdue. null if no date. */
export function daysUntil(iso: string | null | undefined, today: string = todayISO()): number | null {
  if (!iso) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** "Mar 4, 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "No date";
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/* -------------------------------- urgency --------------------------------- */

/**
 * How close a deadline is. The final few days are broken out individually so the
 * chip can shade from orange toward red as the date closes in, rather than
 * flattening everything inside 72 hours into one alarming "due now".
 */
export type Urgency = "overdue" | "today" | "d1" | "d2" | "d3" | "week" | "month" | "later" | "none";

/** Rank for sorting — lower sorts first (most urgent at the top). */
export const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 0, today: 1, d1: 2, d2: 3, d3: 4, week: 5, month: 6, later: 7, none: 8,
};

export function urgencyOf(dueDate: string | null | undefined, today?: string): Urgency {
  const d = daysUntil(dueDate, today);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "d1";
  if (d === 2) return "d2";
  if (d === 3) return "d3";
  if (d <= 7) return "week";
  if (d <= 30) return "month";
  return "later";
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "Overdue",
  today: "Due now",
  d1: "Due in 1 day",
  d2: "Due in 2 days",
  d3: "Due in 3 days",
  week: "This week",
  month: "This month",
  later: "Later",
  none: "No date set",
};

/**
 * Chip colours, deliberately stepping amber → orange → red as the deadline
 * approaches so the run-up is readable at a glance. Each level is a visibly
 * different shade; the last two also carry weight.
 */
export const URGENCY_CLASS: Record<Urgency, string> = {
  overdue: "bg-red-700/25 text-red-800 dark:text-red-300 border-red-700/70 font-bold",
  today: "bg-red-600/20 text-red-700 dark:text-red-300 border-red-600/60 font-bold",
  d1: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/50",
  d2: "bg-orange-600/18 text-orange-800 dark:text-orange-300 border-orange-600/55",
  d3: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/45",
  week: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  month: "bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-400/30",
  later: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)] border-[var(--c-border)]",
  none: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)] border-[var(--c-border)]",
};

/** Completed work reads as calm, pale green rather than any shade of alarm. */
export const DONE_CLASS = "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/35";

/** "3 days overdue" / "Due today" / "in 12 days" */
export function duePhrase(dueDate: string | null | undefined, today?: string): string {
  const d = daysUntil(dueDate, today);
  if (d === null) return "No date set";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `in ${d} days`;
}

/**
 * Checklist order: open items first, most urgent first, then by date, then by
 * the template's own sequence. Completed items fall to the bottom.
 */
export function sortDeadlines<T extends { dueDate: string | null; done: boolean; sort: number; title: string }>(rows: T[], today?: string): T[] {
  return [...rows].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ra = URGENCY_RANK[urgencyOf(a.dueDate, today)];
    const rb = URGENCY_RANK[urgencyOf(b.dueDate, today)];
    if (ra !== rb) return ra - rb;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.title.localeCompare(b.title);
  });
}

export type Nestable = { id: number; parentId: number | null; dueDate: string | null; done: boolean; sort: number; title: string };
export type Nested<T> = T & { children: T[] };

/**
 * Build the two-level checklist: top-level tasks each carrying their sub-tasks.
 *
 * A parent inherits the urgency of its most pressing open sub-task, so a parent
 * with no date of its own still rises to the top when something under it is
 * overdue. Orphans (a sub-task whose parent is gone) are promoted rather than
 * dropped, so nothing can silently disappear from the list.
 */
export function nestDeadlines<T extends Nestable>(rows: T[], today?: string): Nested<T>[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parents = rows.filter((r) => r.parentId == null || !byId.has(r.parentId));
  const kids = new Map<number, T[]>();
  for (const r of rows) {
    if (r.parentId != null && byId.has(r.parentId)) {
      const list = kids.get(r.parentId) ?? [];
      list.push(r);
      kids.set(r.parentId, list);
    }
  }
  const withKids = parents.map((p) => ({ ...p, children: sortDeadlines(kids.get(p.id) ?? [], today) }));

  // Rank a parent by the most urgent thing in its subtree (itself or an open child).
  const rankOf = (n: Nested<T>) => {
    let best = n.done ? URGENCY_RANK.none : URGENCY_RANK[urgencyOf(n.dueDate, today)];
    for (const c of n.children) {
      if (c.done) continue;
      best = Math.min(best, URGENCY_RANK[urgencyOf(c.dueDate, today)]);
    }
    return best;
  };
  const allDone = (n: Nested<T>) => n.done && n.children.every((c) => c.done);

  return withKids.sort((a, b) => {
    const da = allDone(a), dbb = allDone(b);
    if (da !== dbb) return da ? 1 : -1;
    const ra = rankOf(a), rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.title.localeCompare(b.title);
  });
}
