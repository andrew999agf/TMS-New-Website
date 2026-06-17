"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X, Link2, Scissors } from "lucide-react";
import { MEDIA_SPECS, type MediaSlot } from "@/lib/media-specs";
import { uploadToBlob } from "@/lib/upload-client";

/**
 * Reusable image/video field used across the admin: upload a file (primary) or
 * paste a URL (secondary). Shows a live preview and the recommended dimensions
 * for the given slot. Image values get an optional one-click background remover.
 */
export function ImageUploadField({
  value,
  onChange,
  slot,
  accept = "image/*,.heic,.heif",
  folder = "uploads",
  label,
  allowRemoveBg = true,
}: {
  value: string;
  onChange: (url: string) => void;
  slot?: MediaSlot;
  accept?: string;
  folder?: string;
  label?: string;
  allowRemoveBg?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgWorking, setBgWorking] = useState(false);
  const [bgProgress, setBgProgress] = useState<string | null>(null);
  const spec = slot ? MEDIA_SPECS[slot] : null;
  const isVideo = value && /\.(mp4|webm|mov)(\?|$)/i.test(value);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadToBlob(file, folder);
      onChange(url);
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function makeWhite() {
    if (!value) return;
    setBgWorking(true);
    setError(null);
    setBgProgress("Recoloring to white…");
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not load image"));
        el.src = value;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(img, 0, 0);
      // Keep the logo's transparency, recolor everything opaque to white.
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Export failed");
      const url = await uploadToBlob(new File([blob], "white.png", { type: "image/png" }), folder);
      onChange(url);
    } catch (e) {
      setError("Could not recolor. Use a transparent PNG (remove the background first). " + (e as Error).message);
    } finally {
      setBgWorking(false);
      setBgProgress(null);
    }
  }

  async function removeBg() {
    if (!value) return;
    setBgWorking(true);
    setError(null);
    setBgProgress("Starting…");
    try {
      const { removeBackground } = await import("@/lib/background-removal");
      const blob = await removeBackground(value, (msg) => setBgProgress(msg));
      const file = new File([blob], "cutout.png", { type: "image/png" });
      const url = await uploadToBlob(file, folder);
      onChange(url);
    } catch (e) {
      setError("Background removal failed. " + (e as Error).message);
    } finally {
      setBgWorking(false);
      setBgProgress(null);
    }
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium mb-1.5">{label}</label>}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
        {value ? (
          <div className="flex items-start gap-3">
            <div className="h-20 w-28 shrink-0 rounded overflow-hidden bg-[var(--c-surface2)] flex items-center justify-center">
              {isVideo ? (
                <video src={value} className="h-full w-full object-contain" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value} alt="" className="h-full w-full object-contain" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-[var(--c-ink-muted)] truncate">{value}</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => inputRef.current?.click()} disabled={uploading} className="text-xs text-[var(--c-accent)]">
                  Replace
                </button>
                <button onClick={() => onChange("")} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-error)] flex items-center gap-1">
                  <X size={12} /> Remove
                </button>
              </div>
              {allowRemoveBg && !isVideo && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <button
                    onClick={removeBg}
                    disabled={bgWorking}
                    className="text-xs text-[var(--c-accent)] flex items-center gap-1 disabled:opacity-60 w-fit"
                  >
                    {bgWorking ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                    {bgWorking ? "Working…" : "Remove background / make transparent"}
                  </button>
                  <button
                    onClick={makeWhite}
                    disabled={bgWorking}
                    className="text-xs text-[var(--c-accent)] flex items-center gap-1 disabled:opacity-60 w-fit"
                  >
                    <span className="inline-block h-3 w-3 rounded-full bg-white border border-[var(--c-border)]" />
                    Make white (transparent background)
                  </button>
                  {bgProgress && <p className="text-[10px] text-[var(--c-ink-muted)]">{bgProgress}</p>}
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full py-6 flex flex-col items-center gap-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
          >
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
            <span className="text-sm font-medium">{uploading ? "Uploading…" : "Upload a file"}</span>
            {spec && <span className="text-xs">{spec.size}</span>}
          </button>
        )}

        <button onClick={() => setShowUrl((v) => !v)} className="mt-2 text-xs text-[var(--c-ink-muted)] flex items-center gap-1 hover:text-[var(--c-ink)]">
          <Link2 size={12} /> {showUrl ? "Hide" : "Or paste a URL"}
        </button>
        {showUrl && (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            className="mt-2 w-full border border-[var(--c-border)] bg-[var(--c-surface)] p-2 text-xs outline-none focus:border-[var(--c-accent)]"
          />
        )}
        {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
