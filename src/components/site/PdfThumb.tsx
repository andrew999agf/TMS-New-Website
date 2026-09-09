"use client";

import { useEffect, useRef, useState } from "react";

/**
 * First-page PDF thumbnail that always shows the WHOLE page inside its pane.
 *
 * Desktop: the browser's native PDF frame with view=Fit (cheap, crisp).
 * Phones & tablets: mobile browsers can't fit an iframed PDF — it comes up
 * oddly zoomed and cropped — so there the first page is rendered onto a
 * canvas sized to the pane, using the pdf.js engine already in the project
 * (unpdf, loaded lazily). Any failure (huge file, unrenderable PDF) falls
 * back to the iframe so a phone is never worse off than before.
 *
 * Mount it inside a `relative` container; it fills the container.
 */

/** Above this size a phone doesn't try to pull the whole PDF for a thumbnail. */
const MAX_THUMB_BYTES = 40 * 1024 * 1024;

type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => void };

const touchLike = () =>
  typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 1024);

export function PdfThumb({ src, title }: { src: string; title: string }) {
  const [mode, setMode] = useState<"pending" | "iframe" | "canvas">("pending");
  const [drawn, setDrawn] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { setMode(touchLike() ? "canvas" : "iframe"); }, []);

  useEffect(() => {
    if (mode !== "canvas") return;
    let dead = false;
    setDrawn(false);
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch");
        const len = Number(res.headers.get("content-length") || 0);
        if (len > MAX_THUMB_BYTES) throw new Error("too big");
        const data = new Uint8Array(await res.arrayBuffer());
        if (data.byteLength > MAX_THUMB_BYTES) throw new Error("too big");
        if (dead) return;
        const { getResolvedPDFJS } = await import("unpdf");
        const pdfjs = await getResolvedPDFJS();
        const doc = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
        try {
          const page = await doc.getPage(1);
          const box = boxRef.current, canvas = canvasRef.current;
          if (dead || !box || !canvas) return;
          const rect = box.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) throw new Error("no box");
          const vp1 = page.getViewport({ scale: 1 });
          // Scale so the whole page fits the pane; cap the pixel ratio so a
          // wall of thumbnails doesn't chew memory on a retina tablet.
          const scale = Math.min(rect.width / vp1.width, rect.height / vp1.height) * Math.min(window.devicePixelRatio || 1, 2);
          const vp = page.getViewport({ scale });
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no ctx");
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          if (!dead) setDrawn(true);
        } finally {
          doc.destroy?.();
        }
      } catch {
        if (!dead) setMode("iframe");
      }
    })();
    return () => { dead = true; };
  }, [mode, src]);

  if (mode === "canvas") {
    return (
      <div ref={boxRef} className="absolute inset-0 flex items-center justify-center bg-white">
        <canvas ref={canvasRef} className={drawn ? "" : "opacity-0"} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }} aria-label={title} />
      </div>
    );
  }
  if (mode === "pending") return <div className="absolute inset-0 bg-white" aria-hidden />;
  return (
    <iframe
      src={`${src}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&view=Fit&page=1`}
      title={title}
      className="pointer-events-none absolute inset-0 h-full w-full border-0"
      loading="lazy"
      tabIndex={-1}
    />
  );
}
