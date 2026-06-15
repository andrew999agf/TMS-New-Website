"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X, Mail, AlertTriangle } from "lucide-react";
import {
  saveRecipient,
  deleteRecipient,
  toggleRecipient,
  type RecipientInput,
} from "@/app/admin/(panel)/intake/recipients-actions";
import type { IntakeRecipientView } from "@/lib/content";

type Branch = { id: string; label: string };

export function IntakeRecipientsManager({
  initial,
  branches,
  dbEnabled,
  emailConfigured,
  senderFrom,
}: {
  initial: IntakeRecipientView[];
  branches: Branch[];
  dbEnabled: boolean;
  emailConfigured: boolean;
  senderFrom: string;
}) {
  const [editing, setEditing] = useState<IntakeRecipientView | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const branchLabel = (id: string) => branches.find((b) => b.id === id)?.label ?? id;

  return (
    <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 mb-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-ui)] font-semibold flex items-center gap-2">
            <Mail size={16} className="text-[var(--c-accent)]" /> Who gets emailed
          </h2>
          <p className="text-sm text-[var(--c-ink-muted)] mt-1">
            When someone submits a consultation request, a copy (with a CSV attachment) is emailed
            to everyone below. Leaving a person&apos;s intake types unchecked means they get
            <strong> every</strong> submission.
          </p>
        </div>
        {editing === null && (
          <button onClick={() => setEditing("new")} disabled={!dbEnabled} className="btn btn-accent text-sm py-2 px-3 shrink-0 disabled:opacity-50">
            <Plus size={15} /> Add
          </button>
        )}
      </div>

      {/* Sending-status banner */}
      <div className={`mt-4 text-xs rounded-md px-3 py-2 flex items-start gap-2 ${emailConfigured ? "bg-[var(--c-surface2)] text-[var(--c-ink-muted)]" : "bg-[#fdecea] text-[#8a1f12]"}`}>
        {emailConfigured ? (
          <><Check size={14} className="mt-0.5 shrink-0" /> <span>Sending is configured. Notifications send from <strong>{senderFrom}</strong>.</span></>
        ) : (
          <><AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>Email sending isn&apos;t connected yet. Submissions are still saved below, but no email goes out until the Google Workspace mailbox (<strong>{senderFrom}</strong>) is connected in the site&apos;s settings. Ask your developer to set <code>SMTP_USER</code> / <code>SMTP_PASS</code>.</span></>
        )}
      </div>

      {editing === "new" && (
        <RecipientForm branches={branches} onClose={() => setEditing(null)} />
      )}

      <div className="mt-4 divide-y divide-[var(--c-border)]">
        {initial.map((r) =>
          editing !== null && editing !== "new" && editing.id === r.id ? (
            <RecipientForm key={r.id} initial={r} branches={branches} onClose={() => setEditing(null)} />
          ) : (
            <div key={r.id} className={`py-3 flex items-center justify-between gap-3 ${r.active ? "" : "opacity-50"}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {r.email}
                  {r.name ? <span className="text-[var(--c-ink-muted)] font-normal"> · {r.name}</span> : null}
                </div>
                <div className="text-xs text-[var(--c-ink-muted)] mt-0.5">
                  {r.branches.length === 0 ? "All intake types" : r.branches.map(branchLabel).join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={(e) => startTransition(() => { void toggleRecipient(r.id, e.target.checked); })}
                    disabled={pending}
                    className="accent-[var(--c-accent)]"
                  />
                  On
                </label>
                <button onClick={() => setEditing(r)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={15} /></button>
                <button onClick={() => { if (confirm(`Remove ${r.email} from intake notifications?`)) startTransition(() => { void deleteRecipient(r.id); }); }} disabled={pending} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]" title="Remove"><Trash2 size={15} /></button>
              </div>
            </div>
          ),
        )}
        {initial.length === 0 && (
          <p className="py-4 text-sm text-[var(--c-ink-muted)]">
            No recipients yet — add at least one so submissions get emailed.
          </p>
        )}
      </div>
    </section>
  );
}

function RecipientForm({
  initial,
  branches,
  onClose,
}: {
  initial?: IntakeRecipientView;
  branches: Branch[];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.branches ?? []);
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  function toggleBranch(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function save() {
    const input: RecipientInput = { id: initial?.id, name, email, branches: selected, active };
    startTransition(async () => {
      const res = await saveRecipient(input);
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed");
    });
  }

  return (
    <div className="py-4 border-y border-[var(--c-accent)] my-2 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{initial ? "Edit recipient" : "Add recipient"}</span>
        <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={16} /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--c-ink-muted)] mb-1">Email *</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@texaslawsmith.com" className={cls} />
        </div>
        <div>
          <label className="block text-xs text-[var(--c-ink-muted)] mb-1">Label (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Probate, Civil Admin" className={cls} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--c-ink-muted)] mb-1.5">
          Which intake types should this person receive? <span className="italic">(none checked = all of them)</span>
        </label>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleBranch(b.id)} className="accent-[var(--c-accent)]" />
              {b.label}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--c-accent)]" />
        Active (receives emails)
      </label>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending || !email.trim()} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50"><Check size={15} /> Save</button>
        <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
      </div>
    </div>
  );
}
