/** Payroll schedule config shared by the Time Clock page, its actions, and the
 *  automated payroll-deadline / anomaly-alert crons. Kept in a plain module (not
 *  the "use server" actions file) so it can export types AND constants/helpers. */

export type PayrollSchedule = {
  /** A known payday the pattern anchors to (YYYY-MM-DD). */
  anchorPayday: string;
  frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  /** Payroll must be finalized this many days BEFORE payday. */
  leadDays: number;
  /** Flag a person's day (email the billing recipients) when it exceeds this many
   *  hours — the forgotten-clock-out guard. Defaults to 11 when absent. */
  alertHours?: number;
};

export const PAYROLL_KEY = "timeclock.payroll";

/** Handbook default: biweekly Fridays, payroll finalized two days ahead. */
export const PAYROLL_DEFAULT: PayrollSchedule = { anchorPayday: "2026-07-17", frequency: "biweekly", leadDays: 2, alertHours: 11 };

/** Hours-in-a-day above which a punch day is treated as a likely forgotten clock-out. */
export const DEFAULT_ALERT_HOURS = 11;

/* --------------------------- pure date arithmetic ---------------------------
 * All computed on calendar dates via UTC so results are timezone-independent
 * (the caller supplies "today" as a YYYY-MM-DD string in whatever zone matters).
 * Every function takes and returns YYYY-MM-DD strings. */

const DAY = 86_400_000;
const parseISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtISO = (ms: number) => {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

/** Length of one pay period in days (approximate for semimonthly/monthly). */
export function payPeriodDays(freq: PayrollSchedule["frequency"]): number {
  return freq === "weekly" ? 7 : freq === "biweekly" ? 14 : freq === "semimonthly" ? 15 : 30;
}

/** The first payday on/after `todayIso`. */
export function nextPaydayIso(cfg: PayrollSchedule, todayIso: string): string {
  const today = parseISO(todayIso);
  if (cfg.frequency === "semimonthly") {
    const dt = new Date(today);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const d = dt.getUTCDate();
    if (d <= 1) return fmtISO(Date.UTC(y, m, 1));
    if (d <= 15) return fmtISO(Date.UTC(y, m, 15));
    return fmtISO(Date.UTC(y, m + 1, 1));
  }
  const anchor = parseISO(cfg.anchorPayday);
  if (cfg.frequency === "monthly") {
    const dom = new Date(anchor).getUTCDate();
    const dt = new Date(today);
    const cand = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dom);
    return fmtISO(cand >= today ? cand : Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dom));
  }
  const period = cfg.frequency === "weekly" ? 7 : 14;
  const diff = Math.round((today - anchor) / DAY);
  const k = diff <= 0 ? 0 : Math.ceil(diff / period);
  return fmtISO(anchor + k * period * DAY);
}

/** Clamp lead days the same way the save action does. */
export function leadDaysOf(cfg: PayrollSchedule): number {
  return Math.max(0, Math.min(14, Math.round(cfg.leadDays)));
}

/** Payroll-finalize deadline for the next payday: payday − leadDays. */
export function payrollDeadlineIso(cfg: PayrollSchedule, todayIso: string): string {
  const pay = parseISO(nextPaydayIso(cfg, todayIso));
  return fmtISO(pay - leadDaysOf(cfg) * DAY);
}

/** The pay period whose report the deadline email should carry: the
 *  `payPeriodDays` complete days ending the night before the deadline day. */
export function payPeriodForDeadline(cfg: PayrollSchedule, deadlineIso: string): { startIso: string; endIso: string } {
  const end = parseISO(deadlineIso); // exclusive end = start of deadline day (covers through the prior night)
  const start = end - payPeriodDays(cfg.frequency) * DAY;
  return { startIso: fmtISO(start), endIso: fmtISO(end) };
}

/* ------------------------- saved payroll-report period -------------------------
 * The office saves the current period's From/Through once; after that, whenever
 * today moves past the saved Through, the period rolls forward in two-week
 * steps on its own — so the Payroll Report always opens on the period that
 * goes to the payroll department next. */

export type PayrollPeriod = { from: string; through: string };

export const PAYROLL_PERIOD_KEY = "timeclock.payrollPeriod";

/** The saved period rolled forward (14-day steps) until it ends on/after today. */
export function currentPayrollPeriod(saved: PayrollPeriod | null | undefined, todayIso: string): PayrollPeriod | null {
  if (!saved || !/^\d{4}-\d{2}-\d{2}$/.test(saved.from) || !/^\d{4}-\d{2}-\d{2}$/.test(saved.through)) return null;
  let from = parseISO(saved.from);
  let through = parseISO(saved.through);
  if (!Number.isFinite(from) || !Number.isFinite(through) || through < from) return null;
  const today = parseISO(todayIso);
  const STEP = 14 * DAY;
  while (through < today) {
    from += STEP;
    through += STEP;
  }
  return { from: fmtISO(from), through: fmtISO(through) };
}
