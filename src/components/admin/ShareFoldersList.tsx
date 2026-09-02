"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search, Archive, ArchiveRestore, FileText, Users, Loader2, FolderPlus, FolderOpen, X } from "lucide-react";
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
  county: string;
  plaintiff: string;
  defendant: string;
  type: string;
  archived: boolean;
  updatedAt: string;
  fileCount: number;
  recipientCount: number;
};

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

/** Canonical bucket for a folder (legacy type keys fold into their successors). */
const bucketOf = (f: FolderRow) => shareType(f.type).key;

/**
 * Share folders, organized as one BUCKET per folder category (Discovery,
 * Client, Co-Counsel, …). The landing view is the buckets; clicking one opens
 * that category's list. Opening a folder first pops a confirmation showing the
 * full case information — so nobody lands in the wrong case's folder — and the
 * archive button asks before it hides anything.
 */
export function ShareFoldersList({ folders, matters }: { folders: FolderRow[]; matters: MatterOption[] }) {
  const router = useRouter();
  const [bucket, setBucket] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<FolderSort>("updated");
  const [creating, setCreating] = useState(false);
  const [openFor, setOpenFor] = useState<FolderRow | null>(null);
  const [archiveFor, setArchiveFor] = useState<FolderRow | null>(null);

  const searching = q.trim().length > 0;

  // Inside a bucket the search stays inside it; on the landing view a search
  // looks across every bucket (so a case number always finds its folder).
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = folders.filter((f) => f.archived === showArchived);
    if (bucket) out = out.filter((f) => bucketOf(f) === bucket);
    if (needle) out = out.filter((f) => `${f.caseNumber} ${f.name} ${f.matter} ${f.court} ${shareType(f.type).label}`.toLowerCase().includes(needle));
    const by: Record<FolderSort, (a: FolderRow, b: FolderRow) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || compareNatural(a.name, b.name),
      case: (a, b) => compareNatural(a.caseNumber, b.caseNumber) || compareNatural(a.name, b.name),
      name: (a, b) => compareNatural(a.name, b.name),
      type: (a, b) => compareNatural(shareType(a.type).short, shareType(b.type).short) || compareNatural(a.name, b.name),
    };
    return [...out].sort(by[sort]);
  }, [folders, q, bucket, showArchived, sort]);

  const archivedCount = folders.filter((f) => f.archived).length;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of folders) if (f.archived === showArchived) m.set(bucketOf(f), (m.get(bucketOf(f)) ?? 0) + 1);
    return m;
  }, [folders, showArchived]);

  const bucketDef = bucket ? shareType(bucket) : null;
  const bucketStyle = bucketDef ? audienceStyle(bucketDef.audience) : null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {bucket && (
          <button onClick={() => { setBucket(null); setQ(""); }} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
            <ChevronLeft size={15} /> All categories
          </button>
        )}
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={bucket ? `Search ${bucketDef?.short.toLowerCase()} folders…` : "Search all folders — case #, client, type…"} className={`${input} w-full pl-8`} />
        </div>
        {(bucket || searching) && (
          <select value={sort} onChange={(e) => setSort(e.target.value as FolderSort)} className={input}>
            {FOLDER_SORTS.map((s) => (
              <option key={s.key} value={s.key}>Sort: {s.label}</option>
            ))}
          </select>
        )}
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

      {creating && <NewFolderForm matters={matters} presetType={bucket ?? undefined} onDone={(id) => { setCreating(false); if (id) router.push(`/admin/share-folders/${id}`); }} />}

      {showArchived && (
        <p className="text-sm text-[var(--c-ink-muted)] flex items-center gap-2">
          <Archive size={14} /> Viewing archived folders. Use the restore button on a folder to bring it back.
        </p>
      )}

      {/* Landing: one bucket per category */}
      {!bucket && !searching ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHARE_TYPES.map((t) => {
              const n = counts.get(t.key) ?? 0;
              const s = audienceStyle(t.audience);
              return (
                <button
                  key={t.key}
                  onClick={() => { setBucket(t.key); setQ(""); }}
                  className={`group flex flex-col rounded-lg border ${n ? s.ring : "border-[var(--c-border)]"} bg-[var(--c-surface)] p-4 text-left transition-shadow hover:shadow-md ${n ? "" : "opacity-60"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`rounded px-2 py-1 text-[10px] font-bold tracking-wide ${s.badge}`}>{t.short}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
                      {n} <ChevronRight size={14} className="text-[var(--c-ink-muted)] transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                  <span className="mt-2 text-sm font-semibold leading-snug text-[var(--c-ink)]">{t.label.replace(/\s*\(.*\)$/, "")}</span>
                  <span className="mt-1 text-xs leading-relaxed text-[var(--c-ink-muted)]">{t.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--c-ink-muted)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Goes to the other side</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Client</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Your side (co-counsel/expert)</span>
          </div>
        </>
      ) : (
        <>
          {bucket && bucketDef && bucketStyle && !searching && (
            <div className={`rounded-md border px-3 py-2 text-xs ${bucketStyle.banner}`}>
              <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${bucketStyle.badge}`}>{bucketDef.short}</span>
              {bucketDef.banner}
            </div>
          )}
          {list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--c-border)] p-10 text-center text-sm text-[var(--c-ink-muted)]">
              {searching ? "Nothing matches that search." : showArchived ? "No archived folders in this category." : "No folders in this category yet. Click “New folder” to create one."}
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((f) => (
                <FolderCard key={f.id} f={f} onOpen={() => setOpenFor(f)} onArchive={() => setArchiveFor(f)} />
              ))}
            </ul>
          )}
        </>
      )}

      {openFor && <OpenConfirmDialog f={openFor} onClose={() => setOpenFor(null)} onGo={() => router.push(`/admin/share-folders/${openFor.id}`)} />}
      {archiveFor && <ArchiveConfirmDialog f={archiveFor} onClose={() => setArchiveFor(null)} />}
    </div>
  );
}

