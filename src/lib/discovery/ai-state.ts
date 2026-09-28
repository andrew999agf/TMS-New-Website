/**
 * One glance = one answer: has AI.fred finished this document or not?
 * Derived on the server from the row itself, so it is always truthful even
 * if a background run was cut off halfway — a doc is "done" only when it
 * has its label AND a note slot for every page.
 */

export type AiDocState = "done" | "partial" | "pending" | "photo" | "failed";

export type AiStateFields = {
  aiState: AiDocState;
  aiNotesDone: number;
  aiNotesTotal: number;
  /** For "failed": the stored reason, so the chip's tooltip explains itself. */
  aiIssue?: string;
};

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function aiStateOf(row: {
  name: string;
  contentType: string | null;
  pageCount: number | null;
  pageText: unknown;
  pageNotes: unknown;
  aiLabelStatus: string;
  textStatus: string;
  textError: string;
}): AiStateFields {
  const pages = arr(row.pageText) as string[];
  const notes = arr(row.pageNotes);
  const total = pages.length || row.pageCount || 0;
  const done = Math.min(notes.length, total || notes.length);
  const isImage = (row.contentType ?? "").startsWith("image/") || /\.(jpe?g|png)$/i.test(row.name);
  const hasText = pages.some((p) => typeof p === "string" && p.trim());

  if (row.textStatus === "failed") return { aiState: "failed", aiNotesDone: done, aiNotesTotal: total, aiIssue: row.textError || "couldn't be read" };
  if (row.aiLabelStatus === "labeled" || row.aiLabelStatus === "illegible") {
    return { aiState: total === 0 || notes.length >= total ? "done" : "partial", aiNotesDone: done, aiNotesTotal: total };
  }
  // Not labeled yet. A photo — or a scan whose text extraction came back
  // empty — is waiting on the (later) vision pass, not on this run.
  if (isImage || (row.textStatus === "done" && !hasText)) return { aiState: "photo", aiNotesDone: 0, aiNotesTotal: total };
  return { aiState: "pending", aiNotesDone: 0, aiNotesTotal: total };
}
