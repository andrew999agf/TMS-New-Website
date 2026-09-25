"use client";

import { useEffect, useState } from "react";
import { BookOpen, Phone, X } from "lucide-react";

/**
 * Client-side companion for a discovery-response collection folder: a
 * first-visit pop-up explaining what to do, and a side panel showing the
 * served requests so the client can read each request while dropping the
 * responsive documents into its folder.
 */
export function DiscoveryRequestPanel({ token, prefix, count, first, last, phone }: {
  token: string;
  prefix: string;
  count: number;
  first: number;
  last: number;
  phone: string;
}) {
  const [showIntro, setShowIntro] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const introKey = `discovery-intro-${token}`;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(introKey) !== "1") setShowIntro(true);
    } catch {
      setShowIntro(true);
    }
  }, [introKey]);

  function dismissIntro(openViewer: boolean) {
    setShowIntro(false);
    try { sessionStorage.setItem(introKey, "1"); } catch { /* private browsing */ }
    if (openViewer) setShowViewer(true);
  }

  const rangeText = count === 1 ? `${prefix} ${first}` : `${prefix} ${first} through ${prefix} ${last}`;

  return (
    <>
      {/* standing instructions + the review button */}
      <div className="mt-4 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-4">
        <p className="text-sm font-semibold">Where to put your documents</p>
        <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
          Please review the discovery requests and place each document into the folder that matches the
          request it responds to ({rangeText}). If you have any questions, please call our office at{" "}
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--c-accent)]">{phone}</a>.
        </p>
        <button onClick={() => setShowViewer(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#7a1f2b] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
          <BookOpen size={15} /> Review the discovery requests
        </button>
      </div>

      {/* first-visit pop-up */}
      {showIntro && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Please review the discovery requests</h2>
            <p className="mt-2 text-sm text-[var(--c-ink-muted)]">
              This page has one folder for each request ({rangeText}). Please place each document into the
              folder that matches the request it responds to — that tells us exactly which request each
              document answers.
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)]">
              <Phone size={14} /> Questions? Call our office at{" "}
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--c-accent)]">{phone}</a>.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => dismissIntro(false)} className="rounded-md border border-[var(--c-border)] px-4 py-2 text-sm">Got it</button>
              <button onClick={() => dismissIntro(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
                <BookOpen size={15} /> Review the requests
              </button>
            </div>
          </div>
        </div>
      )}

      {/* side viewer: requests on the right, the folders stay usable on the left */}
      {showViewer && (
        <div className="fixed inset-y-0 right-0 z-[75] flex w-full max-w-2xl flex-col border-l border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-2.5">
            <BookOpen size={15} className="text-[var(--c-accent)]" />
            <p className="text-sm font-semibold">Discovery requests</p>
            <p className="hidden text-xs text-[var(--c-ink-muted)] sm:block">— keep this open while you file documents</p>
            <button onClick={() => setShowViewer(false)} aria-label="Close" className="ml-auto rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={16} /></button>
          </div>
          <iframe src={`/share/${token}/request#zoom=page-width`} title="Discovery requests" className="min-h-0 w-full flex-1 bg-white" />
        </div>
      )}
    </>
  );
}
