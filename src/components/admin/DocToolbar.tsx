"use client";

import { useRef, useState, useTransition } from "react";
import {
  Braces, FileUp, ExternalLink, X, Copy, Check, Trash2, Loader2, FileText, Download,
} from "lucide-react";
import { uploadTemplate, removeTemplate } from "@/app/admin/(panel)/documents/actions";

type MergeField = { token: string; label: string };
type TemplateFile = { id: string; name: string; url: string; pathname: string; uploadedAt: string };

export function DocToolbar({
  mergeFields,
  initialTemplates,
  intakeUrl,
}: {
  mergeFields: MergeField[];
  initialTemplates: TemplateFile[];
  intakeUrl: string;
}) {
  const [open, setOpen] = useState<null | "fields" | "templates">(null);

  const chip =
    "inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button onClick={() => setOpen("fields")} className={chip}>
        <Braces size={14} /> Merge fields
      </button>
      <button onClick={() => setOpen("templates")} className={chip}>
        <FileUp size={14} /> My templates{initialTemplates.length ? ` (${initialTemplates.length})` : ""}
      </button>
      <a href={intakeUrl} target="_blank" rel="noopener noreferrer" className={chip}>
        <ExternalLink size={14} /> Enter an intake yourself
      </a>

      {open === "fields" && <MergeFieldsModal fields={mergeFields} onClose={() => setOpen(null)} />}
      {open === "templates" && <TemplatesModal initial={initialTemplates} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-[8vh]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--c-dark-bg)]/55 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--c-ink)]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MergeFieldsModal({ fields, onClose }: { fields: MergeField[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(token: string) {
    navigator.clipboard.writeText(`{{${token}}}`).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    });
  }
  return (
    <Modal title="Merge fields" onClose={onClose}>
      <div className="px-5 py-4">
        <p className="mb-3 text-sm text-[var(--c-ink-muted)]">
          Put these tokens in your Word template where the information should go. Copy one and paste it in — e.g.{" "}
          <code className="rounded bg-[var(--c-surface2)] px-1">{"{{testatorFullName}}"}</code>. Anything left blank
          becomes a clearly marked placeholder.
        </p>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-[var(--c-border)] divide-y divide-[var(--c-border)]">
          {fields.map((f) => (
            <div key={f.token} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <code className="text-xs text-[var(--c-accent)]">{`{{${f.token}}}`}</code>
                <div className="truncate text-xs text-[var(--c-ink-muted)]">{f.label}</div>
              </div>
              <button onClick={() => copy(f.token)} className="shrink-0 rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]" title="Copy token">
                {copied === f.token ? <Check size={14} className="text-[var(--c-accent)]" /> : <Copy size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TemplatesModal({ initial, onClose }: { initial: TemplateFile[]; onClose: () => void }) {
  const [list, setList] = useState<TemplateFile[]>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadTemplate(fd);
      if (res.ok) setList((l) => [res.template, ...l]);
      else setError(res.error ?? "Upload failed.");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function remove(id: string) {
    setList((l) => l.filter((t) => t.id !== id));
    start(async () => {
      await removeTemplate(id);
    });
  }

  return (
    <Modal title="My document templates" onClose={onClose}>
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-[var(--c-ink-muted)]">
          Upload your firm&apos;s own Word templates (.doc / .docx) to keep them here. Use the merge-field tokens in them
          so they&apos;re ready to fill from an intake.
        </p>

        <div>
          <input ref={fileRef} type="file" accept=".doc,.docx,.rtf,.odt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} Upload a template
          </button>
          {error && <p className="mt-2 text-sm text-[var(--c-error)]">{error}</p>}
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-[var(--c-ink-muted)]">No templates uploaded yet.</p>
        ) : (
          <div className="rounded-md border border-[var(--c-border)] divide-y divide-[var(--c-border)]">
            {list.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileText size={16} className="shrink-0 text-[var(--c-ink-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--c-ink)]">{t.name}</div>
                  <div className="text-xs text-[var(--c-ink-muted)]">{new Date(t.uploadedAt).toLocaleDateString()}</div>
                </div>
                <a href={t.url} target="_blank" rel="noopener noreferrer" download className="shrink-0 rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]" title="Download">
                  <Download size={14} />
                </a>
                <button onClick={() => remove(t.id)} className="shrink-0 rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-error)]" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
