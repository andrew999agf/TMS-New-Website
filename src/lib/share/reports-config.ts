/** Share-folder management-report config. Shared by the admin card and the cron.
 *  Types/consts only, so it's safe to import from a client component. */

export const SHARE_REPORT_KEY = "share.monthlyReport";

export type ShareReportConfig = {
  /** Master switch — nothing is emailed until this is on. */
  enabled: boolean;
  /** Who receives the monthly email. Empty = all full admins. */
  recipients: string[];
  /** Include the open to-do / tickler report. */
  includeTodos: boolean;
  /** Include the documents-uploaded report. */
  includeDocuments: boolean;
};

export const SHARE_REPORT_DEFAULT: ShareReportConfig = {
  enabled: true,
  recipients: [],
  includeTodos: true,
  includeDocuments: true,
};

export type ShareReportKind = "todos" | "documents";

export function reportKindLabel(kind: string): string {
  return kind === "documents" ? "Documents uploaded" : "To-do items & ticklers";
}

/** Reports auto-archive after this many days (six months). */
export const REPORT_ARCHIVE_DAYS = 183;
