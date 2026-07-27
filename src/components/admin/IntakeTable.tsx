"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, ChevronsRight, Archive, ArchiveRestore, ArrowLeft, Pencil, X, Check, Send, Mail } from "lucide-react";
import { updateIntakeStatus, setIntakeArchived, setIntakeReferral } from "@/app/admin/(panel)/intake/actions";
import { SendIntakeDialog } from "@/components/admin/SendIntakeRequest";
import { LeadDetailDrawer, TurnbackDialog } from "@/components/admin/IntakeLeadPanels";
import type { ReferralAttorneyRow } from "@/components/admin/ReferralAttorneysManager";

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
  status: "new" | "contacted" | "scheduled" | "declined" | "referred-out" | "client-declined";
  archived: boolean;
  referredTo: string | null;
  feeExpected: boolean;
  feeAmount: string | null;
  createdAt: string;
  /** Notification email outcome: "sent" or "failed: <reason>" (null = before tracking). */
  emailStatus: string | null;
  /** Saved-progress estate questionnaire that was never finished. */
  incomplete: boolean;
  answers: Record<string, unknown>;
};

const STATUSES = ["new", "contacted", "scheduled", "declined", "referred-out", "client-declined"] as const;
const STATUS_LABEL: Record<string, string> = {
  all: "all", new: "New", contacted: "Contacted", scheduled: "Scheduled", declined: "Declined", "referred-out": "Referred Out", "client-declined": "Client Declined",
};

/** Human label for the Status column / CSV — referrals show the attorney + fee. */
function statusLabel(r: IntakeRow): string {
  if (r.status !== "referred-out") return STATUS_LABEL[r.status] ?? r.status;
  const fee = r.feeExpected ? `fee ${r.feeAmount ? r.feeAmount : "expected"}` : "no fee";
  return `Referred Out — ${r.referredTo ?? "?"} (${fee})`;
}

