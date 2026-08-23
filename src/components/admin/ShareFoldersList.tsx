"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Archive, ArchiveRestore, FileText, Users, Loader2, FolderPlus } from "lucide-react";
import { SHARE_TYPES, shareType, audienceStyle, FOLDER_SORTS, type FolderSort } from "@/lib/share/types";
import { compareNatural } from "@/lib/share/sort";
import { createFolder, archiveFolder } from "@/app/admin/(panel)/share-folders/actions";
import { MatterCombobox, type MatterOption } from "./MatterCombobox";

export type FolderRow = {
  id: number;
  caseNumber: string;
  name: string; // client name
  matter: string;
  court: string;
  type: string;
  archived: boolean;
  updatedAt: string;
  fileCount: number;
  recipientCount: number;
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export function ShareFoldersList({ folders, matters }: { folders: FolderRow[]; matters: MatterOption[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<FolderSort>("updated");
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = folders.filter((f) => f.archived === showArchived);
    if (typeFilter) out = out.filter((f) => f.type === typeFilter);
    if (needle) out = out.filter((f) => `${f.caseNumber} ${f.name} ${f.matter} ${f.court} ${shareType(f.type).label}`.toLowerCase().includes(needle));
    // Every name/case/type ordering is natural alphanumeric, and ties fall back
    // to the folder name so the list never shuffles between renders.
    const by: Record<FolderSort, (a: FolderRow, b: FolderRow) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || compareNatural(a.name, b.name),
      case: (a, b) => compareNatural(a.caseNumber, b.caseNumber) || compareNatural(a.name, b.name),
      name: (a, b) => compareNatural(a.name, b.name),
      type: (a, b) => compareNatural(shareType(a.type).short, shareType(b.type).short) || compareNatural(a.name, b.name),
    };
    return [...out].sort(by[sort]);
  }, [folders, q, typeFilter, showArchived, sort]);

  const archivedCount = folders.filter((f) => f.archived).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case #, client, type…" className={`${input} w-full pl-8`} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={input}>
          <option value="">All types</option>
          {SHARE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as FolderSort)} className={input}>
          {FOLDER_SORTS.map((s) => (
            <option key={s.key} value={s.key}>Sort: {s.label}</option>
          ))}
        </select>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${showArchived ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"}`}
        >
          <Archive size={15} /> Archived{archivedCount ? ` (${archivedCount})` : ""}
        </button>
        <button onClick={() => setCreating((v) => !v)} className="btn btn-accent inline-flex items-center gap-1.5 text-sm">
          <Plus size={15} /> New folder
        </button>
      </div>

      {creating && <NewFolderForm matters={matters} onDone={(id) => { setCreating(false); if (id) router.push(`/admin/share-folders/${id}`); }} />}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--c-ink-muted)]">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Goes to the other side</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Client</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Your side (co-counsel/expert)</span>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--c-border)] p-10 text-center text-sm text-[var(--c-ink-muted)]">
          {showArchived ? "No archived folders." : "No folders yet. Click “New folder” to create your first secure share."}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((f) => (
            <FolderCard key={f.id} f={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FolderCard({ f }: { f: FolderRow }) {
  const t = shareType(f.type);
  const s = audienceStyle(t.audience);
  const [pending, start] = useTransition();
  return (
    <li className={`flex items-center gap-3 rounded-lg border ${s.ring} bg-[var(--c-surface)] p-3`}>
      <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold tracking-wide ${s.badge}`}>{t.short}</span>
      <Link href={`/admin/share-folders/${f.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-[var(--c-ink)]">{f.name}</span>
          {f.caseNumber && <span className="text-xs text-[var(--c-ink-muted)]">· {f.caseNumber}</span>}
        </div>
        {(f.matter || f.court) && <div className="mt-0.5 truncate text-xs text-[var(--c-ink-muted)]">{[f.matter, f.court].filter(Boolean).join("  ·  ")}</div>}
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--c-ink-muted)]">
          <span className="inline-flex items-center gap-1"><FileText size={12} /> {f.fileCount} file{f.fileCount === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-1"><Users size={12} /> {f.recipientCount} recipient{f.recipientCount === 1 ? "" : "s"}</span>
          <span>{t.audience === "adversary" ? "→ other side" : t.audience === "client" ? "client" : t.audience === "ally" ? "your side" : "general"}</span>
        </div>
      </Link>
      <button
        onClick={() => start(async () => { await archiveFolder(f.id, !f.archived); })}
        disabled={pending}
        title={f.archived ? "Restore to the main list" : "Archive (hide from the main list)"}
        className="shrink-0 rounded-md border border-[var(--c-border)] p-2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-50"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : f.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
      </button>
    </li>
  );
}

function NewFolderForm({ matters, onDone }: { matters: MatterOption[]; onDone: (id?: number) => void }) {
  const [caseNumber, setCaseNumber] = useState("");
  const [name, setName] = useState("");
  const [matter, setMatter] = useState("");
  const [court, setCourt] = useState("");
  const [county, setCounty] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [defendant, setDefendant] = useState("");
  const [type, setType] = useState(SHARE_TYPES[0].key);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = shareType(type);
  const s = audienceStyle(t.audience);

  function submit() {
    setError(null);
    start(async () => {
      try {
        const res = await createFolder({ caseNumber, name, matter, court, county, plaintiff, defendant, type });
        if (res.ok) onDone(res.id);
        else setError(res.error ?? "Couldn't create the folder.");
      } catch {
        setError("Couldn't create the folder. Open Settings → Database updates, click it once, then try again.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><FolderPlus size={15} className="text-[var(--c-accent)]" /> New share folder</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Client name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., John Smith" className={`${input} w-full`} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Matter <span className="opacity-70">(from your Clio list)</span></span>
          <MatterCombobox matters={matters} value={matter} onChange={setMatter} placeholder="Search matter by number or client…" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Case / cause number</span>
          <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="e.g., 141-350557-24" className={`${input} w-full`} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Court / location</span>
          <input value={court} onChange={(e) => setCourt(e.target.value)} placeholder="e.g., 141st District Court" className={`${input} w-full`} />
        </label>
        {/* Caption fields — used when generating pleading-styled documents from
            this folder (e.g. the Word table of contents). Blank = fill-in blank. */}
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">County <span className="opacity-70">(for pleading captions)</span></span>
          <input value={county} onChange={(e) => setCounty(e.target.value)} placeholder="e.g., Tarrant" className={`${input} w-full`} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Plaintiff(s) <span className="opacity-70">(as styled)</span></span>
          <input value={plaintiff} onChange={(e) => setPlaintiff(e.target.value)} placeholder="e.g., John Doe" className={`${input} w-full`} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Defendant(s) <span className="opacity-70">(as styled)</span></span>
          <input value={defendant} onChange={(e) => setDefendant(e.target.value)} placeholder="e.g., Acme Corp." className={`${input} w-full`} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Folder type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${input} w-full`}>
            {SHARE_TYPES.map((tt) => (
              <option key={tt.key} value={tt.key}>{tt.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${s.banner}`}>
        <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${s.badge}`}>{t.short}</span>
        {t.banner}
      </div>
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={submit} disabled={pending || !name.trim()} className="btn btn-accent text-sm disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : "Create folder"}
        </button>
        <button onClick={() => onDone()} className="text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
      </div>
    </div>
  );
}
