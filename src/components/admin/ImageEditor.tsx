"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Wand2,
  Scissors,
  Loader2,
  Download,
  X,
} from "lucide-react";
import {
  NEUTRAL,
  BRAND_FILTERS,
  ASPECT_PRESETS,
  renderToCanvas,
  type Adjustments,
  type CropRect,
} from "@/lib/image/filters";

type Backdrop = { type: "none" | "solid" | "gradient"; color: string; color2: string };

export function ImageEditor({
  src,
  onClose,
  onSaved,
}: {
  src: string;
  onClose: () => void;
  onSaved?: (url: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImg = useRef<HTMLImageElement | null>(null);
  const cutoutImg = useRef<HTMLImageElement | null>(null);

  const [adj, setAdj] = useState<Adjustments>(NEUTRAL);
  const [aspect, setAspect] = useState<string>("free");
  const [zoom, setZoom] = useState(1); // 1 = full image within aspect
  const [loaded, setLoaded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeProgress, setRemoveProgress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasCutout, setHasCutout] = useState(false);
  const [backdrop, setBackdrop] = useState<Backdrop>({ type: "none", color: "#14110f", color2: "#7a1f2b" });
  const [error, setError] = useState<string | null>(null);
  // Crop position offset (image pixels) set by dragging the preview to recenter.
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const activeImg = () => (hasCutout ? cutoutImg.current : baseImg.current);

  // Render-safe flag (no ref access): is a crop region currently in effect?
  const cropActive =
    aspect !== "free" || zoom !== 1 || cropOffset.x !== 0 || cropOffset.y !== 0;

  const computeCrop = useCallback((): CropRect => {
    const img = activeImg();
    if (!img) return null;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const preset = ASPECT_PRESETS.find((p) => p.id === aspect);

    let w: number;
    let h: number;
    if (!preset?.ratio) {
      if (zoom === 1 && cropOffset.x === 0 && cropOffset.y === 0) return null;
      w = iw / zoom;
      h = ih / zoom;
    } else {
      // Fit a crop of the requested aspect inside the image, then apply zoom.
      w = iw;
      h = w / preset.ratio;
      if (h > ih) {
        h = ih;
        w = h * preset.ratio;
      }
      w /= zoom;
      h /= zoom;
    }

    // Center, then apply the drag offset, clamped so the crop stays in-bounds.
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const x = clamp((iw - w) / 2 + cropOffset.x, 0, Math.max(0, iw - w));
    const y = clamp((ih - h) / 2 + cropOffset.y, 0, Math.max(0, ih - h));
    return { x, y, w, h };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, zoom, hasCutout, cropOffset]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = activeImg();
    if (!canvas || !img) return;
    renderToCanvas(
      canvas,
      img,
      img.naturalWidth,
      img.naturalHeight,
      adj,
      computeCrop(),
      hasCutout ? backdrop : undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adj, computeCrop, hasCutout, backdrop]);

  // Load the source image.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImg.current = img;
      setLoaded(true);
    };
    img.onerror = () => setError("Could not load image (CORS?). Use a Blob-hosted image.");
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  async function removeBackground() {
    setRemoving(true);
    setError(null);
    setRemoveProgress("Starting…");
    try {
      const mod = await import("@imgly/background-removal");
      const blob = await mod.removeBackground(src, {
        // Quantized model: ~half the download of the default, faster inference.
        model: "isnet_quint8",
        output: { format: "image/png" },
        progress: (key: string, current: number, total: number) => {
          const pct = total ? Math.round((current / total) * 100) : 0;
          if (key.startsWith("fetch")) setRemoveProgress(`Loading model… ${pct}% (one-time)`);
          else setRemoveProgress(`Processing… ${pct}%`);
        },
      });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        cutoutImg.current = img;
        setHasCutout(true);
        setBackdrop((b) => ({ ...b, type: "solid" }));
        setRemoving(false);
        setRemoveProgress(null);
      };
      img.src = url;
    } catch (e) {
      setError("Background removal failed. " + (e as Error).message);
      setRemoving(false);
      setRemoveProgress(null);
    }
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError(null);
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), hasCutout ? "image/png" : "image/jpeg", 0.92),
      );
      const form = new FormData();
      form.append("file", new File([blob], `edited-${Date.now()}.${hasCutout ? "png" : "jpg"}`, { type: blob.type }));
      form.append("folder", "edited");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onSaved?.(data.url);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof Adjustments, v: number | boolean) => setAdj((a) => ({ ...a, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--c-bg)] rounded-lg w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-3">
          <h3 className="font-[family-name:var(--font-display)] text-xl">Image editor</h3>
          <button onClick={onClose} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={20} /></button>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] overflow-hidden flex-1">
          {/* Canvas */}
          <div className="bg-[var(--c-surface2)] flex items-center justify-center p-6 overflow-auto checkerboard">
            {loaded ? (
              <canvas
                ref={canvasRef}
                onPointerDown={(e) => {
                  if (!computeCrop()) return; // nothing to reposition unless cropped
                  (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                  dragStart.current = { x: e.clientX, y: e.clientY, ox: cropOffset.x, oy: cropOffset.y };
                }}
                onPointerMove={(e) => {
                  const start = dragStart.current;
                  const canvas = canvasRef.current;
                  const crop = computeCrop();
                  if (!start || !canvas || !crop) return;
                  const scaleX = crop.w / canvas.clientWidth;
                  const scaleY = crop.h / canvas.clientHeight;
                  const dx = (e.clientX - start.x) * scaleX;
                  const dy = (e.clientY - start.y) * scaleY;
                  setCropOffset({ x: start.ox - dx, y: start.oy - dy });
                }}
                onPointerUp={() => (dragStart.current = null)}
                onPointerLeave={() => (dragStart.current = null)}
                className={`max-w-full max-h-[70vh] object-contain shadow-lg touch-none ${
                  cropActive ? "cursor-grab active:cursor-grabbing" : ""
                }`}
              />
            ) : (
              <Loader2 className="animate-spin text-[var(--c-ink-muted)]" />
            )}
          </div>

          {/* Controls */}
          <div className="border-l border-[var(--c-border)] overflow-y-auto p-5 space-y-6">
            {/* Brand filters */}
            <section>
              <h4 className="text-xs uppercase tracking-[0.14em] text-[var(--c-ink-muted)] mb-2">Branded filters</h4>
              <div className="grid grid-cols-2 gap-2">
                {BRAND_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setAdj({ ...NEUTRAL, ...f.apply } as Adjustments)}
                    title={f.description}
                    className="text-sm border border-[var(--c-border)] rounded px-3 py-2 hover:border-[var(--c-accent)] flex items-center gap-1.5"
                  >
                    <Wand2 size={13} /> {f.name}
                  </button>
                ))}
                <button onClick={() => setAdj(NEUTRAL)} className="text-sm text-[var(--c-ink-muted)] col-span-2 py-1">
                  Reset adjustments
                </button>
              </div>
            </section>

            {/* Adjustments */}
            <section className="space-y-3">
              <h4 className="text-xs uppercase tracking-[0.14em] text-[var(--c-ink-muted)]">Adjustments</h4>
              <Slider label="Brightness" min={0.5} max={1.5} step={0.01} value={adj.brightness} onChange={(v) => set("brightness", v)} />
              <Slider label="Contrast" min={0.5} max={1.5} step={0.01} value={adj.contrast} onChange={(v) => set("contrast", v)} />
              <Slider label="Saturation" min={0} max={2} step={0.01} value={adj.saturation} onChange={(v) => set("saturation", v)} disabled={adj.monochrome} />
              <Slider label="Warmth" min={-100} max={100} step={1} value={adj.warmth} onChange={(v) => set("warmth", v)} />
              <Slider label="Sharpness" min={0} max={100} step={1} value={adj.sharpness} onChange={(v) => set("sharpness", v)} />
              <Slider label="Vignette" min={0} max={100} step={1} value={adj.vignette} onChange={(v) => set("vignette", v)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={adj.monochrome} onChange={(e) => set("monochrome", e.target.checked)} className="accent-[var(--c-accent)]" />
                Monochrome
              </label>
            </section>

            {/* Transform */}
            <section>
              <h4 className="text-xs uppercase tracking-[0.14em] text-[var(--c-ink-muted)] mb-2">Transform</h4>
              <div className="flex gap-2">
                <IconBtn onClick={() => set("rotate", (adj.rotate + 90) % 360)} title="Rotate"><RotateCw size={16} /></IconBtn>
                <IconBtn onClick={() => set("flipH", !adj.flipH)} title="Flip horizontal" active={adj.flipH}><FlipHorizontal size={16} /></IconBtn>
                <IconBtn onClick={() => set("flipV", !adj.flipV)} title="Flip vertical" active={adj.flipV}><FlipVertical size={16} /></IconBtn>
              </div>
            </section>

            {/* Crop */}
            <section>
              <h4 className="text-xs uppercase tracking-[0.14em] text-[var(--c-ink-muted)] mb-2">Crop</h4>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ASPECT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setAspect(p.id);
                      setCropOffset({ x: 0, y: 0 });
                    }}
                    className={`text-xs px-2 py-1 rounded border ${aspect === p.id ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Slider label="Zoom" min={1} max={3} step={0.05} value={zoom} onChange={setZoom} />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-[var(--c-ink-muted)]">
                  {cropActive ? "Drag the image to reposition the crop." : "Zoom or pick a ratio to crop."}
                </p>
                {(cropOffset.x !== 0 || cropOffset.y !== 0) && (
                  <button
                    onClick={() => setCropOffset({ x: 0, y: 0 })}
                    className="text-xs text-[var(--c-accent)]"
                  >
                    Re-center
                  </button>
                )}
              </div>
            </section>

            {/* Background removal + headshot canvas */}
            <section>
              <h4 className="text-xs uppercase tracking-[0.14em] text-[var(--c-ink-muted)] mb-2">Background &amp; headshot</h4>
              <button onClick={removeBackground} disabled={removing} className="btn btn-outline text-sm py-2 px-3 w-full justify-center">
                {removing ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
                {removing ? "Removing…" : hasCutout ? "Background removed" : "Remove background"}
              </button>
              {removing && removeProgress && (
                <p className="mt-2 text-xs text-[var(--c-ink-muted)]">{removeProgress}</p>
              )}
              {hasCutout && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-1.5">
                    {(["none", "solid", "gradient"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setBackdrop((b) => ({ ...b, type: t }))}
                        className={`text-xs px-2 py-1 rounded border capitalize ${backdrop.type === t ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {backdrop.type !== "none" && (
                    <div className="flex items-center gap-2">
                      <input type="color" value={backdrop.color} onChange={(e) => setBackdrop((b) => ({ ...b, color: e.target.value }))} className="h-8 w-8 rounded border border-[var(--c-border)]" />
                      {backdrop.type === "gradient" && (
                        <input type="color" value={backdrop.color2} onChange={(e) => setBackdrop((b) => ({ ...b, color2: e.target.value }))} className="h-8 w-8 rounded border border-[var(--c-border)]" />
                      )}
                      <span className="text-xs text-[var(--c-ink-muted)]">Headshot backdrop</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
          </div>
        </div>

        <div className="border-t border-[var(--c-border)] px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-[var(--c-ink-muted)]">Original is preserved — edits export as a new asset.</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
            <button onClick={save} disabled={saving || !loaded} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Save as new
            </button>
          </div>
        </div>
      </div>
      <style>{`.checkerboard{background-image:linear-gradient(45deg,#0001 25%,transparent 25%),linear-gradient(-45deg,#0001 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0001 75%),linear-gradient(-45deg,transparent 75%,#0001 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}`}</style>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="text-[var(--c-ink-muted)] tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--c-accent)]"
      />
    </div>
  );
}

function IconBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2.5 rounded border ${active ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"} hover:border-[var(--c-accent)]`}
    >
      {children}
    </button>
  );
}
