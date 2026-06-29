"use client";

import { useState, useTransition } from "react";
import { FileSignature, FileText, Copy, Download, Check, Loader2, AlertCircle, User } from "lucide-react";
import { renderDocument } from "@/app/admin/(panel)/documents/actions";

type DocMeta = { id: string; label: string; trigger: { field: string; value: string } };
type Submission = { id: number; name: string; createdAt: string; answers: Record<string, unknown> };

function requested(answers: Record<string, unknown>, trigger: DocMeta["trigger"]): boolean {
  const v = answers[trigger.field];
  const arr = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  return arr.includes(trigger.value);
}

export function DocumentGenerator({ submissions, docMeta }: { submissions: Submission[]; docMeta: DocMeta[] }) {
  const [selected, setSelected] = useState<Submission | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; text: string; missing: string[] } | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const available = selected ? docMeta.filter((d) => requested(selected.answers, d.trigger)) : [];

  function pickSubmission(s: Submission) {
    setSelected(s);
    setDocId(null);
    setDraft(null);
  }

  function pickDoc(id: string) {
    if (!selected) return;
    setDocId(id);
    setDraft(null);
    start(async () => {
      const res = await renderDocument(selected.id, id);
      if (res.ok) setDraft({ label: res.label, text: res.text, missing: res.missing });
    });
  }

  function copy() {
    if (!draft) return;
    navigator.clipboard.writeText(draft.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function download() {
    if (!draft || !selected) return;
    const blob = new Blob([draft.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name.replace(/[^a-z0-9]+/gi, "-")}-${docId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (submissions.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm text-[var(--c-ink-muted)]">
        No estate-planning intake submissions yet. When a client completes the estate-planning intake, they&apos;ll appear
        here and you can generate their documents.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      {/* Submissions list */}
      <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden">
        <p className="border-b border-[var(--c-border)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">
          Estate-planning intakes
        </p>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-[var(--c-border)]">
          {submissions.map((s) => {
            const docs = docMeta.filter((d) => requested(s.answers, d.trigger));
            const active = selected?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => pickSubmission(s)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left ${active ? "bg-[var(--c-surface2)]" : "hover:bg-[var(--c-surface2)]"}`}
              >
                <User size={16} className="mt-0.5 shrink-0 text-[var(--c-ink-muted)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{s.name}</span>
                  <span className="block text-xs text-[var(--c-ink-muted)]">
                    {new Date(s.createdAt).toLocaleDateString()} · {docs.length} document{docs.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div className="min-w-0">
        {!selected ? (
          <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-[var(--c-border)] text-sm text-[var(--c-ink-muted)]">
            Select an intake on the left to generate their documents.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Document chips the client requested */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">
                Documents requested by {selected.name}
              </p>
              {available.length === 0 ? (
                <p className="text-sm text-[var(--c-ink-muted)]">
                  This intake didn&apos;t check any specific documents. Open the intake record to review their answers.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {available.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => pickDoc(d.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                        docId === d.id
                          ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-ink)]"
                          : "border-[var(--c-border)] hover:bg-[var(--c-surface2)]"
                      }`}
                    >
                      <FileText size={14} /> {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Draft */}
            {pending && (
              <div className="flex items-center gap-2 text-sm text-[var(--c-ink-muted)]">
                <Loader2 size={15} className="animate-spin" /> Generating draft…
              </div>
            )}

            {draft && !pending && (
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold text-[var(--c-ink)]">
                    <FileSignature size={16} className="text-[var(--c-accent)]" /> {draft.label} — draft
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]">
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={download} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]">
                      <Download size={13} /> Download
                    </button>
                  </div>
                </div>

                {draft.missing.length > 0 && (
                  <div className="flex items-start gap-2 border-b border-[var(--c-border)] bg-[var(--c-error)]/5 px-4 py-2.5 text-xs text-[var(--c-ink-muted)]">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--c-error)]" />
                    <span>
                      <span className="font-semibold text-[var(--c-ink)]">{draft.missing.length}</span> field
                      {draft.missing.length === 1 ? "" : "s"} still blank — shown as <code>[ … ]</code> placeholders for the attorney to complete.
                    </span>
                  </div>
                )}

                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap px-5 py-4 font-[family-name:var(--font-ui)] text-sm leading-relaxed text-[var(--c-ink)]">
                  {draft.text}
                </pre>
              </div>
            )}

            <p className="text-xs text-[var(--c-ink-muted)]">
              Drafts are scaffolds generated from the client&apos;s intake answers and must be reviewed and finalized by an attorney.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
