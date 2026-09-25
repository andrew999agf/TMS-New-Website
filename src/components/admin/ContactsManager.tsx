"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookUser, Check, Loader2, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, X } from "lucide-react";
import { createContact, updateContact, deleteContact, type ContactInput } from "@/app/admin/(panel)/contacts/actions";

export type ContactListRow = {
  id: number; kind: string; name: string; firm: string; side: string;
  email: string; phone: string; address: string; notes: string;
};

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export const CONTACT_KINDS: { key: string; label: string; chip: string }[] = [
  { key: "client-current", label: "Current client", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { key: "client-past", label: "Past client", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { key: "client-prospective", label: "Prospective client", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { key: "attorney", label: "Attorney", chip: "bg-[var(--c-accent)]/15 text-[var(--c-accent)]" },
  { key: "opposing-party", label: "Opposing party", chip: "bg-red-500/15 text-red-700 dark:text-red-300" },
  { key: "other", label: "Other", chip: "bg-[var(--c-border)] text-[var(--c-ink-muted)]" },
];
const kindDef = (k: string) => CONTACT_KINDS.find((c) => c.key === k) ?? CONTACT_KINDS[CONTACT_KINDS.length - 1];

const EMPTY: ContactInput & { id?: number } = { kind: "client-current", name: "", firm: "", side: "", email: "", phone: "", address: "", notes: "" };

export function ContactsManager({ rows }: { rows: ContactListRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<(ContactInput & { id?: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (filter !== "all" && r.kind !== filter) return false;
      if (!words.length) return true;
      const hay = `${r.name} ${r.firm} ${r.email} ${r.phone}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, filter]);

  function save() {
    if (!editing) return;
    start(async () => {
      const r = editing.id ? await updateContact(editing.id, editing) : await createContact(editing);
      if (r.ok) { setEditing(null); router.refresh(); }
      else setError(r.error ?? "Couldn't save.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, firm, email, phone…" className={`${input} pl-9`} />
        </div>
        <button onClick={() => { setError(null); setEditing({ ...EMPTY }); }} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4">
          <Plus size={15} /> New contact
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip label={`All (${rows.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
        {CONTACT_KINDS.map((k) => {
          const n = rows.filter((r) => r.kind === k.key).length;
          return <FilterChip key={k.key} label={`${k.label}s (${n})`} active={filter === k.key} onClick={() => setFilter(k.key)} />;
        })}
      </div>

      {shown.length === 0 && (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          {rows.length === 0 ? "No contacts yet. Attorneys typed into a case's party details are added here automatically." : "No contact matches."}
        </p>
      )}

      <div className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
        {shown.map((r) => {
          const k = kindDef(r.kind);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><BookUser size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-medium">{r.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.chip}`}>{k.label}</span>
                  {r.kind === "attorney" && r.side && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.side === "ours" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                      {r.side === "ours" ? "our side" : "opposing"}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--c-ink-muted)]">
                  {r.firm && <span>{r.firm}</span>}
                  {r.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {r.phone}</span>}
                  {r.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {r.email}</span>}
                  {r.address && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {r.address}</span>}
                </div>
              </div>
              <button onClick={() => { setError(null); setEditing({ id: r.id, kind: r.kind, name: r.name, firm: r.firm, side: r.side, email: r.email, phone: r.phone, address: r.address, notes: r.notes }); }}
                className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit contact"><Pencil size={14} /></button>
              <button onClick={() => { if (confirm(`Delete ${r.name} from the contact book?`)) start(async () => { await deleteContact(r.id); router.refresh(); }); }}
                className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-red-600" title="Delete contact"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !pending) setEditing(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-[family-name:var(--font-display)] text-lg">{editing.id ? "Edit contact" : "New contact"}</h3>
              <button onClick={() => setEditing(null)} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold">Type</span>
                  <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} className={input}>
                    {CONTACT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                </label>
                {editing.kind === "attorney" && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold">Side</span>
                    <select value={editing.side ?? ""} onChange={(e) => setEditing({ ...editing, side: e.target.value })} className={input}>
                      <option value="">—</option>
                      <option value="ours">On our side</option>
                      <option value="opposing">We go against</option>
                    </select>
                  </label>
                )}
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold">Name *</span>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} autoFocus />
              </label>
              {editing.kind === "attorney" && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold">Firm</span>
                  <input value={editing.firm ?? ""} onChange={(e) => setEditing({ ...editing, firm: e.target.value })} className={input} />
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold">Phone</span>
                  <input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold">Email</span>
                  <input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className={input} />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold">Address</span>
                <input value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold">Notes</span>
                <textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} className={input} />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
                <button onClick={save} disabled={pending || !editing.name.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save contact
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
      {label}
    </button>
  );
}