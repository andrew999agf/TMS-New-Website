"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, Download, Trash2, Loader2, Map as MapIcon, Layers, MousePointer2, Save, Crop, FolderOpen } from "lucide-react";
import { saveMapProject, deleteMapProject } from "@/app/admin/(panel)/map-overlay/actions";

/**
 * Map-on-aerial overlay. Drop an aerial photo as the base, lay a map / plat /
 * survey over it (up to two overlay layers), then drag anything — the aerial
 * included — into place and dial opacity, size, and rotation until the lines
 * match. Trim crops the download to just the area that matters, and Save
 * uploads the images and placement so the project reopens exactly as left.
 * The download renders at full native resolution, never the screen preview.
 *
 * All positions live in the base image's own pixel space, so the on-screen
 * preview and the high-res export are always the same picture.
 */

type Overlay = {
  id: number;
  name: string;
  url: string;
  file?: File; // still local — uploaded when the project is saved
  w: number; // natural px
  h: number;
  x: number; // center, in frame pixels
  y: number;
  scale: number;
  rotation: number;
  opacity: number; // 0..100
};

type BaseImg = { url: string; file?: File; w: number; h: number; name: string };
type BaseTx = { x: number; y: number; scale: number; rotation: number };
type CropBox = { x: number; y: number; w: number; h: number };

export type SavedProject = {
  id: number;
  name: string;
  base: { url: string; w: number; h: number; name: string };
  baseTx: BaseTx;
  layers: { name: string; url: string; w: number; h: number; x: number; y: number; scale: number; rotation: number; opacity: number }[];
  crop: CropBox | null;
  updatedAt: string;
};

const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]";
const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

function loadImage(file: File): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}

