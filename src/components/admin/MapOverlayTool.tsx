"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Download, Trash2, Loader2, Map as MapIcon, Layers, MousePointer2 } from "lucide-react";

/**
 * Map-on-aerial overlay. Drop an aerial photo as the base, lay a map / plat /
 * survey over it (up to two overlay layers), then drag it into place and dial
 * the opacity, size, and rotation until the lines match. Everything happens in
 * the browser — the images never leave this computer — and the download is
 * rendered at the aerial's FULL native resolution, not the on-screen preview.
 *
 * All overlay positions are kept in the base image's own pixel space, so the
 * on-screen preview and the high-res export are always the same picture.
 */

type Overlay = {
  id: number;
  name: string;
  url: string;
  w: number; // natural px
  h: number;
  x: number; // center, in BASE-image pixels
  y: number;
  scale: number; // overlay natural px → base px multiplier
  rotation: number; // degrees
  opacity: number; // 0..100
};

type BaseImg = { url: string; w: number; h: number; name: string };

const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]";

function loadImage(file: File): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}

export function MapOverlayTool() {
  const [base, setBase] = useState<BaseImg | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  const drag = useRef<{ id: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const nextId = useRef(1);

  // Preview scale: on-screen pixels per base-image pixel.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [base]);
  const f = base && stageW ? stageW / base.w : 1;

  const patch = (id: number, p: Partial<Overlay>) => setOverlays((os) => os.map((o) => (o.id === id ? { ...o, ...p } : o)));

  async function onBaseFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      const img = await loadImage(file);
      setBase({ ...img, name: file.name });
    } catch (e) { setError((e as Error).message); }
  }

  async function onOverlayFile(file?: File) {
    if (!file || !base) return;
    setError(null);
    try {
      const img = await loadImage(file);
      const scale = (base.w * 0.8) / img.w; // start at 80% of the aerial's width, centered
      const o: Overlay = { id: nextId.current++, name: file.name, url: img.url, w: img.w, h: img.h, x: base.w / 2, y: base.h / 2, scale, rotation: 0, opacity: 55 };
      setOverlays((os) => [...os, o]);
      setActiveId(o.id);
    } catch (e) { setError((e as Error).message); }
  }

  function removeOverlay(id: number) {
    setOverlays((os) => os.filter((o) => o.id !== id));
    if (activeId === id) setActiveId(null);
  }

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOverlays((os) => os.map((o) => (o.id === d.id ? { ...o, x: d.origX + (e.clientX - d.startX) / f, y: d.origY + (e.clientY - d.startY) / f } : o)));
  }, [f]);
  const onPointerUp = useCallback(() => { drag.current = null; }, []);
  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  }, [onPointerMove, onPointerUp]);

  function startDrag(e: React.PointerEvent, o: Overlay) {
    e.preventDefault();
    setActiveId(o.id);
    drag.current = { id: o.id, startX: e.clientX, startY: e.clientY, origX: o.x, origY: o.y };
  }

  /** Composite at the aerial's native resolution and download as PNG. */
  async function exportPng() {
    if (!base) return;
    setExporting(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = base.w;
      canvas.height = base.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas isn't available in this browser.");
      const draw = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Image failed to load.")); i.src = url; });
      ctx.drawImage(await draw(base.url), 0, 0, base.w, base.h);
      for (const o of overlays) {
        const img = await draw(o.url);
        ctx.save();
        ctx.globalAlpha = o.opacity / 100;
        ctx.translate(o.x, o.y);
        ctx.rotate((o.rotation * Math.PI) / 180);
        ctx.drawImage(img, (-o.w * o.scale) / 2, (-o.h * o.scale) / 2, o.w * o.scale, o.h * o.scale);
        ctx.restore();
      }
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Couldn't render the image.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overlay - ${base.name.replace(/\.[^.]+$/, "")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
    setExporting(false);
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Load images */}
      <div className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <label className="btn btn-accent inline-flex cursor-pointer items-center gap-1.5 text-sm">
          <Upload size={15} /> {base ? "Replace aerial (base)" : "1 — Load the aerial (base)"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onBaseFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={`btn btn-outline inline-flex items-center gap-1.5 text-sm ${base && overlays.length < 2 ? "cursor-pointer" : "pointer-events-none opacity-40"}`}>
          <Layers size={15} /> {overlays.length === 0 ? "2 — Add the map overlay" : "Add a second overlay"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onOverlayFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <button onClick={() => void exportPng()} disabled={!base || overlays.length === 0 || exporting} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download high-res PNG{base ? ` (${base.w}×${base.h})` : ""}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      {/* Stage */}
      {!base ? (
        <div className={`${card} flex flex-col items-center justify-center gap-2 border-dashed p-16 text-center`}>
          <MapIcon size={30} className="text-[var(--c-accent)]" />
          <p className="text-sm font-medium">Load the aerial photo first, then lay the map over it.</p>
          <p className="max-w-md text-xs text-[var(--c-ink-muted)]">Everything stays on this computer — nothing is uploaded. The download comes out at the aerial&apos;s full resolution, so start from the highest-resolution aerial you have.</p>
        </div>
      ) : (
        <div ref={stageRef} className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-[var(--c-border)] bg-black/5" style={{ aspectRatio: `${base.w} / ${base.h}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={base.url} alt="Aerial base" draggable={false} className="absolute inset-0 h-full w-full" />
          {overlays.map((o) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={o.id}
              src={o.url}
              alt={o.name}
              draggable={false}
              onPointerDown={(e) => startDrag(e, o)}
              className={`absolute cursor-move ${o.id === activeId ? "outline outline-2 outline-[var(--c-accent)]" : ""}`}
              style={{
                left: o.x * f,
                top: o.y * f,
                width: o.w * o.scale * f,
                height: o.h * o.scale * f,
                transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`,
                opacity: o.opacity / 100,
              }}
            />
          ))}
        </div>
      )}

      {/* Layer controls */}
      {overlays.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {overlays.map((o) => (
            <div key={o.id} onClick={() => setActiveId(o.id)} className={`${card} cursor-pointer p-4 ${o.id === activeId ? "border-[var(--c-accent)]" : ""}`}>
              <div className="mb-2 flex items-center gap-2">
                <Layers size={14} className="text-[var(--c-accent)]" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.name}</span>
                <button onClick={(e) => { e.stopPropagation(); removeOverlay(o.id); }} title="Remove this layer" className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><Trash2 size={14} /></button>
              </div>
              <label className="block text-xs text-[var(--c-ink-muted)]">Opacity — {o.opacity}%
                <input type="range" min={5} max={100} value={o.opacity} onChange={(e) => patch(o.id, { opacity: Number(e.target.value) })} className="w-full accent-[var(--c-accent)]" />
              </label>
              <label className="mt-1 block text-xs text-[var(--c-ink-muted)]">Size — {Math.round(o.scale * o.w)}px wide
                <input type="range" min={5} max={200} value={Math.round(((o.scale * o.w) / (base?.w ?? 1)) * 100)} onChange={(e) => patch(o.id, { scale: ((Number(e.target.value) / 100) * (base?.w ?? 1)) / o.w })} className="w-full accent-[var(--c-accent)]" />
              </label>
              <label className="mt-1 block text-xs text-[var(--c-ink-muted)]">Rotation — {o.rotation}°
                <input type="range" min={-180} max={180} value={o.rotation} onChange={(e) => patch(o.id, { rotation: Number(e.target.value) })} className="w-full accent-[var(--c-accent)]" />
              </label>
            </div>
          ))}
        </div>
      )}

      {base && overlays.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><MousePointer2 size={13} /> Drag the map on the picture to line it up; use the sliders for opacity, size, and a little rotation. The second layer sits on top of the first.</p>
      )}
    </div>
  );
}
