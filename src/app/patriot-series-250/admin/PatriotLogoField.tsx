"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X, Pencil, Scissors, Replace as ReplaceIcon } from "lucide-react";
import { uploadToBlob } from "@/lib/upload-client";
import { keyOutBackground } from "@/lib/patriot/color-key";

/**
 * Patriot admin logo field. Upload, then an explicit "Edit" button reveals:
 *  - Remove background colour — a flat-colour key (samples the border colour
 *    and erases only that one colour within an adjustable tolerance). It always
 *    keys from the ORIGINAL upload, so the strength slider can be re-tuned.
 *  - Make white — recolours the (transparent) logo to a white silhouette.
 * Preview sits on a checkerboard so transparency is obvious.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
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
  // The un-keyed source we re-process from, so the slider can be re-tuned.
  const [original, setOriginal] = useState<string | undefined>(value || undefined);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [tolerance, setTolerance] = useState(55);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadToBlob(file, folder);
      setOriginal(url);
      onChange(url);
      setEditing(true);
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeBg() {
    const src = original || value;
    if (!src) return;
    setWorking(true);
    setError(null);
    try {
      const blob = await keyOutBackground(src, tolerance);
      const url = await uploadToBlob(new File([blob], "keyed.png", { type: "image/png" }), folder);
      onChange(url);
    } catch (e) {
      setError("Couldn't remove the background colour. " + (e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function makeWhite() {
    if (!value) return;
    setWorking(true);
    setError(null);
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
      setError("Could not recolour — remove the background first. " + (e as Error).message);
    } finally {
      setWorking(false);
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
                <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Edit logo</p>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-white/65">
                      <span>Background match strength</span>
                      <span className="tabular-nums">{tolerance}</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={120}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="mt-1 w-full accent-blue-500"
                    />
                    <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">
                      Higher removes more shades of the one background colour. Re-tunes from the original each time.
                    </p>
                  </div>

                  <button type="button" onClick={removeBg} disabled={working} className={`${btn} w-full justify-start`}>
                    {working ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />} Remove background colour
                  </button>
                  <button type="button" onClick={makeWhite} disabled={working} className={`${btn} w-full justify-start`}>
                    <span className="inline-block h-3 w-3 rounded-full border border-white/30 bg-white" /> Make white (dark-mode silhouette)
                  </button>
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
