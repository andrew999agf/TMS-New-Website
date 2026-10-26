"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, User, Plus, Loader2, ChevronRight, Archive, ArchiveRestore, Pencil, Check, X, ClipboardList, MessageSquare, Sparkles } from "lucide-react";
import { createPortalGroup, renamePortalGroup, archivePortalGroup, setupClientGroup } from "@/app/admin/(panel)/case-portal/actions";
import { FILE_KINDS } from "@/lib/portal";

export type GroupRow = {
  id: number; name: string; archived: boolean; kind: string; parentName: string;
  entities: string[]; open: number; closed: number;
  openRequests: number; overdue: number; unread: number;
};
export type SetupOption = { key: "manuel"; label: string; blurb: string };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

/**
 * Client files. Each is either a SINGLE client file (one person or one
 * company) or a MULTI-ENTITY client file: one parent person at the top who
 * owns or controls several entities, trusts or estates, each with its own
 * matters — reviewed and communicated with as one client.
 */
export function CasePortalGroups({ groups, setups = [] }: { groups: GroupRow[]; setups?: SetupOption[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"single" | "family">("single");
  const [parentName, setParentName] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = groups.filter((g) => (showArchived ? true : !g.archived));

  function create() {
    const n = name.trim();
    if (!n) return;
    if (kind === "family" && !parentName.trim()) { setError("Name the person at the top of this file."); return; }
    setError(null);
    start(async () => {
      const r = await createPortalGroup(n, { kind, parentName, parentContact });
      if (!r.ok) { setError(r.error ?? "Couldn't create the client file."); return; }
      setName(""); setParentName(""); setParentContact(""); setShowNew(false);
      router.push(`/admin/case-portal/${r.id}`);
    });
  }

  function runSetup(key: SetupOption["key"]) {
    setSetupMsg(null);
    start(async () => {
      const r = await setupClientGroup(key);
      if (!r.ok) { setSetupMsg(r.error); return; }
      setSetupMsg(r.created ? `Created ${r.created} matters.` : r.note ?? "Done.");
      router.push(`/admin/case-portal/${r.groupId}`);
    });
  }

  return (
    <div className="space-y-5">
      {/* One-click set-ups from outlines the firm handed over */}
      {setups.length > 0 && (
        <div className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-4" data-testid="setup-card">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={15} className="text-[var(--c-accent)]" /> Ready to set up</p>
          {setups.map((s) => (
            <div key={s.key} className="mt-2 flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1 text-sm"><strong>{s.label}</strong> <span className="text-[var(--c-ink-muted)]">— {s.blurb}</span></span>
              <button onClick={() => runSetup(s.key)} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Set it up</button>
            </div>
          ))}
          {setupMsg && <p className="mt-2 text-xs text-[var(--c-ink-muted)]">{setupMsg}</p>}
        </div>
      )}

      {/* New client file */}
      {showNew ? (
        <div className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4" data-testid="new-file">
          <p className="mb-3 text-sm font-semibold">New client file</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FILE_KINDS.map((k) => (
              <label key={k.id} className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${kind === k.id ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}>
                <input type="radio" name="kind" checked={kind === k.id} onChange={() => setKind(k.id)} className="mt-1 accent-[var(--c-accent)]" />
                <span><span className="block font-semibold">{k.label}</span><span className="block text-xs text-[var(--c-ink-muted)]">{k.blurb}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs sm:col-span-2"><span className="mb-1 block text-[var(--c-ink-muted)]">{kind === "family" ? "File name (your name for the whole relationship)" : "Client name"}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "family" ? 'e.g., "Michael Manuel Entities"' : "e.g., Jane Doe, or ABC Supply, LLC"} className={`${input} w-full`} /></label>
            {kind === "family" && (
              <>
                <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Parent — the person at the top</span>
                  <input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g., Michael Manuel" className={`${input} w-full`} /></label>
                <label className="text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">How to reach them (firm-only)</span>
                  <input value={parentContact} onChange={(e) => setParentContact(e.target.value)} placeholder="phone · email · via an assistant" className={`${input} w-full`} /></label>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">{kind === "family" ? "Next: add the entities under the parent (companies, trusts, estates), then the matters under each. The parent's own matters go under them directly." : "Next: add the client's matters. You can switch this to a multi-entity file later if more entities turn up."}</p>
          {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={create} disabled={pending || !name.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <><Plus size={15} /> Create client file</>}</button>
            <button onClick={() => setShowNew(false)} className="text-sm text-[var(--c-ink-muted)]">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNew(true)} className="btn btn-accent text-sm" data-testid="new-file-button"><Plus size={15} /> New client file</button>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--c-border)] p-6 text-center text-sm text-[var(--c-ink-muted)]">No client files yet.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => (
            <li key={g.id} className={`rounded-lg border bg-[var(--c-surface)] transition-colors ${g.archived ? "border-[var(--c-border)] opacity-60" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"}`}>
              <div className="flex items-center gap-3 p-4">
                {renaming === g.id ? (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { void renamePortalGroup(g.id, renameText).then(() => { setRenaming(null); router.refresh(); }); } if (e.key === "Escape") setRenaming(null); }} className={`${input} flex-1`} />
                    <button onClick={() => void renamePortalGroup(g.id, renameText).then(() => { setRenaming(null); router.refresh(); })} className="rounded p-1 text-green-600"><Check size={15} /></button>
                    <button onClick={() => setRenaming(null)} className="rounded p-1 text-[var(--c-ink-muted)]"><X size={15} /></button>
                  </span>
                ) : (
                  <Link href={`/admin/case-portal/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--c-accent)]/10 text-[var(--c-accent)]">{g.kind === "family" ? <Building2 size={17} /> : <User size={17} />}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-[family-name:var(--font-ui)] font-semibold text-[var(--c-ink)]">{g.name}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${g.kind === "family" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>{g.kind === "family" ? "Multi-entity file" : "Single client"}</span>
                      </span>
                      <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                        {g.kind === "family" ? `Parent: ${g.parentName || "—"} · ${g.entities.length ? g.entities.join(" · ") : "no entities yet"} · personal` : g.entities.length ? g.entities.join(" · ") : "—"}
                      </span>
                    </span>
                  </Link>
                )}
                <span className="hidden shrink-0 items-center gap-2 text-xs text-[var(--c-ink-muted)] sm:flex">
                  {g.unread > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--c-accent)] px-2 py-0.5 font-semibold text-white" title="Unread messages from the client"><MessageSquare size={11} /> {g.unread}</span>}
                  {g.openRequests > 0 && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${g.overdue ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`} title="Documents still requested from the client"><ClipboardList size={11} /> {g.openRequests}{g.overdue ? ` · ${g.overdue} overdue` : ""}</span>}
                  <span><strong className="text-[var(--c-ink)]">{g.open}</strong> open · {g.closed} closed</span>
                </span>
                <button onClick={() => { setRenaming(g.id); setRenameText(g.name); }} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename"><Pencil size={14} /></button>
                <button onClick={() => void archivePortalGroup(g.id, !g.archived).then(() => router.refresh())} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title={g.archived ? "Unarchive" : "Archive"}>
                  {g.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
                <Link href={`/admin/case-portal/${g.id}`} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronRight size={16} /></Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {groups.some((g) => g.archived) && (
        <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          {showArchived ? "Hide archived files" : `Show archived files (${groups.filter((g) => g.archived).length})`}
        </button>
      )}
    </div>
  );
}
