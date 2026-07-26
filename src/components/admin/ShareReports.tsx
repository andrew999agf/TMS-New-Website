"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, FileText, Download, Archive, ArchiveRestore, Trash2, ListChecks, FolderUp, Send, Eye } from "lucide-react";
import { reportKindLabel, type ShareReportConfig } from "@/lib/share/reports-config";
import { saveReportConfig, generateReportNow, sendReportTest, setReportArchived, deleteReport } from "@/app/admin/(panel)/share-folders/reports/actions";

export type ReportRow = {
  id: number;
  kind: string;
  title: string;
  pdfUrl: string | null;
  summary: Record<string, unknown>;
  archived: boolean;
  createdAt: string;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function summaryLine(r: ReportRow): string {
  const s = r.summary || {};
  if (r.kind === "documents") return `${s.count ?? 0} document(s) · ${s.folderCount ?? 0} folder(s)`;
  return `${s.overdue ?? 0} overdue · ${s.open ?? 0} open · ${s.done ?? 0} done`;
}

export function ShareReports({ config, reports }: { config: ShareReportConfig; reports: ReportRow[] }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<ShareReportConfig>(config);
  const [recips, setRecips] = useState((config.recipients ?? []).join(", "));
  const [saving, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(null), 3500); };

  function save() {
    start(async () => {
      const res = await saveReportConfig({ ...cfg, recipients: recips.split(",").map((s) => s.trim()).filter(Boolean) });
      flash(res.ok ? "Settings saved." : res.error ?? "Couldn't save.");
      router.refresh();
    });
  }

  async function genNow(kind: "todos" | "documents") {
    setBusy(kind);
    const res = await generateReportNow(kind);
    setBusy(null);
    flash(res.ok ? `${reportKindLabel(kind)} report generated.` : res.error ?? "Couldn't generate.");
    router.refresh();
  }

  async function test() {
    setBusy("test");
    const res = await sendReportTest();
    setBusy(null);
    flash(res.ok ? `Test sent to ${res.to}.` : res.error ?? "Couldn't send test.");
    router.refresh();
  }

  async function archive(id: number, archived: boolean) {
    await setReportArchived(id, archived);
    router.refresh();
  }
  async function remove(id: number) {
    if (!confirm("Delete this report permanently?")) return;
    await deleteReport(id);
    router.refresh();
  }

  const active = reports.filter((r) => !r.archived);
  const archived = reports.filter((r) => r.archived);
  const btn = "inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-3 py-1.5 text-sm hover:bg-[var(--c-surface2)] disabled:opacity-50";

  return (
    <div className="space-y-6">
      {/* Config + generate */}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
        <p className="text-sm font-semibold">Monthly review email</p>
        <p className="mt-0.5 mb-3 text-xs text-[var(--c-ink-muted)]">On the 1st of each month, the system emails a review of your drop folders, open to-do tasks, and documents uploaded last month — each as a PDF — and files them below.</p>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Send the monthly review email
        </label>
        <div className="mt-2 pl-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.includeTodos} onChange={(e) => setCfg({ ...cfg, includeTodos: e.target.checked })} /><ListChecks size={14} className="text-[var(--c-accent)]" /> Include the to-do items &amp; ticklers report</label>
          <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.includeDocuments} onChange={(e) => setCfg({ ...cfg, includeDocuments: e.target.checked })} /><FolderUp size={14} className="text-[var(--c-accent)]" /> Include the documents-uploaded report</label>
          <label className="mt-3 block text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">Send to (comma-separated emails — leave blank to send to all admins)</span>
            <input value={recips} onChange={(e) => setRecips(e.target.value)} placeholder="max@texaslawsmith.com, office@texaslawsmith.com" className="w-full max-w-lg rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={saving} className="btn btn-accent inline-flex items-center gap-1.5 text-sm disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save settings</button>
          <span className="mx-1 h-5 w-px bg-[var(--c-border)]" />
          <button onClick={() => genNow("todos")} disabled={busy !== null} className={btn}>{busy === "todos" ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} Generate to-do report now</button>
          <button onClick={() => genNow("documents")} disabled={busy !== null} className={btn}>{busy === "documents" ? <Loader2 size={14} className="animate-spin" /> : <FolderUp size={14} />} Generate documents report now</button>
          <button onClick={test} disabled={busy !== null} className={btn}>{busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test to me</button>
        </div>
        {note && <p className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--c-accent)]"><Check size={13} /> {note}</p>}
      </div>

      {/* Report list */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--c-ink)]">Reports ({active.length})</h3>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--c-border)] px-4 py-8 text-center text-sm text-[var(--c-ink-muted)]">No reports yet. Generate one above, or wait for the monthly email.</p>
        ) : (
          <ul className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)]">
            {active.map((r) => <ReportRowItem key={r.id} r={r} onArchive={archive} onDelete={remove} />)}
          </ul>
        )}

        {archived.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowArchived((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
              <Archive size={12} /> Archived reports ({archived.length}) {showArchived ? "▾" : "▸"}
            </button>
            {showArchived && (
              <ul className="mt-2 divide-y divide-[var(--c-border)] rounded-lg border border-dashed border-[var(--c-border)]">
                {archived.map((r) => <ReportRowItem key={r.id} r={r} onArchive={archive} onDelete={remove} />)}
              </ul>
            )}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Reports archive automatically after six months.</p>
      </div>
    </div>
  );
}

function ReportRowItem({ r, onArchive, onDelete }: { r: ReportRow; onArchive: (id: number, a: boolean) => void; onDelete: (id: number) => void }) {
  const Icon = r.kind === "documents" ? FolderUp : ListChecks;
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 p-3 ${r.archived ? "opacity-60" : ""}`}>
      <Icon size={16} className="shrink-0 text-[var(--c-accent)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--c-ink)]">{r.title}</p>
        <p className="text-[11px] text-[var(--c-ink-muted)]">{fmtDate(r.createdAt)} · {summaryLine(r)}</p>
      </div>
      {r.pdfUrl ? (
        <>
          <a href={`${r.pdfUrl}`} target="_blank" rel="noopener noreferrer" title="Preview" className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><Eye size={13} /> Preview</a>
          <a href={`${r.pdfUrl}`} download title="Download" className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10"><Download size={13} /> Download</a>
        </>
      ) : (
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-[var(--c-ink-muted)]"><FileText size={13} /> PDF not stored</span>
      )}
      <button onClick={() => onArchive(r.id, !r.archived)} title={r.archived ? "Restore" : "Archive"} className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
        {r.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
      </button>
      <button onClick={() => onDelete(r.id)} title="Delete" className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={14} /></button>
    </li>
  );
}
