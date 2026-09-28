"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ExternalLink, FileText, Loader2, Scale, Trash2, UploadCloud } from "lucide-react";
import { ensurePleadingsFolder, deletePleading } from "@/app/admin/(panel)/cases/actions";
import { registerShareFile } from "@/app/admin/(panel)/share-folders/actions";

export type PleadingRow = {
  id: number;
  filename: string;
  url: string;
  pages: number | null;
  uploadedAt: string;
  textIndexed: boolean;
  aiLabel: string;
};

/**
 * The case's PLEADINGS bucket — petition, answer, counterclaims, key
 * motions. This is how AI.fred learns what the lawsuit is ABOUT, so it can
 * judge the relevance of discovery evidence instead of describing it in a
 * vacuum. Files here are indexed and labeled by Read & label like all case
 * documents, feed every AI answer about the case, and are NEVER exposed on
 * any share link.
 */
export function PleadingsBucket({ caseId, matter, initial }: { caseId: number; matter: string; initial: PleadingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.size > 0);
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const folder = await ensurePleadingsFolder(matter);
      if (!folder.ok) { setError(folder.error); return; }
      const failed: string[] = [];
      let done = 0;
      for (const file of files) {
        setProgress(`Uploading ${done + 1} / ${files.length} — ${file.name}`);
        try {
          const blob = await upload(`share/${folder.folderId}/${file.name}`, file, { access: "public", handleUploadUrl: "/api/admin/share-upload", clientPayload: String(folder.folderId), multipart: true });
          const res = await registerShareFile(folder.folderId, { url: blob.url, pathname: blob.pathname, filename: file.name, contentType: file.type || blob.contentType, size: file.size });
          if (!res.ok) throw new Error(res.error ?? "record failed");
        } catch {
          failed.push(file.name);
        }
        done += 1;
      }
      if (failed.length) setError(`Couldn't upload: ${failed.join(", ")}`);
      router.refresh();
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Scale size={16} className="text-[var(--c-accent)]" />
        <h2 className="font-[family-name:var(--font-display)] text-lg">Pleadings</h2>
        <span className="text-xs text-[var(--c-ink-muted)]">petition · answer · counterclaims · key motions</span>
        <button onClick={() => inputRef.current?.click()} disabled={busy || !matter}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] disabled:opacity-50"
          title={matter ? "Upload pleadings (PDF) — AI.fred reads these to understand the lawsuit" : "Set a matter number first"}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} {busy ? progress || "Uploading…" : "Upload pleadings"}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--c-ink-muted)]">
        This is AI.fred&apos;s case-context bucket: it reads these to understand what the lawsuit is about, so it can tell you why a piece of discovery matters — not just what it says. Indexed &amp; labeled by <strong className="text-[var(--c-ink)]">Read &amp; label</strong> in the Discovery Reviewer; never visible on any shared link.
      </p>
      {error && <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      {initial.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--c-border)] rounded-md border border-[var(--c-border)]">
          {initial.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
              <FileText size={14} className="shrink-0 text-[var(--c-accent)]" />
              <span className="min-w-0 flex-1 truncate" title={f.filename}>{f.filename}</span>
              {f.aiLabel && <span className="hidden max-w-64 truncate rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] text-[var(--c-accent)] sm:inline" title={f.aiLabel}>{f.aiLabel}</span>}
              <span className="shrink-0 text-xs text-[var(--c-ink-muted)]">{f.pages ? `${f.pages} pp.` : ""}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${f.textIndexed ? "bg-green-500" : "bg-amber-500"}`} title={f.textIndexed ? "Text indexed — AI.fred can read it" : "Text not pulled yet — Read & label in the Discovery Reviewer indexes it"} />
              <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open the file"><ExternalLink size={14} /></a>
              <button onClick={async () => { if (!window.confirm(`Remove "${f.filename}" from the pleadings bucket?`)) return; const r = await deletePleading(f.id, caseId); if (!r.ok) setError(r.error); else router.refresh(); }}
                className="shrink-0 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
