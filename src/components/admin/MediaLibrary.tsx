"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, Wand2 } from "lucide-react";
import { ImageEditor } from "./ImageEditor";

type Asset = { id: number; url: string; kind: string; alt: string | null; folder: string | null };

export function MediaLibrary({
  assets,
  blobConfigured,
}: {
  assets: Asset[];
  blobConfigured: boolean;
}) {
  const [items, setItems] = useState<Asset[]>(assets);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/admin/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setItems((prev) => [
          { id: data.id ?? Math.random(), url: data.url, kind: file.type.startsWith("video") ? "video" : "image", alt: null, folder: "uploads" },
          ...prev,
        ]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {!blobConfigured && (
        <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface2)] p-4 text-sm text-[var(--c-ink-muted)]">
          Vercel Blob is not configured yet. Set <code>BLOB_READ_WRITE_TOKEN</code> to enable
          uploads. The library and uploader are ready and will work the moment the token is added.
        </div>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !blobConfigured}
        className="w-full rounded-lg border-2 border-dashed border-[var(--c-border)] py-12 flex flex-col items-center gap-2 hover:border-[var(--c-accent)] transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Upload size={24} />}
        <span className="text-sm font-medium">{uploading ? "Uploading…" : "Drop files or click to upload"}</span>
        <span className="text-xs text-[var(--c-ink-muted)]">Images and video. Keep banner clips under ~20MB, 10–20 seconds.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && <p className="mt-3 text-sm text-[var(--c-error)]">{error}</p>}

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
