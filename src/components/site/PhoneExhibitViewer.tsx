"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

/**
 * Phone PDF viewer for the exhibit share links.
 *
 * Mobile browsers can't fit an iframed PDF to the screen — you end up zooming
 * and dragging around. This renders each page onto a canvas scaled so the WHOLE
 * page fits the phone screen (a letter-size page fills the view), with page
 * arrows and swipe to flip through. Rendering uses the PDF engine already in
 * the project (unpdf's bundled pdf.js), loaded lazily so it only ships to
 * phones on these pages.
 *
 * Desktop never sees this component; and if anything goes wrong here (a huge
 * file, an unrenderable PDF), it falls back to the old full-screen-open banner
 * so a phone is never worse off than before.
 */

/** Above this size we don't try to pull the whole PDF onto a phone. */
const MAX_PHONE_BYTES = 80 * 1024 * 1024;

type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };

export function PhoneExhibitViewer({ src, title }: { src: string; title: string }) {
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [rendering, setRendering] = useState(false);
  const docRef = useRef<PdfDoc | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchX = useRef<number | null>(null);
  const renderSeq = useRef(0);

  // Load the document once.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch");
        const len = Number(res.headers.get("content-length") || 0);
        if (len > MAX_PHONE_BYTES) throw new Error("too big");
        const data = new Uint8Array(await res.arrayBuffer());
        if (data.byteLength > MAX_PHONE_BYTES) throw new Error("too big");
        const { getResolvedPDFJS } = await import("unpdf");
        const pdfjs = await getResolvedPDFJS();
        const doc = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
        if (dead) return;
        docRef.current = doc;
        setPageCount(doc.numPages);
        setState("ready");
      } catch {
        if (!dead) setState("fallback");
      }
    })();
    return () => { dead = true; };
  }, [src]);

  // Draw the current page fitted to the container: the whole page visible.
  const draw = useCallback(async (n: number) => {
    const doc = docRef.current, box = boxRef.current, canvas = canvasRef.current;
    if (!doc || !box || !canvas) return;
    const seq = ++renderSeq.current;
    setRendering(true);
    try {
      const p = await doc.getPage(n);
      const base = p.getViewport({ scale: 1 });
      const cw = box.clientWidth, ch = box.clientHeight;
      if (cw < 10 || ch < 10) return;
      // Fit the WHOLE page inside the box (with a small breathing margin).
      const fit = Math.min((cw - 12) / base.width, (ch - 12) / base.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: fit * dpr });
      if (seq !== renderSeq.current) return; // a newer draw superseded this one
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch {
      setState("fallback");
    } finally {
      if (seq === renderSeq.current) setRendering(false);
    }
  }, []);

  useEffect(() => { if (state === "ready") void draw(page); }, [state, page, draw]);
  // Re-fit when the phone rotates or the browser chrome collapses.
  useEffect(() => {
    if (state !== "ready") return;
    const onResize = () => void draw(page);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [state, page, draw]);

  const go = (delta: number) => setPage((p) => Math.min(Math.max(1, p + delta), pageCount || 1));

  if (state === "fallback") {
    // The pre-existing behavior: hand the PDF to the browser full screen.
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-accent)] px-3 py-2.5 text-sm font-semibold text-white">
        Open exhibit full screen
      </a>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={boxRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--c-surface-2)]"
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchX.current; touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null) return;
          const dx = end - start;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
      >
        {state === "loading" ? (
          <span className="inline-flex items-center gap-2 text-sm text-[var(--c-ink-muted)]"><Loader2 size={16} className="animate-spin text-[var(--c-accent)]" /> Loading exhibit…</span>
        ) : (
          <canvas ref={canvasRef} title={title} className={`shadow-md ${rendering ? "opacity-60" : ""} bg-white transition-opacity`} />
        )}
      </div>

      {state === "ready" && (
        <div className="flex items-center gap-2 border-t border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
          <button onClick={() => go(-1)} disabled={page <= 1} className="rounded-md border border-[var(--c-border)] p-2 text-[var(--c-ink-muted)] disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={18} /></button>
          <span className="min-w-[6.5rem] text-center text-xs text-[var(--c-ink-muted)]">Page {page} / {pageCount}</span>
          <button onClick={() => go(1)} disabled={page >= pageCount} className="rounded-md border border-[var(--c-border)] p-2 text-[var(--c-ink-muted)] disabled:opacity-30" aria-label="Next page"><ChevronRight size={18} /></button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)]">
            <ExternalLink size={13} /> Full screen
          </a>
        </div>
      )}
    </div>
  );
}
