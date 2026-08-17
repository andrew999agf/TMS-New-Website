"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Trash2, FileText, ExternalLink, Hash, ListOrdered, CornerDownLeft, AlertCircle, Check,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { parseExhibitName, suggestOrder, getScheme, SIDE_LABEL, type Side } from "@/lib/pretrial/exhibits";
import { filesFromDrop, countDropItems, fromInput, type PickedFile } from "@/lib/share/drop";
import { PopMenu } from "./PopMenu";
import {
  addExhibitDoc, updateExhibitDoc, deleteExhibitDoc, searchExhibitSet, getDocPages,
  type SetSearchHit,
} from "@/app/admin/(panel)/exhibit-reviewer/actions";

export type ReviewerDoc = {
  id: number; side: string; number: number | null; label: string; title: string; description: string; priority: string; trialStatus: string; bates: string;
  hasFile: boolean; pageCount: number | null; sizeBytes: number | null; sort: number;
};

/** The review flags, in the order they read on the light. */
/**
 * Two independent flags per exhibit, kept visually distinct on purpose:
 *
 *  - PRIORITY is the team's own prep judgment, shown as a FADED pill that spells
 *    the word out (Priority / Neutral / Low). Soft colour = a subjective call.
 *  - TRIAL STATUS is the court's actual ruling, shown as a SOLID dot (Admitted /
 *    Offered–pending / Excluded). Solid colour = a hard fact. The words show in
 *    its picker, its tooltip, and the admitted-exhibits summary.
 *
 * Same green/amber/red family for both so the meaning reads instantly; faded vs
 * solid (and word-pill vs dot) is what tells the two apart.
 */
const PRIORITY_META: Record<string, { label: string; short: string; dot: string; pill: string }> = {
  green: { label: "Priority", short: "Priority", dot: "#16a34a", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  yellow: { label: "Neutral", short: "Neutral", dot: "#ca8a04", pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  red: { label: "Low priority / bad", short: "Low", dot: "#dc2626", pill: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};
const PRIORITY_ORDER = ["green", "yellow", "red", "none"];

const STATUS_META: Record<string, { label: string; short: string; color: string }> = {
  admitted: { label: "Admitted", short: "Admitted", color: "#16a34a" },
  pending: { label: "Offered — ruling pending", short: "Pending", color: "#eab308" },
  excluded: { label: "Excluded — objection sustained", short: "Excluded", color: "#dc2626" },
};
const STATUS_ORDER = ["admitted", "pending", "excluded", "none"];

/** An off-white circle with a diagonal slash — the "not set" state for both flags. */
function SlashDot({ size = 12 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)]" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden><line x1="3.5" y1="10.5" x2="10.5" y2="3.5" stroke="var(--c-ink-muted)" strokeWidth="1.5" /></svg>
    </span>
  );
}

/** Priority: a faded pill that says the word, or a slash circle when unset. */
function PriorityChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = PRIORITY_META[value];
  const current = m ? `Priority: ${m.label}` : "Set priority";
  return (
    <PopMenu
      width={200}
      title={`${current} — click to change`}
      className="mt-0.5 inline-flex shrink-0 items-center rounded-full transition hover:ring-2 hover:ring-[var(--c-accent)]/30"
      label={
        m ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.pill}`}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.dot }} /> {m.short}
          </span>
        ) : (
          <SlashDot />
        )
      }
    >
      {(close) => (
        <div className="py-0.5">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Priority (prep)</div>
          {PRIORITY_ORDER.map((id) => {
            const pm = PRIORITY_META[id];
            return (
              <button key={id} onMouseDown={(e) => { e.preventDefault(); close(); onChange(id); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10">
                {pm ? <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: pm.dot }} /> : <SlashDot size={12} />}
                <span className="flex-1 text-[var(--c-ink)]">{pm?.label ?? "None"}</span>
                {value === id && <Check size={12} className="text-[var(--c-accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </PopMenu>
  );
}

/** Trial status: a solid dot (or slash when unset). Words live in the menu. */
function StatusBubble({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = STATUS_META[value];
  return (
    <PopMenu
      width={220}
      title={m ? `Trial status: ${m.label} — click to change` : "Set trial status"}
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition hover:ring-2 hover:ring-[var(--c-accent)]/30"
      label={m ? <span className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: m.color }} /> : <SlashDot />}
    >
      {(close) => (
        <div className="py-0.5">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Trial status</div>
          {STATUS_ORDER.map((id) => {
            const sm = STATUS_META[id];
            return (
              <button key={id} onMouseDown={(e) => { e.preventDefault(); close(); onChange(id); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10">
                {sm ? <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: sm.color }} /> : <SlashDot size={12} />}
                <span className="flex-1 text-[var(--c-ink)]">{sm?.label ?? "Not offered"}</span>
                {value === id && <Check size={12} className="text-[var(--c-accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </PopMenu>
  );
}

/**
 * The right-hand summary in the frozen bar. Reads at a glance how many exhibits
 * are admitted (and excluded), and opens a grouped, clickable list so you can
 * jump straight to any of them — across both parties.
 */
function StatusSummary({ docs, onOpen }: { docs: ReviewerDoc[]; onOpen: (d: ReviewerDoc) => void }) {
  const groups = STATUS_ORDER.filter((s) => s !== "none").map((id) => ({ id, meta: STATUS_META[id], items: docs.filter((d) => d.trialStatus === id) }));
  const admitted = groups.find((g) => g.id === "admitted")?.items.length ?? 0;
  const excluded = groups.find((g) => g.id === "excluded")?.items.length ?? 0;
  const anyRuled = groups.some((g) => g.items.length);
  return (
    <PopMenu
      width={300}
      title="Exhibits by trial status"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--c-accent)]"
      label={
        <>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META.admitted.color }} />
          <span className="font-semibold text-[var(--c-ink)]">{admitted}</span>
          <span className="text-[var(--c-ink-muted)]">admitted</span>
          {excluded > 0 && <><span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META.excluded.color }} /><span className="font-semibold text-[var(--c-ink)]">{excluded}</span></>}
        </>
      }
    >
      {(close) => (
        <div className="py-1">
          {!anyRuled && <div className="px-3 py-3 text-xs text-[var(--c-ink-muted)]">No trial rulings recorded yet. Set an exhibit&apos;s status with the solid dot on its row.</div>}
          {groups.map((g) => g.items.length ? (
            <div key={g.id} className="py-0.5">
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.meta.color }} /> {g.meta.label} · {g.items.length}
              </div>
              {g.items.map((d) => (
                <button key={d.id} onMouseDown={(e) => { e.preventDefault(); close(); onOpen(d); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10">
                  <span className="min-w-[3rem] shrink-0 font-semibold text-[var(--c-accent)]">{d.label || (d.number != null ? `#${d.number}` : "—")}</span>
                  <span className="flex-1 truncate text-[var(--c-ink)]">{d.title || "Untitled exhibit"}</span>
                  <span className="shrink-0 text-[10px] uppercase text-[var(--c-ink-muted)]">{d.side[0]}</span>
                </button>
              ))}
            </div>
          ) : null)}
        </div>
      )}
    </PopMenu>
  );
}

