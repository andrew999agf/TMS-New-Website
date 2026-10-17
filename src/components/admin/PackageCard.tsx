"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Loader2, RefreshCw, Trash2, AlertTriangle, Square } from "lucide-react";
import { preparePackage, packageStatus, stopPackage, removePackage, setPackageAuto } from "@/app/admin/(panel)/share-folders/actions";
import type { PackageSummary } from "@/lib/share/package";

const fmt = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

/** Folders big enough that the browser-built ZIP is the wrong tool. */
export const PACKAGE_SUGGEST_BYTES = 1.5 * 1024 ** 3;

/**
 * "Download package" on the folder page: prepare the folder's files into
 * numbered ZIP parts ahead of time, watch the build, and see what recipients
 * will be offered. Recipients then download plain files with their browser's
 * own download manager — no tab to keep open, nothing built on the fly.
 */
export function PackageCard({ folderId, initial }: { folderId: number; initial: PackageSummary }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showParts, setShowParts] = useState(false);
  const ticks = useRef(0);

  useEffect(() => { setS(initial); }, [initial]);

  // Poll while building; nudge the builder every few polls in case the
  // minute sweep hasn't reached this folder yet.
  useEffect(() => {
    if (s.state !== "building") return;
    const t = setInterval(() => {
      ticks.current += 1;
      packageStatus(folderId, ticks.current % 4 === 0).then((r) => { if (r) { setS(r); if (r.state !== "building") router.refresh(); } }).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [s.state, folderId, router]);

  const prepare = () => start(async () => {
    setError(null);
    const r = await preparePackage(folderId);
    if (!r.ok) { setError(r.error); return; }
    setS(r.summary);
  });
  const stop = () => start(async () => { await stopPackage(folderId); const r = await packageStatus(folderId); if (r) setS(r); });
  const remove = () => { if (!confirm("Remove the prepared package? Recipients go back to per-file and sub-folder downloads until it is prepared again.")) return; start(async () => { await removePackage(folderId); const r = await packageStatus(folderId); if (r) setS(r); }); };

  const big = s.folderBytes >= PACKAGE_SUGGEST_BYTES;
  const cur = s.currentPart ? s.parts.find((p) => p.n === s.currentPart) : null;
  const frac = cur && cur.bytes > 0 && s.currentBytes ? Math.min(0.99, s.currentBytes / cur.bytes) : 0;
  const pct = s.total ? Math.round(((s.done + frac) / s.total) * 100) : 0;

  return (
    <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="package-card">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold"><Archive size={16} /> Download package</h2>
        <span className="text-xs text-[var(--c-ink-muted)]">Pre-built ZIP parts recipients download like ordinary files — pause, resume, close the tab. The right way to hand over a large production.</span>
      </div>

      <div className="mt-3 text-sm">
        {s.state === "none" && (
          <p className={big ? "text-amber-800 dark:text-amber-300" : "text-[var(--c-ink-muted)]"}>
            {big ? <><AlertTriangle size={14} className="mr-1 inline" /> This folder holds {fmt(s.folderBytes)}. Prepare a package so recipients are not left building a {fmt(s.folderBytes)} archive in their browser.</> : <>No package prepared. Recipients can download the whole folder from their browser; for folders over about 1.5 GB, prepare a package instead.</>}
          </p>
        )}
        {s.state === "building" && (
          <div>
            <p className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Packing part {s.currentPart ?? s.done + 1} of {s.total} · {s.done} finished{s.currentBytes ? ` · ${fmt(s.currentBytes)} into the current part` : ""}</p>
            <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-[var(--c-border)]"><div className="h-full rounded-full bg-[var(--c-accent)] transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-xs text-[var(--c-ink-muted)]">Runs on the server; you can leave this page. Recipients see the package as soon as every part is finished.</p>
          </div>
        )}
        {s.state === "ready" && (
          <p className="inline-flex flex-wrap items-center gap-x-2 text-emerald-700 dark:text-emerald-300"><Check size={14} /> Ready · {s.total} part{s.total === 1 ? "" : "s"} · {s.fileCount} documents · {fmt(s.totalBytes)} · prepared {when(s.builtAt)}</p>
        )}
        {s.state === "stale" && (
          <p className="inline-flex flex-wrap items-center gap-x-2 text-amber-800 dark:text-amber-300"><AlertTriangle size={14} /> The folder changed since the package was prepared {when(s.builtAt)}{s.newerFiles > 0 ? ` (${s.newerFiles} newer document${s.newerFiles === 1 ? "" : "s"})` : ""}. {s.auto ? "It rebuilds on its own about ten minutes after uploads stop, or" : "Click"} Rebuild now. Recipients can still download the previous package.</p>
        )}
        {s.state === "failed" && (
          <p className="text-red-700 dark:text-red-300"><AlertTriangle size={14} className="mr-1 inline" /> The package could not be finished: {s.error || "unknown error"}. Finished parts are kept; Try again picks up where it stopped.</p>
        )}
        {error && <p className="mt-1 text-red-700 dark:text-red-300">{error}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {s.state === "none" && <button onClick={prepare} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50"><Archive size={13} /> Prepare package</button>}
        {(s.state === "stale" || s.state === "ready") && <button onClick={prepare} disabled={pending} className={`${s.state === "stale" ? "btn btn-accent" : "btn btn-outline"} inline-flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50`}><RefreshCw size={13} /> {s.state === "stale" ? "Rebuild now" : "Rebuild"}</button>}
        {s.state === "failed" && <button onClick={prepare} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50"><RefreshCw size={13} /> Try again</button>}
        {s.state === "building" && <button onClick={stop} disabled={pending} className="btn btn-outline inline-flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50"><Square size={13} /> Stop</button>}
        {s.total > 0 && <button onClick={() => setShowParts((v) => !v)} className="btn btn-outline py-1.5 px-3">{showParts ? "Hide parts" : `Show ${s.total} part${s.total === 1 ? "" : "s"}`}</button>}
        {s.state !== "none" && s.state !== "building" && <button onClick={remove} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1.5 text-red-600 hover:bg-red-500/10 disabled:opacity-50"><Trash2 size={13} /> Remove package</button>}
        {s.state !== "none" && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]">
            <input type="checkbox" checked={s.auto} onChange={(e) => { const v = e.target.checked; setS({ ...s, auto: v }); void setPackageAuto(folderId, v); }} /> Rebuild automatically when documents change
          </label>
        )}
      </div>

      {showParts && s.total > 0 && (
        <table className="mt-3 w-full text-left text-xs">
          <thead><tr className="text-[var(--c-ink-muted)]"><th className="py-1 pr-3 font-semibold">Part</th><th className="py-1 pr-3 font-semibold">Documents</th><th className="py-1 pr-3 font-semibold">Size</th><th className="py-1 pr-3 font-semibold">Status</th><th className="py-1 font-semibold">SHA-256</th></tr></thead>
          <tbody>
            {s.parts.map((p) => (
              <tr key={p.n} className="border-t border-[var(--c-border)]">
                <td className="py-1 pr-3">{p.name}</td><td className="py-1 pr-3">{p.files}</td><td className="py-1 pr-3">{fmt(p.size ?? p.bytes)}</td>
                <td className="py-1 pr-3">{p.status === "ready" ? "Ready" : p.status === "failed" ? `Failed: ${p.error ?? ""}` : s.state === "building" && p.n === s.currentPart ? "Packing…" : p.error ? `Waiting to retry (${p.error})` : "Waiting"}</td>
                <td className="py-1 font-mono text-[10px] text-[var(--c-ink-muted)]" title={p.sha256 ?? ""}>{p.sha256 ? `${p.sha256.slice(0, 16)}…` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
