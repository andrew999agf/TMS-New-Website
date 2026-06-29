/**
 * Training module data model. Kept deliberately small and declarative so the
 * catalog stays easy to extend and reorganize later: modules group into
 * categories, each module is a list of lessons, and each lesson is a list of
 * simple content blocks. Adding a module = appending to the catalog; adding a
 * new section/category = adding a TrainingCategory and tagging modules with it.
 * No database migration is needed for content — only per-user completion is
 * stored (see training/actions).
 */

/** Top-level grouping shown as headings on the Training index. Extend freely. */
export type TrainingCategory = "Onboarding" | "Firm Policies" | "Estate Planning (Wills & Trusts)";

/** Ordered list of categories — controls section order on the index page. */
export const TRAINING_CATEGORIES: TrainingCategory[] = [
  "Onboarding",
  "Firm Policies",
  "Estate Planning (Wills & Trusts)",
];

/** A self-check question with an optional revealable answer. */
export type ReviewQuestion = { q: string; a?: string };

/** A single piece of lesson content. Paragraph/list text supports **bold**. */
export type TrainingBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "callout"; tone?: "info" | "warning"; title?: string; text: string }
  | { type: "quote"; text: string }
  | { type: "questions"; items: ReviewQuestion[] };

export type TrainingLesson = {
  /** Stable slug, unique within the module (used for anchors/table of contents). */
  id: string;
  title: string;
  blocks: TrainingBlock[];
};

export type TrainingModule = {
  /** Stable slug, unique across all modules (used in the URL). */
  slug: string;
  title: string;
  category: TrainingCategory;
  /** Who this is primarily for, shown as a chip — e.g. "Interns", "All staff". */
  audience: string;
  summary: string;
  estMinutes: number;
  /** Last content update, free text e.g. "January 2025". */
  updated: string;
  /** Optional provenance line, e.g. "Based on the Employee Handbook (rev. 01/2025)". */
  sourceNote?: string;
  lessons: TrainingLesson[];
};
