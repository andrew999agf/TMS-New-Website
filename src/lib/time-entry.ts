/**
 * Small, pure helpers for producing a time entry that is byte-for-byte
 * consistent with a Time Tracker 4.0 manual entry.
 *
 * These deliberately MIRROR the private helpers inside
 * `src/components/admin/TimeTracker.tsx` (getUserRole / createActivityDescription)
 * so that an entry created from the Pre-Trial Checklist's "log time" box lands in
 * the same shape, exports to the same CSV, and merges into the billing software
 * on the same keys. The Time Tracker itself is intentionally left untouched — it
 * keeps its own local copies — so this module exists only for the other callers
 * that need to match it.
 *
 * If the tracker's format ever changes, update it there and here together.
 */

export type MatterLike = { displayNumber: string; description?: string | null };

/**
 * Reduce a possibly-decorated matter string down to the bare Clio display
 * number — the value the Time Tracker stores and the billing merge keys on.
 *
 * The pre-trial case header saves a matter as "NUMBER — Description" (the format
 * MatterCombobox emits). Left as-is, the description words ride along into the
 * CSV `matter` column and break the merge. This strips them back to the number:
 *   - an exact display number is kept;
 *   - "NUMBER — Description" (or the full "NUMBER — Description" list entry) is
 *     reduced to NUMBER;
 *   - anything else falls back to the text before the em-dash separator, so at
 *     minimum the description is dropped.
 */
export function cleanMatterCode(value: string, matters: MatterLike[] = []): string {
  const v = (value || "").trim();
  if (!v) return "";
  // Already an exact display number.
  if (matters.some((m) => m.displayNumber === v)) return v;
  // Full "NUMBER — Description" list entry.
  const byFull = matters.find((m) => `${m.displayNumber} — ${m.description ?? ""}`.trim() === v);
  if (byFull) return byFull.displayNumber;
  // "NUMBER — Description" free form: take the head and confirm/keep it.
  const head = v.split(" — ")[0].trim();
  if (matters.some((m) => m.displayNumber === head)) return head;
  return head;
}

/** The billing role the tracker derives from an activity-user name. */
export const timekeeperRole = (user: string): "Attorney" | "Legal Assistant" =>
  user.includes("Attorney") ? "Attorney" : "Legal Assistant";

/** The user's name without any trailing "(rate…)" suffix, as the tracker writes it. */
export const timekeeperName = (user: string): string => user.split(" (")[0];

/**
 * Build the note exactly as the tracker's createActivityDescription does:
 *   "CATEGORY - Name (Role) - notes"
 * with the category and/or the notes omitted (and the joining " - " with them)
 * when they are blank, so a category-less or note-less entry still reads cleanly.
 */
export function buildActivityNote(category: string, notes: string, user: string): string {
  const who = `${timekeeperName(user)} (${timekeeperRole(user)})`;
  const cat = (category || "").trim();
  const base = cat ? `${cat} - ${who}` : who;
  const n = (notes || "").trim();
  return n ? `${base} - ${n}` : base;
}