export function MapOverlayTool({ projects }: { projects: SavedProject[] }) {
  const router = useRouter();
  const [base, setBase] = useState<BaseImg | null>(null);
  const [baseTx, setBaseTx] = useState<BaseTx>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [crop, setCrop] = useState<CropBox | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  const drag = useRef<{ id: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const cropDrag = useRef<{ startX: number; startY: number } | null>(null);
  const nextId = useRef(1);

  // Preview scale: on-screen pixels per frame pixel.
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
      setBase({ ...img, file, name: file.name });
      setBaseTx({ x: img.w / 2, y: img.h / 2, scale: 1, rotation: 0 });
      setCrop(null);
      setCropMode(false);
    } catch (e) { setError((e as Error).message); }
  }

  async function onOverlayFile(file?: File) {
    if (!file || !base) return;
    setError(null);
    try {
      const img = await loadImage(file);
      const scale = (base.w * 0.8) / img.w; // start at 80% of the aerial's width, centered
      const o: Overlay = { id: nextId.current++, name: file.name, url: img.url, file, w: img.w, h: img.h, x: base.w / 2, y: base.h / 2, scale, rotation: 0, opacity: 55 };
      setOverlays((os) => [...os, o]);
      setActiveId(o.id);
    } catch (e) { setError((e as Error).message); }
  }

  function removeOverlay(id: number) {
    setOverlays((os) => os.filter((o) => o.id !== id));
    if (activeId === id) setActiveId(null);
  }

  /** Pointer position in frame pixels. */
  const framePoint = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !f) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / f, y: (e.clientY - r.top) / f };
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (cropDrag.current) {
      const p = { x: (e.clientX - (stageRef.current?.getBoundingClientRect().left ?? 0)) / f, y: (e.clientY - (stageRef.current?.getBoundingClientRect().top ?? 0)) / f };
      const s = cropDrag.current;
      setCrop({ x: Math.min(s.startX, p.x), y: Math.min(s.startY, p.y), w: Math.abs(p.x - s.startX), h: Math.abs(p.y - s.startY) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const nx = d.origX + (e.clientX - d.startX) / f;
    const ny = d.origY + (e.clientY - d.startY) / f;
    if (d.id === 0) setBaseTx((b) => ({ ...b, x: nx, y: ny })); // dragging the aerial itself
    else setOverlays((os) => os.map((o) => (o.id === d.id ? { ...o, x: nx, y: ny } : o)));
  }, [f]);
  const onPointerUp = useCallback(() => {
    if (cropDrag.current) {
      cropDrag.current = null;
      setCropMode(false);
      // A tiny accidental swipe isn't a trim.
      setCrop((c) => (c && (c.w < 20 || c.h < 20) ? null : c));
      return;
    }
    drag.current = null;
  }, []);
  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  }, [onPointerMove, onPointerUp]);

  /** id 0 = the aerial base; anything else is an overlay. */
  function startDrag(e: React.PointerEvent, id: number, origX: number, origY: number) {
    if (cropMode) return; // in trim mode the stage handles the pointer
    e.preventDefault();
    setActiveId(id === 0 ? null : id);
    drag.current = { id, startX: e.clientX, startY: e.clientY, origX, origY };
  }

  function onStagePointerDown(e: React.PointerEvent) {
    if (!cropMode) return;
    e.preventDefault();
    const p = framePoint(e);
    cropDrag.current = { startX: p.x, startY: p.y };
    setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  const drawImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    if (/^https?:/.test(url)) i.crossOrigin = "anonymous"; // saved projects load from Blob
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("An image failed to load."));
    i.src = url;
  });

  const outW = crop ? Math.round(crop.w) : base?.w ?? 0;
  const outH = crop ? Math.round(crop.h) : base?.h ?? 0;

  /** Composite at native resolution (trimmed to the crop box) and download. */
  async function exportPng() {
    if (!base) return;
    setExporting(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas isn't available in this browser.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
      if (crop) ctx.translate(-crop.x, -crop.y);
      {
        const img = await drawImg(base.url);
        ctx.save();
        ctx.translate(baseTx.x, baseTx.y);
        ctx.rotate((baseTx.rotation * Math.PI) / 180);
        ctx.drawImage(img, (-base.w * baseTx.scale) / 2, (-base.h * baseTx.scale) / 2, base.w * baseTx.scale, base.h * baseTx.scale);
        ctx.restore();
      }
      for (const o of overlays) {
        const img = await drawImg(o.url);
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
      a.download = `overlay - ${(projectName || base.name).replace(/\.[^.]+$/, "")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
    setExporting(false);
  }

  /** Upload any still-local images to Blob, then store the whole project. */
  async function saveProject() {
    if (!base || overlays.length === 0) return;
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const uploadOne = async (file: File) => {
        const blob = await upload(`map-overlay/${file.name}`, file, { access: "public", handleUploadUrl: "/api/admin/upload", clientPayload: "map-overlay" });
        return blob.url;
      };
      let baseUrl = base.url;
      if (base.file) {
        baseUrl = await uploadOne(base.file);
        setBase((b) => (b ? { ...b, url: baseUrl, file: undefined } : b));
      }
      const layerUrls: Record<number, string> = {};
      for (const o of overlays) {
        layerUrls[o.id] = o.file ? await uploadOne(o.file) : o.url;
      }
      setOverlays((os) => os.map((o) => ({ ...o, url: layerUrls[o.id], file: undefined })));

      const res = await saveMapProject({
        id: projectId ?? undefined,
        name: projectName || base.name.replace(/\.[^.]+$/, ""),
        base: { url: baseUrl, w: base.w, h: base.h, name: base.name },
        baseTx,
        layers: overlays.map((o) => ({ name: o.name, url: layerUrls[o.id], w: o.w, h: o.h, x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, opacity: o.opacity })),
        crop,
      });
      if (!res.ok) throw new Error(res.error ?? "Couldn't save.");
      setProjectId(res.id ?? null);
      if (!projectName) setProjectName(base.name.replace(/\.[^.]+$/, ""));
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2500);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  function loadProject(p: SavedProject) {
    setBase({ url: p.base.url, w: p.base.w, h: p.base.h, name: p.base.name });
    setBaseTx(p.baseTx);
    setOverlays(p.layers.map((l) => ({ ...l, id: nextId.current++ })));
    setCrop(p.crop);
    setCropMode(false);
    setProjectId(p.id);
    setProjectName(p.name);
    setActiveId(null);
    setError(null);
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Load images + export */}
      <div className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <label className="btn btn-accent inline-flex cursor-pointer items-center gap-1.5 text-sm">
          <Upload size={15} /> {base ? "Replace aerial (base)" : "1 — Load the aerial (base)"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onBaseFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={`btn btn-outline inline-flex items-center gap-1.5 text-sm ${base && overlays.length < 2 ? "cursor-pointer" : "pointer-events-none opacity-40"}`}>
          <Layers size={15} /> {overlays.length === 0 ? "2 — Add the map overlay" : "Add a second overlay"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onOverlayFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {base && (
          <>
            <button
              onClick={() => { if (crop) { setCrop(null); setCropMode(false); } else setCropMode((v) => !v); }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${cropMode ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : crop ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)]"}`}
              title={crop ? "Clear the trim (back to the full frame)" : "Drag a box on the picture — the download is trimmed to it"}
            >
              <Crop size={15} /> {crop ? "Clear trim" : cropMode ? "Drag a box…" : "Trim"}
            </button>
          </>
        )}
        <button onClick={() => void exportPng()} disabled={!base || overlays.length === 0 || exporting} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download PNG{base ? ` (${outW}×${outH})` : ""}
        </button>
      </div>

      {/* Save / open */}
      <div className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name (e.g., Smith easement overlay)" className={`${input} w-64 max-w-full`} />
        <button onClick={() => void saveProject()} disabled={!base || overlays.length === 0 || saving} className="btn btn-accent inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {projectId ? "Save changes" : "Save project"}
        </button>
        {savedNote && <span className="text-sm text-[var(--c-success)]">Saved.</span>}
        {projects.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-2">
            <FolderOpen size={15} className="text-[var(--c-ink-muted)]" />
            <select
              value=""
              onChange={(e) => { const p = projects.find((x) => x.id === Number(e.target.value)); if (p) loadProject(p); }}
              className={input}
            >
              <option value="">Open a saved project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {projectId && (
              <button
                onClick={() => { if (confirm("Delete this saved project? The downloaded PNGs you've made are unaffected.")) { void deleteMapProject(projectId).then(() => { setProjectId(null); router.refresh(); }); } }}
                title="Delete this saved project"
                className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"
              >
                <Trash2 size={15} />
              </button>
            )}
          </span>
        )}
      </div>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      {/* Stage */}
      {!base ? (
        <div className={`${card} flex flex-col items-center justify-center gap-2 border-dashed p-16 text-center`}>
          <MapIcon size={30} className="text-[var(--c-accent)]" />
          <p className="text-sm font-medium">Load the aerial photo first, then lay the map over it.</p>
          <p className="max-w-md text-xs text-[var(--c-ink-muted)]">The download comes out at the aerial&apos;s full resolution, so start from the highest-resolution aerial you have. Save uploads the images so the project reopens exactly as you left it.</p>
        </div>
      ) : (
        <div
          ref={stageRef}
          onPointerDown={onStagePointerDown}
          className={`relative w-full touch-none select-none overflow-hidden rounded-lg border border-[var(--c-border)] bg-white ${cropMode ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: `${base.w} / ${base.h}` }}
        >
          {/* The aerial is a movable layer too — drag it, size it, rotate it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={base.url}
            alt="Aerial base"
            draggable={false}
            onPointerDown={(e) => startDrag(e, 0, baseTx.x, baseTx.y)}
            className={`absolute ${cropMode ? "pointer-events-none" : "cursor-move"}`}
            style={{
              left: baseTx.x * f,
              top: baseTx.y * f,
              width: base.w * baseTx.scale * f,
              height: base.h * baseTx.scale * f,
              transform: `translate(-50%, -50%) rotate(${baseTx.rotation}deg)`,
            }}
          />
          {overlays.map((o) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={o.id}
              src={o.url}
              alt={o.name}
              draggable={false}
              onPointerDown={(e) => startDrag(e, o.id, o.x, o.y)}
              className={`absolute ${cropMode ? "pointer-events-none" : "cursor-move"} ${o.id === activeId ? "outline outline-2 outline-[var(--c-accent)]" : ""}`}
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
          {/* Trim box — everything outside it is dimmed and cut from the download. */}
          {crop && crop.w > 0 && crop.h > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-[var(--c-accent)]"
              style={{ left: crop.x * f, top: crop.y * f, width: crop.w * f, height: crop.h * f, boxShadow: "0 0 0 100000px rgba(0,0,0,0.45)" }}
            />
          )}
          {cropMode && !crop && (
            <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
              <span className="rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium text-white">Drag a box around the area you want to keep</span>
            </div>
          )}
        </div>
      )}

      {/* Layer controls — the aerial first, then each overlay */}
      {base && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <MapIcon size={14} className="text-[var(--c-accent)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Aerial (background) — {base.name}</span>
              <button
                onClick={() => setBaseTx({ x: base.w / 2, y: base.h / 2, scale: 1, rotation: 0 })}
                title="Put the aerial back exactly filling the frame"
                className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
              >
                Reset
              </button>
            </div>
            <label className="block text-xs text-[var(--c-ink-muted)]">Size — {Math.round(baseTx.scale * 100)}%
              <input type="range" min={20} max={300} value={Math.round(baseTx.scale * 100)} onChange={(e) => setBaseTx((b) => ({ ...b, scale: Number(e.target.value) / 100 }))} className="w-full accent-[var(--c-accent)]" />
            </label>
            <label className="mt-1 block text-xs text-[var(--c-ink-muted)]">Rotation — {baseTx.rotation}°
              <input type="range" min={-180} max={180} value={baseTx.rotation} onChange={(e) => setBaseTx((b) => ({ ...b, rotation: Number(e.target.value) }))} className="w-full accent-[var(--c-accent)]" />
            </label>
            <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Drag the photo itself to move it. Download size: {outW}×{outH}{crop ? " (trimmed)" : ""}.</p>
          </div>
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
        <p className="flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><MousePointer2 size={13} /> Drag any layer — the aerial included — to line things up; the sliders handle opacity, size, and rotation. Trim crops the download; Save keeps the whole setup to reopen later.</p>
      )}
    </div>
  );
}
