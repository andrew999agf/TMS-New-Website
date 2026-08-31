"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus, Loader2, ChevronRight, Archive, ArchiveRestore, Pencil, Check, X } from "lucide-react";
import { createPortalGroup, renamePortalGroup, archivePortalGroup } from "@/app/admin/(panel)/case-portal/actions";

export type GroupRow = { id: number; name: string; archived: boolean; companies: string[]; open: number; closed: number };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

/**
 * Enterprise groups — one per business client, custom-named, each holding that
 * client's companies (a manager with ABC Company and XYZ Company gets ONE group
 * with both inside). Click through to the group's matters.
 */
export function CasePortalGroups({ groups }: { groups: GroupRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [pending, start] = useTransition();

  const visible = groups.filter((g) => (showArchived ? true : !g.archived));

  function create() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    start(async () => {
      const r = await createPortalGroup(n);
      if (!r.ok) { setError(r.error ?? "Couldn't create the group."); return; }
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Create */}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Building2 size={15} className="text-[var(--c-accent)]" /> New enterprise group</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder='e.g., "Jones Companies" — your name for this client, not a legal entity' className={`${input} min-w-[280px] flex-1`} />
          <button onClick={create} disabled={pending || !name.trim()} className="btn btn-accent text-sm disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" /> : <><Plus size={15} /> Create</>}</button>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--c-ink-muted)]">One group per client relationship. Add each of their companies inside the group, then create matters under the companies.</p>
        {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--c-border)] p-6 text-center text-sm text-[var(--c-ink-muted)]">No client groups yet. Create one above for a business client with matters worth a portal.</p>
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
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><Building2 size={17} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-[family-name:var(--font-ui)] font-semibold text-[var(--c-ink)]">{g.name}</span>
                      <span className="block truncate text-xs text-[var(--c-ink-muted)]">
                        {g.companies.length ? g.companies.join(" · ") : "No companies yet"}
                      </span>
                    </span>
                  </Link>
                )}
                <span className="hidden shrink-0 text-xs text-[var(--c-ink-muted)] sm:block">
                  <strong className="text-[var(--c-ink)]">{g.open}</strong> open · {g.closed} closed
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
          {showArchived ? "Hide archived groups" : `Show archived groups (${groups.filter((g) => g.archived).length})`}
        </button>
      )}
    </div>
  );
}
