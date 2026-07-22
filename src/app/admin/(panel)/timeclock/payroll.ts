/** Payroll schedule config shared by the Time Clock page and its actions. */

export type PayrollSchedule = {
  /** A known payday the pattern anchors to (YYYY-MM-DD). */
  anchorPayday: string;
  frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  /** Payroll must be finalized this many days BEFORE payday. */
  leadDays: number;
};

export const PAYROLL_KEY = "timeclock.payroll";

/** Handbook default: biweekly Fridays, payroll finalized two days ahead. */
export const PAYROLL_DEFAULT: PayrollSchedule = { anchorPayday: "2026-07-17", frequency: "biweekly", leadDays: 2 };
