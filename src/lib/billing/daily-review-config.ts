/** End-of-day billing review report config. Types/consts only (client-safe). */

export const DAILY_REVIEW_KEY = "billing.dailyReview";

export type DailyReviewConfig = {
  /** Master switch — nothing is emailed until this is on. */
  enabled: boolean;
  /** Who receives the 6 PM review email. Empty = all full admins. */
  recipients: string[];
};

export const DAILY_REVIEW_DEFAULT: DailyReviewConfig = {
  enabled: true,
  recipients: [],
};
