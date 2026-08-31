"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, Plus, Loader2, ChevronRight, X, Scale, FileText, Handshake, ListChecks } from "lucide-react";
import { addPortalCompany, removePortalCompany, createPortalMatter } from "@/app/admin/(panel)/case-portal/actions";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";
import { POSTURES } from "@/lib/portal";

export type CompanyRow = { id: number; name: string };
export type MatterRow = {
  id: number; title: string; companyId: number | null; companyName: string | null;
  clioMatter: string; posture: string; status: string; openTasks: number;
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

const POSTURE_META: Record<string, { label: string; icon: typeof Scale; cls: string }> = {
  litigation: { label: "Litigation", icon: Scale, cls: "bg-red-100 text-red-800" },
  "pre-litigation": { label: "Pre-Litigation", icon: FileText, cls: "bg-amber-100 text-amber-800" },
  transactional: { label: "Transactional", icon: Handshake, cls: "bg-emerald-100 text-emerald-800" },
};

/** A client group's page: its companies, and its matters split Open / Closed. */
export function CasePortalGroup({ groupId, companies, matters, clioMatters }: {
  groupId: number; companies: CompanyRow[]; matters: MatterRow[]; clioMatters: MatterOption[];
}) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [clio, setClio] = useState("");
  const [posture, setPosture] = useState<string>("transactional");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = matters.filter((m) => m.status === "open");
  const closed = matters.filter((m) => m.status !== "open");

  function addCompany() {
    const n = companyName.trim();
    if (!n) return;
    start(async () => { await addPortalCompany(groupId, n); setCompanyName(""); router.refresh(); });
  }

  function createMatter() {
    setError(null);
    start(async () => {
      const r = await createPortalMatter(groupId, { title, companyId: companyId ? Number(companyId) : null, clioMatter: clio, posture });
      if (!r.ok) { setError(r.error ?? "Couldn't create the matter."); return; }
      setTitle(""); setClio(""); setShowNew(false);
      router.push(`/admin/case-portal/${groupId}/matter/${r.id}`);
    });
  }

  return (
    <div className="space-y-6">
      {/* Companies in the group */}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Building2 size={15} className="text-[var(--c-accent)]" /> Companies in this group</p>
        <div className="flex flex-wrap items-center gap-2">
          {companies.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-1 text-sm text-[var(--c-ink)]">
              {c.name}
              <button onClick={() => { if (confirm(`Remove ${c.name} from the group? Its matters stay — they just detach from the company.`)) void removePortalCompany(c.id).then(() => router.refresh()); }} className="text-[var(--c-ink-muted)] hover:text-red-600" title="Remove company"><X size={12} /></button>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCompany(); }} placeholder="Add a company…" className={`${input} w-44 !py-1 text-sm`} />
            <button onClick={addCompany} disabled={pending || !companyName.trim()} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 disabled:opacity-40"><Plus size={14} /></button>
          </span>
        </div>
      </div>

      {/* New matter */}
      {showNew ? (
        <div className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4">
          <p className="mb-3 text-sm font-semibold">New matter</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Matter name</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., ABC Co. v. Vendor — supply contract" className={`${input} w-full`} /></label>
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Company</span>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${input} w-full`}>
                <option value="">— Group level (no single company) —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Clio matter <span className="opacity-70">(links the time tally)</span></span><MatterCombobox matters={clioMatters} value={clio} onChange={setClio} placeholder="Search matter…" /></label>
            <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Posture</span>
              <select value={posture} onChange={(e) => setPosture(e.target.value)} className={`${input} w-full`}>
                {POSTURES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={createMatter} disabled={pending || !title.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : "Create matter"}</button>
            <button onClick={() => setShowNew(false)} className="text-sm text-[var(--c-ink-muted)]">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNew(true)} className="btn btn-accent text-sm"><Plus size={15} /> New matter</button>
      )}

      <MatterList groupId={groupId} items={open} heading="Open matters" />
      <MatterList groupId={groupId} items={closed} heading="Closed matters" />
    </div>
  );
}

/** Matters split Open / Closed on the group page. */
function MatterList({ groupId, items, heading }: { groupId: number; items: MatterRow[]; heading: string }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-ink-muted)]">{heading} ({items.length})</h3>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--c-border)] p-4 text-center text-xs text-[var(--c-ink-muted)]">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((m) => {
            const pm = POSTURE_META[m.posture] ?? POSTURE_META.transactional;
            return (
              <li key={m.id}>
                <Link href={`/admin/case-portal/${groupId}/matter/${m.id}`} className="flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3.5 transition-colors hover:border-[var(--c-accent)]">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--c-surface-2)] text-[var(--c-accent)]"><Briefcase size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--c-ink)]">{m.title}</span>
                    <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                      {[m.companyName, m.clioMatter ? `Matter ${m.clioMatter}` : ""].filter(Boolean).join("  ·  ") || "—"}
                    </span>
                  </span>
                  {m.openTasks > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--c-accent)]"><ListChecks size={11} /> {m.openTasks}</span>
                  )}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pm.cls}`}>{pm.label}</span>
                  <ChevronRight size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
