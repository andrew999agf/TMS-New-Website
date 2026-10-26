/** Turn an access-log row into words for the admin page and the CSV. Pure;
 *  usable on the client too. */
export type AccessDescription = { label: string; detail: string; document: string; files?: number; bytes?: number; via: string; viaLabel: string };

const scopeWords: Record<string, string> = { all: "everything", selected: "selected documents", recent: "recent uploads", dir: "a sub-folder", package: "the prepared package" };
const viaWords: Record<string, string> = { link: "their share link", "file-link": "a direct file link", "dir-link": "a sub-folder link", "ai-reviewer": "the Claude reviewer link" };

export function describeAccess(row: { action: string; meta: Record<string, unknown>; fileName?: string | null }): AccessDescription {
  const m = row.meta ?? {};
  const files = typeof m.files === "number" ? m.files : undefined;
  const bytes = typeof m.bytes === "number" ? m.bytes : undefined;
  const via = typeof m.via === "string" ? m.via : "link";
  const document = row.fileName ?? (typeof m.name === "string" ? m.name : "");
  const mb = bytes != null ? `${(bytes / 1048576).toFixed(1)} MB` : "";
  switch (row.action) {
    case "view": return { label: "Opened the folder", detail: "", document: "", via, viaLabel: viaWords[via] ?? via };
    case "preview": return { label: "Previewed a document", detail: mb, document, bytes, via, viaLabel: viaWords[via] ?? via };
    case "download": return { label: "Downloaded a document", detail: mb, document, bytes, via, viaLabel: viaWords[via] ?? via };
    case "zip": {
      const scope = typeof m.scope === "string" ? m.scope : "all";
      const part = typeof m.part === "number" && typeof m.parts === "number" ? ` (part ${m.part} of ${m.parts})` : "";
      const whole = scope === "all" ? "Downloaded the whole folder (ZIP)" : `Downloaded ${scopeWords[scope] ?? scope} (ZIP)`;
      return { label: whole, detail: `${files ?? "?"} document${files === 1 ? "" : "s"}${mb ? ` · ${mb}` : ""}${part}${typeof m.dir === "string" && m.dir ? ` · ${m.dir}` : ""}`, document: "", files, bytes, via, viaLabel: viaWords[via] ?? via };
    }
    case "upload": return { label: "Uploaded documents", detail: files ? `${files} document${files === 1 ? "" : "s"}` : "", document: "", files, via, viaLabel: viaWords[via] ?? via };
    default: return { label: row.action, detail: "", document, via, viaLabel: viaWords[via] ?? via };
  }
}
