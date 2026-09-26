"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  UploadCloud, FolderOpen, Inbox, Sparkles, Loader2, Pencil, Trash2, Download,
  FileText, Wand2, X, Check, Plus,
} from "lucide-react";
import {
  uploadBankTemplates, updateBankTemplate, deleteBankTemplate, aiSortInbox,
  getCaseFieldDefaults, generateBankDocument, type BankTemplate,
} from "@/app/admin/(panel)/documents/actions";

const DOC_TYPES = ["letter", "engagement-letter", "discovery-requests", "motion", "pleading", "notice", "agreement", "other"];

/**
 * The firm's template bank: practice-area folders, a "Drop templates here"
 * inbox that AI.fred can sort, and per-template Generate (form-builder path).
 * AI.fred reads this same bank from chat, so filing a template once serves
 * both a person browsing and the AI drafting.
 */
export function TemplateLibrary({ initial, folders: initialFolders, standardFields }: {
  initial: BankTemplate[];
  folders: string[];
  standardFields: { name: string; label: string }[];
}) {
  const [templates, setTemplates] = useState<BankTemplate[]>(initial);
  const [folders, setFolders] = useState<string[]>(initialFolders);
  const [active, setActive] = useState<string>("__all");
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; docType: string }>({ name: "", description: "", docType: "other" });
  const [genFor, setGenFor] = useState<BankTemplate | null>(null);
  // "Use AI?" confirmation: nothing spends GPU time without an explicit yes.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [srv, setSrv] = useState<{ configured: boolean; state?: string; costPerHr?: number; podCostPerHr?: number } | null>(null);
  const [waking, setWaking] = useState(false);

  async function openConfirm() {
    setConfirmOpen(true);
    setSrv(null);
    try {
      const res = await fetch("/api/admin/ai-server");
      setSrv(res.ok ? await res.json() : { configured: false });
    } catch {
      setSrv({ configured: false });
    }
  }

  async function wakeThenSort() {
    setWaking(true);
    try {
      await fetch("/api/admin/ai-server", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      // Poll until the model answers (up to ~6 minutes).
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        try {
          const res = await fetch("/api/admin/ai-server");
          const j = await res.json();
          setSrv(j);
          if (j.state === "ready") {
            setWaking(false);
            setConfirmOpen(false);
            await runAiSort();
            return;
          }
        } catch { /* keep polling */ }
      }
      setNote("The AI server didn't come up in time — check the AI.fred tab and try again.");
    } finally {
      setWaking(false);
    }
  }

  const inboxCount = templates.filter((t) => !t.folder).length;
  // Small lists — computed inline; the React Compiler memoizes renders itself.
  const visible = templates.filter((t) => (active === "__all" ? true : active === "__inbox" ? !t.folder : t.folder === active));
  const folderCounts = new Map<string, number>();
  templates.forEach((t) => { if (t.folder) folderCounts.set(t.folder, (folderCounts.get(t.folder) ?? 0) + 1); });

  const doUpload = useCallback(async (files: FileList | File[]) => {
    const fd = new FormData();
    [...files].forEach((f) => fd.append("files", f));
    setBusy(true);
    setNote(null);
    try {
      const r = await uploadBankTemplates(fd);
      if (!r.ok) { setNote(r.error); return; }
      setTemplates((t) => [...r.added, ...t]);
      setNote(`Added ${r.added.length} to the Inbox${r.skipped.length ? ` — skipped: ${r.skipped.join(", ")}` : ""}. Sort them yourself or let AI.fred do it.`);
      setActive("__inbox");
    } finally {
      setBusy(false);
    }
  }, []);

  async function runAiSort() {
    setSorting(true);
    setNote(null);
    try {
      const r = await aiSortInbox();
      if (!r.ok) { setNote(r.error); return; }
      setNote(`AI.fred filed ${r.sorted} template(s).${r.left.length ? ` Needs a human: ${r.left.join("; ")}` : ""}`);
      // Refresh from the server-truth by reloading the page data lazily:
      window.location.reload();
    } finally {
      setSorting(false);
    }
  }

  function startEdit(t: BankTemplate) {
    setEditing(t.id);
    setDraft({ name: t.name, description: t.description, docType: t.docType });
  }
  async function saveEdit(id: number) {
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, ...draft } : t)));
    setEditing(null);
    await updateBankTemplate(id, draft);
  }
  async function move(t: BankTemplate, folder: string) {
    if (folder === "__new") {
      const name = prompt("New folder name:")?.trim();
      if (!name) return;
      if (!folders.includes(name)) setFolders((f) => [...f, name]);
      folder = name;
    }
    setTemplates((ts) => ts.map((x) => (x.id === t.id ? { ...x, folder } : x)));
    await updateBankTemplate(t.id, { folder });
  }
  async function remove(t: BankTemplate) {
    if (!confirm(`Remove "${t.name}" from the bank?`)) return;
    setTemplates((ts) => ts.filter((x) => x.id !== t.id));
    await deleteBankTemplate(t.id);
  }

  return (
    <div className="mb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Template bank</h2>
        <span className="text-xs text-[var(--c-ink-muted)]">Real Word files — the form builder and AI.fred both draft from these.</span>
      </div>

      {/* Drop bucket */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void doUpload(e.dataTransfer.files); }}
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors ${dragOver ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] bg-[var(--c-surface)]"}`}
      >
        <UploadCloud size={22} className="text-[var(--c-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Drop templates here — your real documents, as they are</p>
          <p className="text-xs text-[var(--c-ink-muted)]">
            Past agreements, letters, filed motions — no preparation needed. AI.fred reads the old document, finds the names, dates, and case-specific facts, and adapts it to the new case the way a person would, keeping your formatting and verbiage. (.docx works best; if a document happens to contain <code className="rounded bg-[var(--c-surface-2)] px-1">{"{{fields}}"}</code> they auto-fill too, but that&apos;s optional.)
          </p>
        </div>
        <input ref={fileRef} type="file" multiple accept=".doc,.docx,.rtf,.odt" className="hidden" onChange={(e) => { if (e.target.files?.length) void doUpload(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-outline px-3 py-2 text-sm">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Choose files
        </button>
        {inboxCount > 0 && (
          <button onClick={() => void openConfirm()} disabled={sorting} className="btn btn-accent px-3 py-2 text-sm" title="AI.fred reads each inbox template and files it by practice area with a name, type, and description">
            {sorting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Let AI.fred sort {inboxCount}
          </button>
        )}
      </div>

      {note && <p className="mb-3 rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)] px-3 py-2 text-xs">{note}</p>}

      {/* Folder chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <FolderChip label="All" count={templates.length} active={active === "__all"} onClick={() => setActive("__all")} />
        <FolderChip label="Inbox" count={inboxCount} active={active === "__inbox"} onClick={() => setActive("__inbox")} icon={<Inbox size={12} />} highlight={inboxCount > 0} />
        {folders.map((f) => (
          <FolderChip key={f} label={f} count={folderCounts.get(f) ?? 0} active={active === f} onClick={() => setActive(f)} icon={<FolderOpen size={12} />} />
        ))}
      </div>

      {/* Templates */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          {templates.length === 0 ? "No templates yet — drop your Word files above to start the bank." : "Nothing in this folder yet."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <div key={t.id} className="flex flex-col rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3.5">
              {editing === t.id ? (
                <div className="space-y-2">
                  <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
                  <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} placeholder="Use this when…" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-xs" />
                  <div className="flex items-center gap-2">
                    <select value={draft.docType} onChange={(e) => setDraft((d) => ({ ...d, docType: e.target.value }))} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-xs">
                      {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button onClick={() => void saveEdit(t.id)} className="rounded p-1 text-green-600" title="Save"><Check size={15} /></button>
                    <button onClick={() => setEditing(null)} className="rounded p-1 text-[var(--c-ink-muted)]" title="Cancel"><X size={15} /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-start gap-2">
                    <FileText size={15} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{t.name}</span>
                    <button onClick={() => startEdit(t)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit name / description / type"><Pencil size={12} /></button>
                    <button onClick={() => void remove(t)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={12} /></button>
                  </div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--c-ink-muted)]">
                    <span className="rounded bg-[var(--c-surface-2)] px-1.5 py-0.5">{t.docType}</span>
                    {!t.isDocx && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">not .docx — AI can&apos;t fill it</span>}
                    {t.fields.length > 0 && <span>{t.fields.length} field{t.fields.length === 1 ? "" : "s"}</span>}
                  </div>
                  {t.description && <p className="mb-2 text-xs leading-snug text-[var(--c-ink-muted)]">{t.description}</p>}
                  <div className="mt-auto flex items-center gap-1.5 pt-1">
                    <button onClick={() => setGenFor(t)} disabled={!t.isDocx} className="btn btn-accent px-2.5 py-1.5 text-xs disabled:opacity-40" title="Fill this template from a matter">
                      <Wand2 size={12} /> Generate
                    </button>
                    {t.url && (
                      <a href={t.url} className="btn btn-outline px-2.5 py-1.5 text-xs" title="Download the blank template">
                        <Download size={12} /> Blank
                      </a>
                    )}
                    <select value={t.folder || ""} onChange={(e) => void move(t, e.target.value)} className="ml-auto max-w-[9rem] rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-1 text-[10px]" title="Move to folder">
                      <option value="">Inbox</option>
                      {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                      <option value="__new">+ New folder…</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {genFor && <GenerateDialog template={genFor} standardFields={standardFields} onClose={() => setGenFor(null)} />}

      {/* "Use AI?" gate: shows the server's live state and the rough cost
          before a single GPU second is spent. */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !waking && setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--c-accent)]" />
              <span className="font-[family-name:var(--font-display)] text-sm">Use AI.fred to sort {inboxCount} template{inboxCount === 1 ? "" : "s"}?</span>
            </div>
            <p className="mb-2 text-xs leading-relaxed text-[var(--c-ink-muted)]">
              This runs on the firm&apos;s AI server. Sorting {inboxCount} template{inboxCount === 1 ? "" : "s"} takes a minute or two of server time — a few cents, not dollars.
            </p>
            <p className="mb-4 text-xs">
              {srv == null ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]"><Loader2 size={12} className="animate-spin" /> Checking the server…</span>
              ) : !srv.configured ? (
                <span>Server controls aren&apos;t wired up yet — sorting will try the AI connection directly.</span>
              ) : srv.state === "ready" ? (
                <span className="font-medium text-green-700 dark:text-green-400">● Server is on (${(srv.costPerHr ?? 0).toFixed(2)}/hr) — no extra wake-up cost.</span>
              ) : srv.state === "starting" ? (
                <span className="font-medium text-amber-700 dark:text-amber-300">● Server is waking up — sorting will start when it&apos;s ready.</span>
              ) : (
                <span className="font-medium text-amber-700 dark:text-amber-300">● Server is asleep — it needs to wake first (~3 minutes, then auto-sleeps again after the idle timeout).</span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} disabled={waking} className="btn btn-outline px-3 py-1.5 text-sm">Cancel</button>
              {srv != null && srv.configured && (srv.state === "stopped" || srv.state === "starting") ? (
                <button onClick={() => void wakeThenSort()} disabled={waking} className="btn btn-accent px-4 py-1.5 text-sm">
                  {waking ? <span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Waking… then sorting</span> : "Wake server & sort"}
                </button>
              ) : (
                <button onClick={() => { setConfirmOpen(false); void runAiSort(); }} disabled={waking || srv == null} className="btn btn-accent px-4 py-1.5 text-sm">Yes, sort now</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderChip({ label, count, active, onClick, icon, highlight }: { label: string; count: number; active: boolean; onClick: () => void; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : highlight ? "border-amber-500/60 text-amber-700 dark:text-amber-300" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}`}
    >
      {icon} {label} <span className={active ? "opacity-80" : "opacity-60"}>{count}</span>
    </button>
  );
}

/** The form-builder path: matter → auto-fill → edit → download. */
function GenerateDialog({ template, standardFields, onClose }: { template: BankTemplate; standardFields: { name: string; label: string }[]; onClose: () => void }) {
  const [matter, setMatter] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [looking, setLooking] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [result, setResult] = useState<{ downloadPath: string; name: string; missing: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labels = useMemo(() => new Map(standardFields.map((f) => [f.name, f.label])), [standardFields]);

  async function lookup() {
    if (!matter.trim()) return;
    setLooking(true);
    try {
      const defaults = await getCaseFieldDefaults(matter);
      setValues((v) => {
        const next = { ...v };
        for (const f of template.fields) if (!next[f] && defaults[f]) next[f] = defaults[f];
        return next;
      });
    } finally {
      setLooking(false);
    }
  }

  async function generate() {
    setGenBusy(true);
    setError(null);
    try {
      const r = await generateBankDocument({ templateId: template.id, matter: matter.trim() || undefined, fields: values });
      if (!r.ok) { setError(r.error); return; }
      setResult({ downloadPath: r.downloadPath, name: r.name, missing: r.missingFields });
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-3">
          <Wand2 size={15} className="text-[var(--c-accent)]" />
          <span className="min-w-0 truncate font-[family-name:var(--font-display)] text-sm">Generate: {template.name}</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={15} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-semibold">Matter number (auto-fills case fields)</label>
              <input value={matter} onChange={(e) => setMatter(e.target.value)} onBlur={() => void lookup()} placeholder="e.g. 00042-Nelson" className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
            </div>
            <button onClick={() => void lookup()} disabled={looking || !matter.trim()} className="btn btn-outline px-3 py-2 text-sm">{looking ? <Loader2 size={14} className="animate-spin" /> : "Fill"}</button>
          </div>
          {template.fields.length === 0 && (
            <p className="text-xs text-[var(--c-ink-muted)]">
              This document has no fill-in fields, so this button just downloads a fresh copy. To adapt it to a case — new names, dates, and facts — ask <strong>AI.fred</strong>: e.g. &ldquo;use the {template.name} template for matter 00042-Nelson.&rdquo;
            </p>
          )}
          {template.fields.map((f) => (
            <div key={f}>
              <label className="mb-1 block text-xs font-semibold">{labels.get(f) ?? f} <code className="ml-1 rounded bg-[var(--c-surface-2)] px-1 text-[10px] font-normal">{`{{${f}}}`}</code></label>
              <input value={values[f] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {result && (
            <div className="rounded-md border border-green-600/40 bg-green-600/10 px-3 py-2 text-xs">
              <a href={result.downloadPath} className="font-semibold text-green-700 underline dark:text-green-400">Download {result.name}</a>
              {result.missing.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-300">Still blank in the document: {result.missing.join(", ")}</p>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3">
          <button onClick={onClose} className="btn btn-outline px-3 py-1.5 text-sm">Close</button>
          <button onClick={() => void generate()} disabled={genBusy} className="btn btn-accent px-4 py-1.5 text-sm">{genBusy ? <Loader2 size={14} className="animate-spin" /> : "Generate document"}</button>
        </div>
      </div>
    </div>
  );
}