const SIDES: Side[] = ["plaintiff", "defendant", "joint"];
const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtSize = (b?: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const defaultLabel = (side: Side, n: number | null) => (n == null ? "" : getScheme("dash").format(side, n));

/** A file dropped in, parsed and awaiting the user's confirmation before upload.
 *  `parsed` is the number read from the filename (immutable); `number`/`label`
 *  are the working values shown and saved. */
type Staged = { key: string; file: File; side: Side; parsed: number | null; number: number | null; label: string; title: string; bates: string };

/** How the staged batch gets numbered before it's saved. */
export type NumMode = "keep" | "sequential" | "manual";

/**
 * Work out each staged exhibit's number, so nobody types 200 of them.
 *
 *  - "keep" (default): honour the number read from each filename, so an
 *    intentional gap in the chain (P-1, P-2, P-4 …) is preserved rather than
 *    collapsed. Files with no readable number continue the sequence from the
 *    highest so far.
 *  - "sequential": ignore the filenames and number straight 1, 2, 3 … in order.
 *  - "manual": leave the working values alone for hand editing.
 *
 * All modes count separately per side and continue from what the set already has.
 */
function computeNumbers(items: Staged[], mode: NumMode, startAt: Record<Side, number>): Staged[] {
  if (mode === "manual") return items;
  if (mode === "sequential") {
    const c: Record<Side, number> = { ...startAt };
    return items.map((s) => { const n = c[s.side]++; return { ...s, number: n, label: defaultLabel(s.side, n) }; });
  }
  // keep: use the parsed number where there is one; fill blanks after the max.
  const maxN: Record<Side, number> = { plaintiff: startAt.plaintiff - 1, defendant: startAt.defendant - 1, joint: startAt.joint - 1 };
  return items.map((s) => {
    const n = s.parsed ?? maxN[s.side] + 1;
    maxN[s.side] = Math.max(maxN[s.side], n);
    return { ...s, number: n, label: defaultLabel(s.side, n) };
  });
}

/** Per-side gaps (skipped numbers) and clashes, so the user can eyeball the
 *  chain before saving. A gap is usually fine (an omitted exhibit); a clash
 *  (same number twice, or one that already exists in the set) usually isn't. */
function numberingReport(items: Staged[], existing: Record<Side, Set<number>>) {
  const out: Record<Side, { count: number; min: number; max: number; gaps: number[]; clashes: number[] }> = {
    plaintiff: { count: 0, min: 0, max: 0, gaps: [], clashes: [] },
    defendant: { count: 0, min: 0, max: 0, gaps: [], clashes: [] },
    joint: { count: 0, min: 0, max: 0, gaps: [], clashes: [] },
  };
  for (const s of SIDES) {
    const nums = items.filter((i) => i.side === s && i.number != null).map((i) => i.number as number);
    if (!nums.length) continue;
    const set = new Set(nums);
    const min = Math.min(...nums), max = Math.max(...nums);
    const gaps: number[] = [];
    for (let n = min; n <= max; n++) if (!set.has(n)) gaps.push(n);
    const seen = new Set<number>(), clashes = new Set<number>();
    for (const n of nums) { if (seen.has(n)) clashes.add(n); seen.add(n); if (existing[s]?.has(n)) clashes.add(n); }
    out[s] = { count: nums.length, min, max, gaps, clashes: [...clashes].sort((a, b) => a - b) };
  }
  return out;
}

export function ExhibitReviewer({ setId, docs, blobReady }: { setId: number; docs: ReviewerDoc[]; blobReady: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  }, [router]);

  // Which sides actually have exhibits — plaintiff & defendant always shown,
  // joint only when used.
  const sidesInUse = useMemo(() => {
    const present = new Set(docs.map((d) => d.side));
    return SIDES.filter((s) => s === "plaintiff" || s === "defendant" || present.has(s));
  }, [docs]);
  const [side, setSide] = useState<Side>("plaintiff");

  const ordered = useMemo(() => {
    const inSide = docs.filter((d) => d.side === side);
    return inSide.slice().sort((a, b) => {
      const an = a.number ?? Infinity, bn = b.number ?? Infinity;
      if (an !== bn) return an - bn;
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.id - b.id;
    });
  }, [docs, side]);

  const [currentId, setCurrentId] = useState<number | null>(null);
  // Keep a valid selection as the side/list changes.
  useEffect(() => {
    if (ordered.length === 0) { setCurrentId(null); return; }
    if (!ordered.some((d) => d.id === currentId)) setCurrentId(ordered[0].id);
  }, [ordered, currentId]);

  const current = ordered.find((d) => d.id === currentId) ?? null;
  const currentIndex = current ? ordered.findIndex((d) => d.id === current.id) : -1;

  const [viewerPage, setViewerPage] = useState(1);
  const openDoc = useCallback((id: number, page = 1) => { setCurrentId(id); setViewerPage(page); }, []);

  function step(delta: number) {
    if (currentIndex < 0) return;
    const next = ordered[currentIndex + delta];
    if (next) openDoc(next.id, 1);
  }

  /* ------------------------- go to number ------------------------- */
  const [gotoNum, setGotoNum] = useState("");
  function goToNumber() {
    const n = Number(gotoNum);
    if (!Number.isFinite(n)) return;
    const hit = ordered.find((d) => d.number === n);
    if (hit) { openDoc(hit.id, 1); setGotoNum(""); }
    else setError(`No exhibit numbered ${n} in ${SIDE_LABEL[side].toLowerCase()}.`);
  }

  /* ---------------------- cross-set search ------------------------ */
  const [setQuery, setSetQuery] = useState("");
  const [setHits, setSetHits] = useState<SetSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = setQuery.trim();
    if (q.length < 2) { setSetHits(null); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const hits = await searchExhibitSet(setId, q);
      setSetHits(hits);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [setQuery, setId]);

  function openHit(h: SetSearchHit) {
    setSide((h.side as Side) ?? "plaintiff");
    openDoc(h.docId, h.pages[0] ?? 1);
    setSetQuery("");
    setSetHits(null);
  }

  // Open any exhibit regardless of which side tab is showing (used by the
  // admitted/status summary, which spans both parties).
  const openAnySide = useCallback((d: ReviewerDoc) => {
    setSide((d.side as Side) ?? "plaintiff");
    openDoc(d.id, 1);
  }, [openDoc]);

  /* --------------------- in-document search ----------------------- */
  const [docPages, setDocPages] = useState<string[]>([]);
  const [docQuery, setDocQuery] = useState("");
  const [docMatches, setDocMatches] = useState<number[]>([]);
  const [matchPos, setMatchPos] = useState(0);
  // Load the current document's text when it changes.
  useEffect(() => {
    let alive = true;
    setDocPages([]); setDocQuery(""); setDocMatches([]); setMatchPos(0);
    if (current?.id) getDocPages(current.id).then((p) => { if (alive) setDocPages(p); });
    return () => { alive = false; };
  }, [current?.id]);
  useEffect(() => {
    const q = docQuery.trim().toLowerCase();
    if (q.length < 2 || docPages.length === 0) { setDocMatches([]); setMatchPos(0); return; }
    const pages: number[] = [];
    for (let i = 0; i < docPages.length; i++) if ((docPages[i] ?? "").toLowerCase().includes(q)) pages.push(i + 1);
    setDocMatches(pages);
    setMatchPos(0);
    if (pages.length) setViewerPage(pages[0]);
  }, [docQuery, docPages]);
  function stepMatch(delta: number) {
    if (!docMatches.length) return;
    const pos = (matchPos + delta + docMatches.length) % docMatches.length;
    setMatchPos(pos);
    setViewerPage(docMatches[pos]);
  }

  /* ------------------------- add / upload ------------------------- */
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [numMode, setNumMode] = useState<NumMode>("keep");
  const fileRef = useRef<HTMLInputElement>(null);

  // Numbers already used per side, and the next free number, so a second batch
  // continues rather than restarting at 1 (and so clashes can be flagged).
  const existingBySide = useMemo<Record<Side, Set<number>>>(() => {
    const m: Record<Side, Set<number>> = { plaintiff: new Set(), defendant: new Set(), joint: new Set() };
    for (const d of docs) {
      const s: Side = d.side === "defendant" ? "defendant" : d.side === "joint" ? "joint" : "plaintiff";
      if (typeof d.number === "number") m[s].add(d.number);
    }
    return m;
  }, [docs]);
  const startAt = useMemo<Record<Side, number>>(() => ({
    plaintiff: (existingBySide.plaintiff.size ? Math.max(...existingBySide.plaintiff) : 0) + 1,
    defendant: (existingBySide.defendant.size ? Math.max(...existingBySide.defendant) : 0) + 1,
    joint: (existingBySide.joint.size ? Math.max(...existingBySide.joint) : 0) + 1,
  }), [existingBySide]);

  // What the staged rows show and what actually gets uploaded.
  const numberedStaged = useMemo(() => computeNumbers(staged, numMode, startAt), [staged, numMode, startAt]);
  const report = useMemo(() => numberingReport(numberedStaged, existingBySide), [numberedStaged, existingBySide]);

  function changeMode(next: NumMode) {
    // Switching to manual bakes the current numbers in, so hand editing starts
    // from the filled-in sequence rather than blanks.
    if (next === "manual") setStaged((prev) => computeNumbers(prev, numMode === "manual" ? "keep" : numMode, startAt));
    setNumMode(next);
  }

  const stageFiles = useCallback((picked: PickedFile[]) => {
    const pdfs = picked.filter((p) => /\.pdf$/i.test(p.file.name) || p.file.type === "application/pdf");
    if (!pdfs.length) { setError("Drop PDF files — the reviewer reads exhibits as PDFs."); return; }
    const parsed = pdfs.map((p) => ({ picked: p, ...parseExhibitName(p.file.name) }));
    const sorted = suggestOrder(parsed);
    const items: Staged[] = sorted.map((p, i) => {
      const s = (p.side as Side | null) ?? side;
      return {
        key: `${p.picked.file.name}-${i}-${p.picked.file.size}`,
        file: p.picked.file,
        side: s,
        parsed: p.number,
        number: p.number,
        label: defaultLabel(s, p.number),
        title: p.title,
        bates: p.bates,
      };
    });
    setStaged((prev) => [...prev, ...items]);
  }, [side]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const count = countDropItems(e.dataTransfer);
    try {
      const picked = await filesFromDrop(e.dataTransfer);
      if (picked.length === 0 && count > 0) setError("Couldn't read the dropped items. Try the “Choose files” button instead.");
      else stageFiles(picked);
    } catch { setError("Couldn't read the drop. Try the “Choose files” button."); }
  }, [stageFiles]);

  async function doUpload() {
    if (!staged.length || !blobReady) return;
    setError(null);
    const finalItems = computeNumbers(staged, numMode, startAt);
    setUploading({ done: 0, total: finalItems.length });
    let done = 0;
    for (const item of finalItems) {
      try {
        const blob = await upload(`exhibit-reviewer/${setId}/${item.file.name}`, item.file, {
          access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId),
        });
        await addExhibitDoc(setId, {
          side: item.side, number: item.number, label: item.label.trim(), title: item.title.trim(), bates: item.bates.trim(),
          file: { url: blob.url, pathname: blob.pathname, contentType: item.file.type || blob.contentType, size: item.file.size },
        });
      } catch (err) {
        setError(`Couldn't upload ${item.file.name}: ${(err as Error).message}`);
      }
      done++;
      setUploading({ done, total: staged.length });
    }
    setStaged([]);
    setUploading(null);
    router.refresh();
  }

  const patchStaged = (key: string, patch: Partial<Staged>) => setStaged((prev) => prev.map((s) => {
    if (s.key !== key) return s;
    const next = { ...s, ...patch };
    // Keep the label in step with side/number unless the user typed one.
    if ((patch.side !== undefined || patch.number !== undefined) && (s.label === defaultLabel(s.side, s.number) || !s.label)) {
      next.label = defaultLabel(next.side, next.number);
    }
    return next;
  }));

  const proxyBase = `/admin/exhibit-reviewer/${setId}/doc`;
  const viewerSrc = current ? `${proxyBase}/${current.id}#page=${viewerPage}&zoom=page-width&view=FitH` : "";

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </p>
      )}

      {/* Frozen controls: the side tabs and the go-to / arrows / search bar stay
          put at the top while the exhibit list and the viewer scroll on their
          own, so you never lose them behind a long list. */}
      <div className="sticky top-9 z-20 -mx-6 space-y-3 border-b border-[var(--c-border)] bg-[var(--c-bg)] px-6 pb-3 pt-2">
      {/* Side tabs */}
      <div className="flex flex-wrap items-center gap-1 pb-1">
        {sidesInUse.map((s) => {
          const n = docs.filter((d) => d.side === s).length;
          return (
            <button key={s} onClick={() => setSide(s)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${side === s ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]"}`}>
              {SIDE_LABEL[s]} <span className={`rounded-full px-1.5 ${side === s ? "bg-white/20" : "bg-[var(--c-surface2)]"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar: go-to-number, prev/next, cross-set search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1">
          <Hash size={13} className="text-[var(--c-ink-muted)]" />
          <input value={gotoNum} onChange={(e) => setGotoNum(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") goToNumber(); }} placeholder="Go to #" inputMode="numeric" className="w-16 bg-transparent text-sm outline-none" />
          <button onClick={goToNumber} className="rounded p-0.5 text-[var(--c-accent)] hover:bg-[var(--c-surface2)]" title="Go"><CornerDownLeft size={14} /></button>
        </div>

        <div className="inline-flex items-center gap-1">
          <button onClick={() => step(-1)} disabled={currentIndex <= 0} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] disabled:opacity-40" title="Previous exhibit"><ChevronLeft size={16} /></button>
          <span className="min-w-[7.5rem] text-center text-xs text-[var(--c-ink-muted)]">
            {current ? `${current.label || current.title || "Exhibit"} · ${currentIndex + 1} of ${ordered.length}` : `${ordered.length} exhibits`}
          </span>
          <button onClick={() => step(1)} disabled={currentIndex < 0 || currentIndex >= ordered.length - 1} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] disabled:opacity-40" title="Next exhibit"><ChevronRight size={16} /></button>
        </div>

        <div className="ml-auto flex min-w-[240px] flex-1 items-center gap-2 sm:max-w-md">
          {/* The admitted/trial-status summary sits on the right of the frozen
              bar: a tally that opens a grouped, clickable list of exhibits. */}
          <StatusSummary docs={docs} onOpen={openAnySide} />
          <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input value={setQuery} onChange={(e) => setSetQuery(e.target.value)} placeholder="Search across all exhibits…" className={`${input} pl-8 pr-8`} />
          {setQuery && <button onClick={() => { setSetQuery(""); setSetHits(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={14} /></button>}
          {setHits !== null && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
              {searching && <div className="px-3 py-2 text-xs text-[var(--c-ink-muted)]"><Loader2 size={12} className="mr-1 inline animate-spin" /> Searching…</div>}
              {!searching && setHits.length === 0 && <div className="px-3 py-3 text-xs text-[var(--c-ink-muted)]">No exhibits match “{setQuery}”.</div>}
              {setHits.map((h) => (
                <button key={h.docId} onClick={() => openHit(h)} className="block w-full border-b border-[var(--c-border)] px-3 py-2 text-left last:border-0 hover:bg-[var(--c-surface2)]">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-[var(--c-accent)]">{h.label || h.title || "Exhibit"}</span>
                    <span className="rounded bg-[var(--c-surface2)] px-1.5 text-[10px] uppercase text-[var(--c-ink-muted)]">{h.side}</span>
                    {h.pages.length > 0 && <span className="text-[11px] text-[var(--c-ink-muted)]">p. {h.pages.slice(0, 6).join(", ")}{h.pages.length > 6 ? "…" : ""}</span>}
                  </div>
                  {h.title && <div className="truncate text-xs text-[var(--c-ink-muted)]">{h.title}</div>}
                  {h.snippet && <div className="mt-0.5 truncate text-[11px] italic text-[var(--c-ink-muted)]">…{h.snippet}…</div>}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
      </div>

      {/* Main: list + viewer — each column is one viewport tall and scrolls
          inside itself, so paging through 200 exhibits on the left never drags
          the viewer (or the page) along with it. */}
      <div className="grid gap-4 lg:h-[80vh] lg:grid-cols-[minmax(240px,320px)_1fr]">
        {/* Exhibit list */}
        <div className="flex flex-col gap-2 lg:h-full lg:min-h-0">
          <AddExhibits
            blobReady={blobReady} dragOver={dragOver} uploading={uploading} items={numberedStaged}
            numMode={numMode} onSetMode={changeMode} report={report}
            fileRef={fileRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPick={(list) => stageFiles(fromInput(list))}
            onPatch={patchStaged}
            onRemove={(key) => setStaged((prev) => prev.filter((s) => s.key !== key))}
            onClear={() => setStaged([])}
            onUpload={doUpload}
          />

          {ordered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--c-border)] p-4 text-center text-xs text-[var(--c-ink-muted)]">
              No {SIDE_LABEL[side].toLowerCase()} yet. Drop exhibit PDFs above.
            </p>
          ) : (
            <ul className="space-y-1 overflow-y-auto pr-1 max-h-[60vh] lg:max-h-none lg:flex-1 lg:min-h-0">
              {ordered.map((d, i) => (
                <ExhibitRow key={d.id} d={d} active={d.id === currentId} index={i}
                  onOpen={() => openDoc(d.id, 1)}
                  onSave={(patch) => run(() => updateExhibitDoc(d.id, patch))}
                  onDelete={() => { if (confirm(`Remove ${d.label || d.title || "this exhibit"}?`)) run(() => deleteExhibitDoc(d.id)); }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Viewer */}
        <div className="h-[80vh] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] lg:h-full">
          {!current ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--c-ink-muted)]">
              <FileText size={28} className="opacity-40" />
              {ordered.length ? "Select an exhibit to view it." : "Add exhibits to get started."}
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {/* Viewer header + in-document search */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{current.label ? `${current.label} — ` : ""}{current.title || "Exhibit"}</div>
                  {current.description && <div className="truncate text-[11px] text-[var(--c-ink)]" title={current.description}>{current.description}</div>}
                  <div className="truncate text-[11px] text-[var(--c-ink-muted)]">
                    {current.bates ? `${current.bates} · ` : ""}{current.pageCount ? `${current.pageCount} page${current.pageCount === 1 ? "" : "s"}` : ""}{current.sizeBytes ? ` · ${fmtSize(current.sizeBytes)}` : ""}
                  </div>
                </div>

                <div className="relative inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1">
                  <Search size={13} className="text-[var(--c-ink-muted)]" />
                  <input
                    value={docQuery}
                    onChange={(e) => setDocQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") stepMatch(e.shiftKey ? -1 : 1); }}
                    placeholder="Find in this exhibit…"
                    className="w-40 bg-transparent text-sm outline-none"
                    disabled={docPages.length === 0}
                    title={docPages.length === 0 ? "This PDF has no searchable text layer (it may be scanned images)." : "Search this exhibit"}
                  />
                  {docQuery.trim().length >= 2 && (
                    <span className="whitespace-nowrap text-[11px] text-[var(--c-ink-muted)]">
                      {docMatches.length ? `${matchPos + 1}/${docMatches.length} pp` : "0"}
                    </span>
                  )}
                  <button onClick={() => stepMatch(-1)} disabled={!docMatches.length} className="rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-30" title="Previous match"><ChevronUp size={14} /></button>
                  <button onClick={() => stepMatch(1)} disabled={!docMatches.length} className="rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-30" title="Next match"><ChevronDown size={14} /></button>
                </div>

                <a href={`${proxyBase}/${current.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open in a new tab"><ExternalLink size={15} /></a>
              </div>

              {docPages.length === 0 && (
                <p className="border-b border-[var(--c-border)] bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  This PDF has no text layer, so “find in exhibit” can’t search it. You can still use your browser’s find (Ctrl/⌘-F) inside the viewer.
                </p>
              )}

              {/* The PDF itself — native viewer gives scrolling, zoom, and its own
                  find. Keyed on page so #page jumps always take effect. */}
              <iframe
                key={`${current.id}:${viewerPage}`}
                src={viewerSrc}
                title={current.label || current.title || "Exhibit"}
                className="min-h-0 flex-1 w-full rounded-b-lg bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- add / staged panel --------------------------- */
type Report = ReturnType<typeof numberingReport>;

/** Per-side numbering summary, e.g. "P-1–P-120 · D-1–D-80". */
function rangeSummary(items: Staged[]): string {
  const parts: string[] = [];
  for (const s of SIDES) {
    const nums = items.filter((i) => i.side === s && i.number != null).map((i) => i.number as number);
    if (!nums.length) continue;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    parts.push(lo === hi ? defaultLabel(s, lo) : `${defaultLabel(s, lo)}–${defaultLabel(s, hi)}`);
  }
  return parts.join("  ·  ");
}

const MODE_LABEL: Record<NumMode, string> = {
  keep: "Keep the numbers from the files",
  sequential: "Renumber 1, 2, 3… in order",
  manual: "I’ll set the numbers by hand",
};

function AddExhibits({ blobReady, dragOver, uploading, items, numMode, onSetMode, report, fileRef, onDragOver, onDragLeave, onDrop, onPick, onPatch, onRemove, onClear, onUpload }: {
  blobReady: boolean; dragOver: boolean; uploading: { done: number; total: number } | null; items: Staged[];
  numMode: NumMode; onSetMode: (m: NumMode) => void; report: Report;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  onPick: (list: FileList | null) => void; onPatch: (key: string, patch: Partial<Staged>) => void;
  onRemove: (key: string) => void; onClear: () => void; onUpload: () => void;
}) {
  // Collect gaps and clashes across sides for the notice.
  const gaps: string[] = [];
  const clashes: string[] = [];
  for (const s of SIDES) {
    for (const n of report[s].gaps) gaps.push(defaultLabel(s, n));
    for (const n of report[s].clashes) clashes.push(defaultLabel(s, n));
  }

  return (
    <div>
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-3 text-center transition-colors ${dragOver ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`}
      >
        <Upload size={18} className="mx-auto mb-1 text-[var(--c-ink-muted)]" />
        <p className="text-xs text-[var(--c-ink-muted)]">Drop exhibit PDFs here, or</p>
        <button onClick={() => fileRef.current?.click()} className="mt-1 text-xs font-semibold text-[var(--c-accent)] hover:underline">Choose files</button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { onPick(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
        {!blobReady && <p className="mt-1 text-[11px] text-amber-600">Connect a Blob store to upload files.</p>}
      </div>

      {items.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><ListOrdered size={13} className="text-[var(--c-accent)]" /> {items.length} to add</span>
            <button onClick={onClear} disabled={!!uploading} className="text-[11px] text-[var(--c-ink-muted)] hover:text-red-600">Clear</button>
          </div>

          {/* Plain-language notice of exactly how these will be numbered before
              anything is saved — so nobody is surprised after the upload. */}
          <div className="mb-2 rounded-md border border-[var(--c-border)] bg-[var(--c-surface2)] p-2 text-[11px]">
            <div className="mb-1.5 flex items-start gap-1.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
              <span className="text-[var(--c-ink)]">
                These will be saved as <span className="font-semibold">{rangeSummary(items) || "numbered below"}</span> when you add them. Review the numbers first — change the option below if they’re not right.
              </span>
            </div>
            <select value={numMode} onChange={(e) => onSetMode(e.target.value as NumMode)} className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-1 text-[11px]">
              {(["keep", "sequential", "manual"] as NumMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>

            {numMode === "keep" && gaps.length > 0 && (
              <p className="mt-1.5 text-[var(--c-ink-muted)]">
                <span className="font-semibold text-[var(--c-ink)]">Skipped:</span> {gaps.join(", ")} — left out of the sequence. That’s expected if those exhibits were intentionally omitted; switch to “Renumber 1, 2, 3…” to close the gaps.
              </p>
            )}
            {clashes.length > 0 && (
              <p className="mt-1.5 text-red-600">
                <span className="font-semibold">Duplicate number{clashes.length === 1 ? "" : "s"}:</span> {clashes.join(", ")} — two exhibits share a number (or it already exists in this set). Fix it by hand or renumber before adding.
              </p>
            )}
          </div>

          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {items.map((s) => {
              const clash = s.number != null && report[s.side].clashes.includes(s.number);
              return (
                <li key={s.key} className={`rounded-md border bg-[var(--c-bg)] p-2 ${clash ? "border-red-500/50" : "border-[var(--c-border)]"}`}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <select value={s.side} onChange={(e) => onPatch(s.key, { side: e.target.value as Side })} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" title="Side">
                      <option value="plaintiff">P</option>
                      <option value="defendant">D</option>
                      <option value="joint">J</option>
                    </select>
                    {numMode === "manual" ? (
                      <>
                        <input value={s.number ?? ""} onChange={(e) => onPatch(s.key, { number: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} placeholder="#" inputMode="numeric" className="w-10 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" />
                        <input value={s.label} onChange={(e) => onPatch(s.key, { label: e.target.value })} placeholder="P-1" className="w-16 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5 text-[11px]" />
                      </>
                    ) : (
                      <span className={`inline-flex h-[22px] min-w-[3rem] items-center justify-center rounded px-1.5 text-[11px] font-bold ${clash ? "bg-red-500/15 text-red-600" : "bg-[var(--c-accent)]/10 text-[var(--c-accent)]"}`} title={clash ? "Duplicate number" : "Numbered from the order"}>{s.label || "—"}</span>
                    )}
                    <button onClick={() => onRemove(s.key)} disabled={!!uploading} className="ml-auto text-[var(--c-ink-muted)] hover:text-red-600"><X size={13} /></button>
                  </div>
                  <input value={s.title} onChange={(e) => onPatch(s.key, { title: e.target.value })} placeholder="Title" className="w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5 text-[11px]" />
                  <div className="mt-0.5 truncate text-[10px] text-[var(--c-ink-muted)]" title={s.file.name}>{s.file.name}</div>
                </li>
              );
            })}
          </ul>
          <button onClick={onUpload} disabled={!blobReady || !!uploading} className="btn btn-accent mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs py-2 disabled:opacity-50">
            {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading {uploading.done}/{uploading.total}…</> : <><Upload size={13} /> Add {items.length} exhibit{items.length === 1 ? "" : "s"}</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ list row ------------------------------ */
function ExhibitRow({ d, active, index, onOpen, onSave, onDelete }: {
  d: ReviewerDoc; active: boolean; index: number;
  onOpen: () => void; onSave: (patch: { side?: string; number?: number | null; label?: string; title?: string; description?: string; priority?: string; trialStatus?: string; bates?: string }) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ side: d.side, number: d.number, label: d.label, title: d.title, description: d.description, bates: d.bates });
  useEffect(() => { setF({ side: d.side, number: d.number, label: d.label, title: d.title, description: d.description, bates: d.bates }); }, [d]);

  // Keep the selected exhibit visible in the list when you page with the arrows.
  // "nearest" nudges only the list's own scroll, never the page.
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => { if (active) rowRef.current?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (editing) {
    return (
      <li className="rounded-md border border-[var(--c-accent)] bg-[var(--c-surface)] p-2 text-xs">
        <div className="mb-1.5 flex items-center gap-1.5">
          <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })} className="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5">
            <option value="plaintiff">P</option><option value="defendant">D</option><option value="joint">J</option>
          </select>
          <input value={f.number ?? ""} onChange={(e) => setF({ ...f, number: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, "")) })} placeholder="#" inputMode="numeric" className="w-10 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5" />
          <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="P-1" className="w-16 rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1 py-0.5" />
        </div>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" className="mb-1.5 w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5" />
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description (optional)" rows={2} className="mb-1.5 w-full resize-y rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5" />
        <input value={f.bates} onChange={(e) => setF({ ...f, bates: e.target.value })} placeholder="Bates (optional)" className="mb-1.5 w-full rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5" />
        <div className="flex justify-end gap-1.5">
          <button onClick={() => setEditing(false)} className="rounded px-2 py-1 text-[var(--c-ink-muted)]">Cancel</button>
          <button onClick={() => { onSave({ ...f }); setEditing(false); }} className="btn btn-accent px-2.5 py-1 text-[11px]">Save</button>
        </div>
      </li>
    );
  }

  return (
    <li ref={rowRef} className={`group flex items-start gap-2 rounded-md border p-2 transition-colors ${active ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)]/40"}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <span className={`mt-0.5 inline-flex h-6 min-w-[2.25rem] shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold ${active ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-surface2)] text-[var(--c-ink)]"}`}>
          {d.label || (d.number ?? index + 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-[var(--c-ink)]">{d.title || "Untitled exhibit"}</span>
          {/* The description sits between the title and the Bates line, showing up
              to two full lines of whatever was typed. */}
          {d.description && <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-[11px] leading-snug text-[var(--c-ink-muted)]" title={d.description}>{d.description}</span>}
          {(d.bates || d.pageCount) && <span className="mt-0.5 block truncate text-[10px] text-[var(--c-ink-muted)]">{d.bates}{d.bates && d.pageCount ? " · " : ""}{d.pageCount ? `${d.pageCount} pp` : ""}</span>}
        </span>
      </button>
      {/* Two flags in the space to the right of the title: prep priority (faded
          word pill) and trial status (solid dot). Both always visible. */}
      <div className="flex shrink-0 items-start gap-1">
        <PriorityChip value={d.priority} onChange={(v) => onSave({ priority: v })} />
        <StatusBubble value={d.trialStatus} onChange={(v) => onSave({ trialStatus: v })} />
      </div>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => setEditing(true)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit"><Pencil size={12} /></button>
        <button onClick={onDelete} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={12} /></button>
      </span>
    </li>
  );
}
