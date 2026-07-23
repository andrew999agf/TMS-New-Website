/** Month-end billing reminder config. Shared by the admin Settings card and the
 *  billing-reminder cron. Types/consts only, so it's safe to import from a
 *  client component. */

export const BILLING_REMINDER_KEY = "billing.monthEndReminder";

export type BillingReminder = {
  /** Master switch — nothing is emailed until this is on. */
  enabled: boolean;
  /** The billing department's addresses (the "start assembling bills" prompt). */
  recipients: string[];
  /** Also email each person who has unbilled time entries to submit their billing. */
  notifyStaff: boolean;
};

export const BILLING_REMINDER_DEFAULT: BillingReminder = {
  enabled: false,
  recipients: [],
  notifyStaff: true,
};
