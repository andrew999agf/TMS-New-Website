"use client";

import { useState } from "react";
import { Archive, Check, Download, Loader2 } from "lucide-react";

export type PackagePartView = { n: number; name: string; files: number; size: number; sha256: string | null };
const fmt = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The recipient's view of a prepared package: numbered ZIP parts as plain
 * links, plus "Download all parts" which hands them to the browser one after
 * another. The browser's own download manager handles pause, resume and
 * interruptions — the page can be closed.
 */
export function PackageDownload({ token, parts, fileCount, totalBytes, preparedAt, newerFiles }: { token: string; parts: PackagePartView[]; fileCount: number; totalBytes: number; preparedAt: string | null; newerFiles: number }) {
  const [started, setStarted] = useState<Set<number>>(new Set());
  const [queueing, setQueueing] = useState(false);
  const [showSums, setShowSums] = useState(false);
  const href = (n: number) => `/share/${token}/package/${n}`;

  // Chrome asks once to allow multiple downloads from a site; spacing the
  // clicks keeps every part in the browser's download list.
  const all = async () => {
    setQueueing(true);
    for (const p of parts) {
      const a = document.createElement("a"); a.href = href(p.n); a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
      setStarted((s) => new Set(s).add(p.n));
      await new Promise((r) => setTimeout(r, 1200));
    }
    setQueueing(false);
  };

  return (
    <section className="rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-surface)] p-4" data-testid="package-download">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Archive size={15} /> Download everything</h2>
        <span className="text-xs text-[var(--c-ink-muted)]">{fileCount} documents · {fmt(totalBytes)} · {parts.length} ZIP {parts.length === 1 ? "file" : "parts"}{preparedAt ? ` · prepared ${new Date(preparedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</span>
        {parts.length > 1 && (
          <button onClick={() => void all()} disabled={queueing} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {queueing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download all {parts.length} parts
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--c-ink-muted)]">
        {parts.length > 1 ? "Each part is a complete ZIP of its own; extract every part into the same folder to rebuild the full set. " : ""}
        Downloads run in your browser&apos;s download list, so you can pause, resume, and close this page.{parts.length > 1 ? " If your browser asks to allow multiple downloads, choose Allow." : ""}
      </p>
      {newerFiles > 0 && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{newerFiles} document{newerFiles === 1 ? " was" : "s were"} added after this package was prepared. {newerFiles === 1 ? "It appears" : "They appear"} in the list below and can be downloaded individually; the package is refreshed automatically.</p>}
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.n} className="flex items-center gap-2 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm">
            <a href={href(p.n)} onClick={() => setStarted((s) => new Set(s).add(p.n))} className="inline-flex min-w-0 flex-1 items-center gap-2 hover:text-[var(--c-accent)]" title={p.name}>
              <Download size={14} className="shrink-0" /><span className="truncate">{p.name}</span>
            </a>
            <span className="shrink-0 text-xs text-[var(--c-ink-muted)]">{p.files} doc{p.files === 1 ? "" : "s"} · {fmt(p.size)}</span>
            {started.has(p.n) && <Check size={14} className="shrink-0 text-emerald-600" aria-label="Started" />}
          </li>
        ))}
      </ul>
      {parts.some((p) => p.sha256) && (
        <div className="mt-2 text-[11px] text-[var(--c-ink-muted)]">
          <button onClick={() => setShowSums((v) => !v)} className="underline">{showSums ? "Hide" : "Show"} checksums</button>
          {showSums && <ul className="mt-1 space-y-0.5 font-mono">{parts.map((p) => <li key={p.n}>{p.sha256}  {p.name} ({p.size.toLocaleString()} bytes)</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
