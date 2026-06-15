"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Download, ChevronDown, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import { updateIntakeStatus, setIntakeArchived } from "@/app/admin/(panel)/intake/actions";

export type IntakeRow = {
  id: number;
  branch: string;
  practiceSlug: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  county: string | null;
  isUrgent: boolean;
  deadline: string | null;
  status: "new" | "contacted" | "scheduled" | "declined";
  archived: boolean;
  createdAt: string;
  answers: Record<string, unknown>;
};

const STATUSES = ["new", "contacted", "scheduled", "declined"] as const;

export function IntakeTable({ rows }: { rows: IntakeRow[] }) {
  const [status, setStatus] = useState<string>("all");
  const [practice, setPractice] = useState<string>("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [view, setView] = useState<"active" | "archived">("active");
  const [open, setOpen] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const practices = useMemo(
    () => [...new Set(rows.map((r) => r.practiceSlug).filter(Boolean))] as string[],
    [rows],
  );

  const archivedCount = useMemo(() => rows.filter((r) => r.archived).length, [rows]);

  const filtered = rows.filter((r) => {
    if ((view === "archived") !== Boolean(r.archived)) return false;
    if (status !== "all" && r.status !== status) return false;
    if (practice !== "all" && r.practiceSlug !== practice) return false;
    if (urgentOnly && !r.isUrgent) return false;
    return true;
  });

  function exportCsv() {
    const headers = ["id", "createdAt", "branch", "practice", "name", "email", "phone", "county", "urgent", "deadline", "status"];
    const escape = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push(
        [r.id, r.createdAt, r.branch, r.practiceSlug ?? "", r.name ?? "", r.email ?? "", r.phone ?? "", r.county ?? "", r.isUrgent ? "yes" : "no", r.deadline ?? "", r.status]
          .map((v) => escape(String(v)))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intake-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setRowStatus(id: number, s: IntakeRow["status"]) {
    startTransition(() => {
      void updateIntakeStatus(id, s);
    });
  }

  function archiveRow(id: number, archived: boolean) {
    startTransition(() => {
      void setIntakeArchived(id, archived);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Select value={status} onChange={setStatus} label="Status" options={["all", ...STATUSES]} />
        <Select value={practice} onChange={setPractice} label="Practice" options={["all", ...practices]} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} className="accent-[var(--c-accent)]" />
          Urgent only
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportCsv} className="btn btn-outline text-sm py-2 px-3">
            <Download size={15} /> Export CSV ({filtered.length})
          </button>
          {view === "active" ? (
            <button onClick={() => { setView("archived"); setOpen(null); }} className="btn btn-outline text-sm py-2 px-3">
              <Archive size={15} /> Archive ({archivedCount})
            </button>
          ) : (
            <button onClick={() => { setView("active"); setOpen(null); }} className="btn btn-accent text-sm py-2 px-3">
              <ArrowLeft size={15} /> Back to active
            </button>
          )}
        </div>
      </div>

      {view === "archived" && (
        <p className="mb-4 text-sm text-[var(--c-ink-muted)] flex items-center gap-2">
          <Archive size={14} /> Viewing archived submissions. Use the restore button on a row to bring it back.
        </p>
      )}

      <div className="rounded-lg border border-[var(--c-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--c-surface2)] text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Matter</th>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-border)]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--c-ink-muted)]">
                  No submissions.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr className="bg-[var(--c-surface)] hover:bg-[var(--c-surface2)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.isUrgent && <span className="h-2 w-2 rounded-full bg-[var(--c-error)]" />}
                      <span className="font-medium">{r.name ?? "—"}</span>
                    </div>
                    <div className="text-xs text-[var(--c-ink-muted)]">{r.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.branch}</div>
                    <div className="text-xs text-[var(--c-ink-muted)]">{r.county}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--c-ink-muted)]">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      onChange={(e) => setRowStatus(r.id, e.target.value as IntakeRow["status"])}
                      disabled={pending}
                      className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1 text-xs capitalize"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => archiveRow(r.id, !r.archived)}
                        disabled={pending}
                        title={r.archived ? "Restore to active" : "Archive"}
                        className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
                      >
                        {r.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                      <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-label="Toggle detail">
                        <ChevronDown size={16} className={open === r.id ? "rotate-180 transition-transform" : "transition-transform"} />
                      </button>
                    </div>
                  </td>
                </tr>
                {open === r.id && (
                  <tr className="bg-[var(--c-surface2)]">
                    <td colSpan={5} className="px-4 py-4">
                      <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                        {Object.entries(r.answers).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="text-[var(--c-ink-muted)] min-w-32">{k}</dt>
                            <dd>{Array.isArray(v) ? v.join(", ") : String(v ?? "")}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--c-ink-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 capitalize"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
