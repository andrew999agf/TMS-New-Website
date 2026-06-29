"use client";

import { useMemo, useState, useTransition } from "react";
import {
  FileSignature, FileText, FileDown, Printer, Loader2, AlertCircle, User, Mail,
  PencilLine, ExternalLink, Braces, ChevronDown,
} from "lucide-react";
import { generateLegalDoc } from "@/app/admin/(panel)/documents/actions";
import { SendIntakeDialog } from "@/components/admin/SendIntakeRequest";

type Trigger = { field: string; value: string };
type DocMeta = {
  id: string;
  label: string;
  trigger: Trigger | null;
  fields: { token: string; label: string }[];
  optionals: { id: string; label: string; text: string; defaultOn: boolean }[];
};
type Submission = { id: number; name: string; email: string | null; createdAt: string; answers: Record<string, unknown> };
type OptState = Record<string, { on: boolean; text: string }>;
type Draft = { label: string; html: string; wordHtml: string; missing: string[] };

function requested(answers: Record<string, unknown>, trigger: Trigger | null): boolean {
  if (!trigger) return false;
  const v = answers[trigger.field];
  const arr = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  return arr.includes(trigger.value);
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");

export function DocumentGenerator({ submissions, docMeta, intakeUrl }: { submissions: Submission[]; docMeta: DocMeta[]; intakeUrl: string }) {
  const [selected, setSelected] = useState<Submission | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [optState, setOptState] = useState<OptState>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [showFields, setShowFields] = useState(false);

  const requestedDocs = useMemo(
    () => (selected ? docMeta.filter((d) => requested(selected.answers, d.trigger)) : []),
    [selected, docMeta],
  );
  const shownDocs = manual ? docMeta : requestedDocs;
  const activeDoc = docMeta.find((d) => d.id === docId) ?? null;

  function pickSubmission(s: Submission) {
    setSelected(s);
    setDocId(null);
    setDraft(null);
    setManual(false);
    setSendOpen(false);
  }

  function pickDoc(d: DocMeta) {
    setDocId(d.id);
    setDraft(null);
    setShowFields(false);
    const init: OptState = {};
    for (const o of d.optionals) init[o.id] = { on: o.defaultOn, text: o.text };
    setOptState(init);
  }

  function generate() {
    if (!selected || !activeDoc) return;
    const payload: Record<string, string | false> = {};
    for (const o of activeDoc.optionals) {
      const st = optState[o.id];
      payload[o.id] = st?.on ? st.text : false;
    }
    start(async () => {
      const res = await generateLegalDoc(selected.id, activeDoc.id, payload);
      if (res.ok) setDraft({ label: res.label, html: res.html, wordHtml: res.wordHtml, missing: res.missing });
    });
  }

  function downloadPdf() {
    if (!draft) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(draft.html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  function downloadWord() {
    if (!draft || !selected) return;
    const blob = new Blob(["﻿", draft.wordHtml], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(selected.name)}-${docId}.doc`;
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
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">
                {manual ? `Choose a document to draft for ${selected.name}` : `Documents requested by ${selected.name}`}
              </p>

              {requestedDocs.length === 0 && !manual ? (
                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                  <p className="text-sm text-[var(--c-ink-muted)]">
                    This intake didn&apos;t check any documents{" "}
                    {selected.answers["docsNotSure"] ? "(they asked us to recommend a plan). " : ". "}
                    You can email them to complete it, enter it for them, or pick documents to draft.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => setSendOpen(true)} disabled={!selected.email} title={selected.email ? "" : "No email on this submission"} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                      <Mail size={15} /> Email the client to fill it out
                    </button>
                    <a href={intakeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">
                      <ExternalLink size={15} /> Fill out the intake for them
                    </a>
                    <button onClick={() => setManual(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">
                      <PencilLine size={15} /> Just pick documents to draft
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {shownDocs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => pickDoc(d)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                        docId === d.id ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-ink)]" : "border-[var(--c-border)] hover:bg-[var(--c-surface2)]"
                      }`}
                    >
                      <FileText size={14} /> {d.label}
                    </button>
                  ))}
                  {!manual && (
                    <button onClick={() => setManual(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]">
                      <PencilLine size={14} /> More documents
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Selected document: merge fields + optional provisions */}
            {activeDoc && (
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--c-ink)]">
                    <FileSignature size={16} className="text-[var(--c-accent)]" /> {activeDoc.label}
                  </span>
                  <button onClick={() => setShowFields((v) => !v)} className="inline-flex items-center gap-1 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
                    <Braces size={13} /> Merge fields <ChevronDown size={13} className={showFields ? "rotate-180" : ""} />
                  </button>
                </div>

                {showFields && (
                  <div className="mt-3 rounded-md border border-[var(--c-border)] bg-[var(--c-surface2)] p-3">
                    <p className="mb-1.5 text-xs text-[var(--c-ink-muted)]">This document uses these merge fields (blank ones become highlighted placeholders):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeDoc.fields.map((f) => (
                        <span key={f.token} className="rounded bg-[var(--c-surface)] px-2 py-0.5 text-[11px] text-[var(--c-ink-muted)]" title={`{{${f.token}}}`}>{f.label}</span>
                      ))}
                    </div>
                  </div>
                )}

                {activeDoc.optionals.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--c-ink-muted)]">Optional provisions</p>
                    <div className="space-y-2.5">
                      {activeDoc.optionals.map((o) => {
                        const st = optState[o.id] ?? { on: o.defaultOn, text: o.text };
                        return (
                          <div key={o.id} className="rounded-md border border-[var(--c-border)] p-2.5">
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--c-ink)]">
                              <input type="checkbox" className="accent-[var(--c-accent)]" checked={st.on} onChange={(e) => setOptState((m) => ({ ...m, [o.id]: { ...st, on: e.target.checked } }))} />
                              {o.label}
                            </label>
                            {st.on && (
                              <textarea
                                value={st.text}
                                onChange={(e) => setOptState((m) => ({ ...m, [o.id]: { ...st, text: e.target.value } }))}
                                rows={2}
                                className="mt-2 w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-xs text-[var(--c-ink)] outline-none focus:border-[var(--c-accent)]"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <button onClick={generate} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                    {pending ? <Loader2 size={15} className="animate-spin" /> : <FileSignature size={15} />} {draft ? "Regenerate draft" : "Generate draft"}
                  </button>
                </div>
              </div>
            )}

            {/* Draft preview + downloads */}
            {draft && !pending && (
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold text-[var(--c-ink)]">
                    <FileSignature size={16} className="text-[var(--c-accent)]" /> {draft.label} — draft
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={downloadPdf} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]">
                      <Printer size={13} /> PDF
                    </button>
                    <button onClick={downloadWord} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]">
                      <FileDown size={13} /> Word
                    </button>
                  </div>
                </div>

                {draft.missing.length > 0 && (
                  <div className="flex items-start gap-2 border-b border-[var(--c-border)] bg-[var(--c-error)]/5 px-4 py-2.5 text-xs text-[var(--c-ink-muted)]">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--c-error)]" />
                    <span>
                      <span className="font-semibold text-[var(--c-ink)]">{draft.missing.length}</span> field
                      {draft.missing.length === 1 ? "" : "s"} still blank — highlighted in the draft for the attorney to complete.
                    </span>
                  </div>
                )}

                <iframe title="Document preview" srcDoc={draft.html} className="h-[62vh] w-full rounded-b-xl border-0 bg-white" />
              </div>
            )}

            <p className="text-xs text-[var(--c-ink-muted)]">
              Drafts are scaffolds generated from the client&apos;s intake answers and must be reviewed and finalized by an attorney.
            </p>
          </div>
        )}
      </div>

      {sendOpen && selected && (
        <SendIntakeDialog key={selected.id} kind="estate" presetName={selected.name ?? ""} presetEmail={selected.email ?? ""} onClose={() => setSendOpen(false)} />
      )}
    </div>
  );
}
