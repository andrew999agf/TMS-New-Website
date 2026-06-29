/** Default Activity Users and Categories for the time tracker. Seeded into the
 *  database when those tables are empty; fully editable in the admin afterward. */

export type TimeActivityUserSeed = { name: string; rate: number };

export const TIME_ACTIVITY_USERS: TimeActivityUserSeed[] = [
  { name: "Max Smith (Attorney)", rate: 395 },
  { name: "Andrew Bergeron (Legal Assistant)", rate: 145 },
  { name: "Micah Walters (Legal Assistant)", rate: 145 },
  { name: "Austin Choate (Legal Assistant)", rate: 145 },
  { name: "Jessica Smith (Legal Assistant)", rate: 145 },
  { name: "Frankie Moreno (Legal Assistant)", rate: 145 },
  { name: "Maddox Wolfe (Intern)", rate: 145 },
];

/**
 * Activity users to ensure exist even when the table is already populated
 * (added over time). "Apply database updates" inserts any of these that are
 * missing — by exact name — without disturbing or duplicating existing users.
 */
export const TIME_ACTIVITY_USERS_ENSURE: TimeActivityUserSeed[] = [
  { name: "Frankie Moreno (Legal Assistant)", rate: 145 },
  { name: "Maddox Wolfe (Intern)", rate: 145 },
];

export const TIME_CATEGORIES: string[] = [
  "APPELLATE", "CLIENT RELATIONS", "CONSULTATION (EVIDENCE)", "CONSULTATION (EXPERT)",
  "CONSULTATION (MISC)", "CONSULTATION (INTAKE)", "CORRESPONDENCE", "DEPOSITION",
  "DISCOVERY", "DOCUMENT PREPARATION", "DOCUMENT REVIEW", "DRAFT REVIEW",
  "E-FILING", "EMAIL", "IN COURT", "INVESTIGATION", "JAIL VISIT", "MEDIATION",
  "MISCELLANEOUS", "PLEADING", "RESEARCH", "SERVICE", "SETTLEMENT",
  "TELEPHONE CALL", "TRAVEL TIME", "TRIAL PREPARATION", "ZOOM CONFERENCE",
];