export function IntakeTable({ rows, attorneys, referralAttorneys }: { rows: IntakeRow[]; attorneys: string[]; referralAttorneys: ReferralAttorneyRow[] }) {
  const [status, setStatus] = useState<string>("all");
  const [practice, setPractice] = useState<string>("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [view, setView] = useState<"active" | "archived">("active");
  const [detailFor, setDetailFor] = useState<IntakeRow | null>(null);
  const [turnbackFor, setTurnbackFor] = useState<IntakeRow | null>(null);
  const [referralFor, setReferralFor] = useState<IntakeRow | null>(null);
  const [sendFor, setSendFor] = useState<IntakeRow | null>(null);
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
        [r.id, r.createdAt, r.branch, r.practiceSlug ?? "", r.name ?? "", r.email ?? "", r.phone ?? "", r.county ?? "", r.isUrgent ? "yes" : "no", r.deadline ?? "", statusLabel(r)]
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

  function onStatusChange(r: IntakeRow, value: string) {
    if (value === "referred-out") {
      setReferralFor(r); // open the modal; nothing saved until they confirm
      return;
    }
    startTransition(() => { void updateIntakeStatus(r.id, value as IntakeRow["status"]); });
  }

  function archiveRow(id: number, archived: boolean) {
    startTransition(() => { void setIntakeArchived(id, archived); });
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
            <button onClick={() => { setView("archived"); setDetailFor(null); }} className="btn btn-outline text-sm py-2 px-3">
              <Archive size={15} /> Archive ({archivedCount})
            </button>
          ) : (
            <button onClick={() => { setView("active"); setDetailFor(null); }} className="btn btn-accent text-sm py-2 px-3">
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
              <tr
                key={r.id}
                onClick={() => setDetailFor(r)}
                title="Click to view the full intake"
                className="cursor-pointer bg-[var(--c-surface)] hover:bg-[var(--c-surface2)]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.isUrgent && <span className="h-2 w-2 rounded-full bg-[var(--c-error)]" />}
                    <span className="font-medium">{r.name ?? "—"}</span>
                    {r.incomplete && (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600" title="Started the comprehensive estate questionnaire but hasn't finished">
                        Incomplete
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--c-ink-muted)] break-all">{r.email}</div>
                  {r.email && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTurnbackFor(r); }}
                        title="Send a turn-back / decline email to this person"
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-[var(--c-on-accent)]"
                      >
                        <Mail size={13} /> Turn-back email
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSendFor(r); }}
                        title={`Send an estate-planning intake to ${r.email}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
                      >
                        <Send size={13} /> Send intake
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div>{r.branch}</div>
                  <div className="text-xs text-[var(--c-ink-muted)]">{r.county}</div>
                </td>
                <td className="px-4 py-3 text-[var(--c-ink-muted)]">
                  {new Date(r.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={r.status}
                    onChange={(e) => onStatusChange(r, e.target.value)}
                    disabled={pending}
                    className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  {r.status === "referred-out" && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]">
                      <span>→ {r.referredTo ?? "?"}{r.feeExpected ? ` · fee ${r.feeAmount || "expected"}` : " · no fee"}</span>
                      <button onClick={() => setReferralFor(r)} title="Edit referral" className="hover:text-[var(--c-accent)]"><Pencil size={12} /></button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => archiveRow(r.id, !r.archived)}
                      disabled={pending}
                      title={r.archived ? "Restore to active" : "Archive"}
                      className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
                    >
                      {r.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                    <button onClick={() => setDetailFor(r)} title="View full intake" className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
                      <ChevronsRight size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeadDetailDrawer row={detailFor} onClose={() => setDetailFor(null)} onTurnback={(r) => { setDetailFor(null); setTurnbackFor(r); }} />

      {turnbackFor && (
        <TurnbackDialog key={turnbackFor.id} row={turnbackFor} attorneys={referralAttorneys} onClose={() => setTurnbackFor(null)} />
      )}

      {referralFor && (
        <ReferralModal row={referralFor} attorneys={attorneys} onClose={() => setReferralFor(null)} />
      )}

      {sendFor && (
        <SendIntakeDialog
          key={sendFor.id}
          kind="estate"
          presetName={sendFor.name ?? ""}
          presetEmail={sendFor.email ?? ""}
          onClose={() => setSendFor(null)}
        />
      )}
    </div>
  );
}

function ReferralModal({ row, attorneys, onClose }: { row: IntakeRow; attorneys: string[]; onClose: () => void }) {
  const [name, setName] = useState(row.referredTo ?? "");
  const [fee, setFee] = useState(row.feeExpected);
  const [amount, setAmount] = useState(row.feeAmount ?? "");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = name.trim()
    ? attorneys.filter((a) => a.toLowerCase().includes(name.toLowerCase()) && a.toLowerCase() !== name.toLowerCase())
    : attorneys;

  function save() {
    if (!name.trim()) { setError("Enter the attorney's name."); return; }
    startTransition(async () => {
      const res = await setIntakeReferral(row.id, { referredTo: name.trim(), feeExpected: fee, feeAmount: amount });
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed.");
    });
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--c-surface)] rounded-lg w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-[family-name:var(--font-display)] text-lg">Refer out</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
        </div>

        <label className="block text-sm font-medium mb-1.5">Attorney the case was referred to</label>
        <div className="relative">
          <div className="flex items-center border border-[var(--c-border)] bg-[var(--c-bg)] rounded focus-within:border-[var(--c-accent)]">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setOpen(true); setError(null); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Start typing a name…"
              className="w-full bg-transparent p-2.5 text-sm outline-none"
              autoFocus
            />
            {name && (
              <button onMouseDown={(e) => { e.preventDefault(); setName(""); }} title="Clear" className="px-2 text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><X size={15} /></button>
            )}
          </div>
          {open && matches.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
              {matches.map((a) => (
                <div key={a} onMouseDown={(e) => { e.preventDefault(); setName(a); setOpen(false); }} className="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--c-surface2)]">
                  {a}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <span className="block text-sm font-medium mb-1.5">Is a fee expected?</span>
          <div className="flex gap-2">
            {[["Yes", true], ["No", false]].map(([label, val]) => (
              <button
                key={label as string}
                onClick={() => setFee(val as boolean)}
                className={`px-5 py-2 text-sm rounded-md border ${fee === val ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {fee && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1.5">Expected fee amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]" />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-[var(--c-error)]">{error}</p>}
        <div className="mt-6 flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50"><Check size={15} /> Save</button>
        </div>
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
          <option key={o} value={o}>{STATUS_LABEL[o] ?? o}</option>
        ))}
      </select>
    </label>
  );
}
