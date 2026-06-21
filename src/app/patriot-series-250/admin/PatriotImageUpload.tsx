"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { uploadToBlob } from "@/lib/upload-client";

/**
 * Small reusable image upload tile for the Patriot admin. Uses the firm's
 * uploadToBlob helper (HEIC convert + downscale + Vercel Blob), then hands the
 * resulting URL back to the parent via onChange.
 */
export function PatriotImageUpload({
  label,
  hint,
  value,
  onChange,
  folder = "patriot",
  aspect = "square",
}: {
  label?: string;
  hint?: string;
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
  aspect?: "square" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const url = await uploadToBlob(file, folder);
      onChange(url);
    } catch (e) {
      setErr((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const box = aspect === "wide" ? "aspect-video max-w-[280px]" : "aspect-square max-w-[160px]";

  return (
    <div>
      {label && <p className="mb-1.5 text-xs font-semibold text-white/80">{label}</p>}
      <div className={`relative ${box} w-full overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.03]`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-contain" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/45 transition-colors hover:text-white/75"
          >
            {busy ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
            <span className="text-[11px]">{busy ? "Uploading…" : "Upload"}</span>
          </button>
        )}
        {value && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1.5 py-1">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded px-2 py-0.5 text-[11px] text-white/85 hover:bg-white/15">
              {busy ? "…" : "Replace"}
            </button>
            <button type="button" onClick={() => onChange("")} className="rounded px-1.5 py-0.5 text-red-300 hover:bg-white/15">
              <X size={12} />
            </button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif,.ico,.svg"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {hint && <p className={`mt-1.5 text-[11px] leading-relaxed text-white/45 ${aspect === "wide" ? "max-w-[280px]" : "max-w-[160px]"}`}>{hint}</p>}
      {err && <p className="mt-1 text-[11px] text-red-300">{err}</p>}
    </div>
  );
}
