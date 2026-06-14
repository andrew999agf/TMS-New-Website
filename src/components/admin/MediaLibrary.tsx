"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, Wand2 } from "lucide-react";
import { ImageEditor } from "./ImageEditor";
import { uploadToBlob } from "@/lib/upload-client";

type Asset = { id: number; url: string; kind: string; alt: string | null; folder: string | null };

// Bump this string on each media-upload change so we can confirm a deploy landed.
const UPLOADER_BUILD = "uploader v5 — OIDC (blob 2.x) + auto-shrink";

export function MediaLibrary({
  assets,
  blobConfigured,
  detected,
}: {
  assets: Asset[];
  blobConfigured: boolean;
  detected?: Record<string, boolean>;
}) {
  const [items, setItems] = useState<Asset[]>(assets);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadToBlob(file, "uploads");
        setItems((prev) => [
          { id: Math.random(), url, kind: file.type.startsWith("video") ? "video" : "image", alt: null, folder: "uploads" },
          ...prev,
        ]);
      }
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {!blobConfigured && (
        <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface2)] p-4 text-sm text-[var(--c-ink-muted)]">
          <p className="font-medium text-[var(--c-ink)]">Media storage not detected for this deployment.</p>
          <p className="mt-1">
            This build looks for a connected Vercel Blob store. Runtime check:
          </p>
          {detected && (
            <ul className="mt-2 font-mono text-xs">
              {Object.entries(detected).map(([k, v]) => (
                <li key={k}>
                  {v ? "✓" : "✗"} {k}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        onClick={() => !uploading && blobConfigured && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (blobConfigured) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (blobConfigured) handleFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        className={`w-full rounded-lg border-2 border-dashed py-12 flex flex-col items-center gap-2 transition-colors cursor-pointer ${
          dragOver ? "border-[var(--c-accent)] bg-[var(--c-surface2)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]"
        } ${uploading || !blobConfigured ? "opacity-50 pointer-events-none" : ""}`}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Upload size={24} />}
        <span className="text-sm font-medium">{uploading ? "Uploading…" : "Drag photos here, or click to choose files"}</span>
        <span className="text-xs text-[var(--c-ink-muted)]">Images and video. Videos up to ~15&nbsp;MB; MP4 plays everywhere.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif,video/mp4,video/webm,video/quicktime,.mov"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && <p className="mt-3 text-sm text-[var(--c-error)]">{error}</p>}
      <p className="mt-2 text-[10px] text-[var(--c-ink-muted)] opacity-60">
        {UPLOADER_BUILD}
        {detected && (
          <>
            {" · "}
            {Object.entries(detected)
              .map(([k, v]) => `${v ? "✓" : "✗"}${k.replace("BLOB_", "").replace("VERCEL_", "")}`)
              .join(" ")}
          </>
        )}
      </p>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg overflow-hidden border border-[var(--c-border)] bg-[var(--c-surface)] group relative">
            <div className="aspect-square bg-[var(--c-surface2)] flex items-center justify-center overflow-hidden">
              {a.kind === "video" ? (
                <video src={a.url} className="h-full w-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.alt ?? ""} className="h-full w-full object-cover" />
              )}
            </div>
            {a.kind !== "video" && (
              <button
                onClick={() => setEditing(a.url)}
                className="absolute inset-x-0 top-0 m-2 self-start opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--c-accent)] text-[var(--c-on-accent)] text-xs px-2 py-1 rounded flex items-center gap-1 w-fit"
              >
                <Wand2 size={12} /> Edit
              </button>
            )}
            <div className="p-2 text-xs text-[var(--c-ink-muted)] truncate">{a.folder ?? "—"}</div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="col-span-full text-sm text-[var(--c-ink-muted)] py-8 text-center">
            No media yet.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-[var(--c-ink-muted)]">
        Hover any image and choose <strong>Edit</strong> for crop, branded filters, background
        removal, and the headshot canvas. Originals are preserved; edits save as new assets.
      </p>

      {editing && (
        <ImageEditor
          src={editing}
          onClose={() => setEditing(null)}
          onSaved={(url) =>
            setItems((prev) => [
              { id: Math.random(), url, kind: "image", alt: null, folder: "edited" },
              ...prev,
            ])
          }
        />
      )}
    </div>
  );
}
