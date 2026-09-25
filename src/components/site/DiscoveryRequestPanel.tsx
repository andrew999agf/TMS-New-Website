"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Phone, X } from "lucide-react";

export type DiscoveryRequestInfo = { prefix: string; count: number; first: number; last: number };

/**
 * Layout for a discovery-response collection share: the folders live in a
 * fixed-width left column (no more full-screen-wide rows), and the served
 * discovery requests stay OPEN in a right-side reader while the client files
 * documents — collapsible to a slim rail with the little arrow. On phones the
 * reader becomes an overlay opened from the banner button. A first-visit
 * pop-up explains the folder-per-request system.
 */
export function DiscoveryRequestLayout({ info, token, phone, children }: {
  info: DiscoveryRequestInfo | null;
  token: string;
  phone: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [overlay, setOverlay] = useState(false); // small screens
  const [showIntro, setShowIntro] = useState(false);
  const introKey = `discovery-intro-${token}`;
  const asideKey = `discovery-aside-${token}`;

  useEffect(() => {
    if (!info) return;
    try {
      if (sessionStorage.getItem(introKey) !== "1") setShowIntro(true);
      if (sessionStorage.getItem(asideKey) === "collapsed") setCollapsed(true);
    } catch {
      setShowIntro(true);
    }
  }, [info, introKey, asideKey]);

  if (!info) return <>{children}</>;

  const rangeText = info.count === 1 ? `${info.prefix} ${info.first}` : `${info.prefix} ${info.first} through ${info.prefix} ${info.last}`;

  function setAside(c: boolean) {
    setCollapsed(c);
    try { sessionStorage.setItem(asideKey, c ? "collapsed" : "open"); } catch { /* private browsing */ }
  }
  function dismissIntro(openViewer: boolean) {
    setShowIntro(false);
    try { sessionStorage.setItem(introKey, "1"); } catch { /* private browsing */ }
    if (openViewer) {
      setAside(false);
      setOverlay(true); // only visible < lg
    }
  }

  const banner = (
    <div className="mb-4 rounded-lg border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-3.5">
      <p className="text-sm font-semibold">Where to put your documents</p>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
        Please review the discovery requests and place each document into the folder that matches the
        request it responds to ({rangeText}). Questions? Call our office at{" "}
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--c-accent)]">{phone}</a>.
      </p>
      {/* On phones the reader can't sit alongside — open it as an overlay. */}
      <button onClick={() => { setOverlay(true); setAside(false); }}
        className="mt-2.5 inline-flex items-center gap-2 rounded-md bg-[#7a1f2b] px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110 lg:hidden">
        <BookOpen size={14} /> Review the discovery requests
      </button>
    </div>
  );

  return (
    <>
      <div className="lg:flex lg:items-start lg:gap-6">
        {/* left: the folders, at a sane reading width */}
        <div className="min-w-0 flex-1 lg:max-w-2xl">
          {banner}
          {children}
        </div>

        {/* right: the requests, open by default, collapsible to a rail */}
        {collapsed ? (
          <button onClick={() => setAside(false)}
            className="sticky top-6 hidden shrink-0 flex-col items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-4 text-[var(--c-accent)] hover:border-[var(--c-accent)] lg:flex"
            title="Show the discovery requests">
            <ChevronLeft size={16} />
            <span className="text-xs font-semibold" style={{ writingMode: "vertical-rl" }}>Discovery requests</span>
          </button>
        ) : (
          <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] shadow-sm lg:flex">
            <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
              <BookOpen size={14} className="shrink-0 text-[var(--c-accent)]" />
              <p className="text-sm font-semibold">Discovery requests</p>
              <p className="hidden truncate text-xs text-[var(--c-ink-muted)] xl:block">— file each document under the request it answers</p>
              <button onClick={() => setAside(true)} aria-label="Collapse the requests panel"
                className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" title="Collapse">
                <ChevronRight size={16} />
              </button>
            </div>
            <iframe src={`/share/${token}/request#zoom=page-width`} title="Discovery requests" className="min-h-0 w-full flex-1 bg-white" />
          </aside>
        )}
      </div>

      {/* phone overlay reader */}
      {overlay && (
        <div className="fixed inset-0 z-[75] flex flex-col bg-[var(--c-surface)] lg:hidden">
          <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-2.5">
            <BookOpen size={15} className="text-[var(--c-accent)]" />
            <p className="text-sm font-semibold">Discovery requests</p>
            <button onClick={() => setOverlay(false)} aria-label="Close" className="ml-auto rounded p-1.5 text-[var(--c-ink-muted)]"><X size={16} /></button>
          </div>
          <iframe src={`/share/${token}/request#zoom=page-width`} title="Discovery requests" className="min-h-0 w-full flex-1 bg-white" />
        </div>
      )}

      {/* first-visit pop-up */}
      {showIntro && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Please review the discovery requests</h2>
            <p className="mt-2 text-sm text-[var(--c-ink-muted)]">
              This page has one folder for each request ({rangeText}). Please place each document into the
              folder that matches the request it responds to — that tells us exactly which request each
              document answers. The requests stay open on the right side while you work.
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)]">
              <Phone size={14} /> Questions? Call our office at{" "}
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--c-accent)]">{phone}</a>.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => dismissIntro(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
                <BookOpen size={15} /> Got it — show me the requests
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}