function FolderCard({ f, onOpen, onArchive }: { f: FolderRow; onOpen: () => void; onArchive: () => void }) {
  const t = shareType(f.type);
  const s = audienceStyle(t.audience);
  const [pending, start] = useTransition();
  return (
    <li className={`flex items-center gap-3 rounded-lg border ${s.ring} bg-[var(--c-surface)] p-3`}>
      <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold tracking-wide ${s.badge}`}>{t.short}</span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left" title="Open (you'll confirm the case first)">
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
      </button>
      {f.archived ? (
        <button
          onClick={() => start(async () => { await archiveFolder(f.id, false); })}
          disabled={pending}
          title="Restore to the main list"
          className="shrink-0 rounded-md border border-[var(--c-border)] p-2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-50"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}
        </button>
      ) : (
        <button
          onClick={onArchive}
          title="Archive (asks first — hides from the main list)"
          className="shrink-0 rounded-md border border-[var(--c-border)] p-2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
        >
          <Archive size={15} />
        </button>
      )}
    </li>
  );
}

/** "You're about to open…" — full case information, so the right folder is a
 *  deliberate choice, never an accident. */
function OpenConfirmDialog({ f, onClose, onGo }: { f: FolderRow; onClose: () => void; onGo: () => void }) {
  const t = shareType(f.type);
  const s = audienceStyle(t.audience);
  const rows: [string, string][] = [
    ["Client", f.name],
    ["Case / cause no.", f.caseNumber],
    ["Matter", f.matter],
    ["Court", f.court],
    ["County", f.county],
    ["Plaintiff(s)", f.plaintiff],
    ["Defendant(s)", f.defendant],
    ["Contents", `${f.fileCount} file${f.fileCount === 1 ? "" : "s"} · ${f.recipientCount} recipient${f.recipientCount === 1 ? "" : "s"}`],
  ];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-[var(--c-surface)] p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg"><FolderOpen size={18} className="text-[var(--c-accent)]" /> You&apos;re about to open</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>
        <div className={`mb-3 mt-2 rounded-md border px-3 py-2 text-xs ${s.banner}`}>
          <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${s.badge}`}>{t.short}</span>
          {t.banner}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {rows.filter(([, v]) => v && v.trim()).map(([k, v]) => (
              <tr key={k} className="border-b border-[var(--c-border)] last:border-0">
                <td className="whitespace-nowrap py-1.5 pr-4 align-top text-xs text-[var(--c-ink-muted)]">{k}</td>
                <td className="py-1.5 font-medium text-[var(--c-ink)]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">No — wrong folder</button>
          <button onClick={onGo} className="btn btn-accent text-sm py-2 px-4">Yes, open this folder</button>
        </div>
      </div>
    </div>
  );
}

/** Archiving asks first — an accidental click shouldn't make a folder vanish. */
function ArchiveConfirmDialog({ f, onClose }: { f: FolderRow; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-lg bg-[var(--c-surface)] p-6 shadow-2xl">
        <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg"><Archive size={18} className="text-[var(--c-accent)]" /> Archive this folder?</h3>
        <p className="mt-3 text-sm text-[var(--c-ink-muted)]">
          <strong className="text-[var(--c-ink)]">{f.name}</strong>{f.caseNumber ? ` · ${f.caseNumber}` : ""} will disappear from the main list.
          Nothing is deleted — files and access stay as they are, and you can restore it anytime from the Archived view.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button
            onClick={() => start(async () => { await archiveFolder(f.id, true); onClose(); })}
            disabled={pending}
            className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />} Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function NewFolderForm({ matters, presetType, onDone }: { matters: MatterOption[]; presetType?: string; onDone: (id?: number) => void }) {
  const [caseNumber, setCaseNumber] = useState("");
  const [name, setName] = useState("");
  const [matter, setMatter] = useState("");
  const [court, setCourt] = useState("");
  const [county, setCounty] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [defendant, setDefendant] = useState("");
  const [type, setType] = useState(presetType ?? SHARE_TYPES[0].key);
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
