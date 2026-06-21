"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X, Pencil, Scissors, Replace as ReplaceIcon } from "lucide-react";
import { uploadToBlob } from "@/lib/upload-client";

/**
 * Patriot admin logo field with an explicit "Edit" button that reveals the
 * background tools — Remove background (make transparent) and Make white (for
 * the dark-mode silhouette). Reuses the firm's blob upload + ML background
 * removal. The preview sits on a checkerboard so transparency is obvious.
 */
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = src;
  });
}

const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0",
};

export function PatriotLogoField({
  label,
  value,
  onChange,
  folder = "patriot",
}: {
  label?: string;
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadToBlob(file, folder);
      onChange(url);
      setEditing(true);
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeBg() {
    if (!value) return;
    setWorking(true);
    setError(null);
    setProgress("Loading…");
    try {
      const { removeBackground } = await import("@/lib/background-removal");
      const blob = await removeBackground(value, (m: string) => setProgress(m));
      const url = await uploadToBlob(new File([blob], "cutout.png", { type: "image/png" }), folder);
      onChange(url);
    } catch (e) {
      setError("Background removal failed. " + (e as Error).message);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  async function makeWhite() {
    if (!value) return;
    setWorking(true);
    setError(null);
    setProgress("Recoloring…");
    try {
      const img = await loadImage(value);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Export failed");
      const url = await uploadToBlob(new File([blob], "white.png", { type: "image/png" }), folder);
      onChange(url);
    } catch (e) {
      setError("Could not recolor — remove the background first. " + (e as Error).message);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50";

  return (
    <div>
      {label && <p className="mb-1.5 text-xs font-semibold text-white/80">{label}</p>}
      {!value ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-square w-full max-w-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-white/45 transition-colors hover:text-white/75"
        >
          {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
          <span className="text-[11px]">{uploading ? "Uploading…" : "Upload"}</span>
        </button>
      ) : (
        <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={CHECKER}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing((v) => !v)} className={btn}>
                  <Pencil size={12} /> Edit
                </button>
                <button type="button" onClick={() => inputRef.current?.click()} className={btn}>
                  <ReplaceIcon size={12} /> Replace
                </button>
                <button type="button" onClick={() => onChange("")} className={`${btn} hover:border-red-400/40 hover:text-red-300`}>
                  <X size={12} /> Remove
                </button>
              </div>
              {editing && (
                <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Edit logo</p>
                  <button type="button" onClick={removeBg} disabled={working} className={`${btn} w-full justify-start`}>
                    {working ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />} Remove background (make transparent)
                  </button>
                  <button type="button" onClick={makeWhite} disabled={working} className={`${btn} w-full justify-start`}>
                    <span className="inline-block h-3 w-3 rounded-full border border-white/30 bg-white" /> Make white (dark-mode silhouette)
                  </button>
                  {progress && <p className="text-[10px] text-white/50">{progress}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif,.svg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-1.5 text-[11px] leading-relaxed text-red-300">{error}</p>}
    </div>
  );
}
