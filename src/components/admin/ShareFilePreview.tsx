"use client";

import { useEffect, useState } from "react";
import { X, ChevronsRight, Download } from "lucide-react";

export type PreviewFile = { name: string; previewUrl: string; downloadUrl: string };

const IMG_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"]);
// Formats browsers can play inline. Others (avi, wmv, mkv) still fall back to download.
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const AUDIO_EXT = new Set(["mp3", "m4a", "wav", "aac", "ogg", "oga"]);
const MIME: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg",
};

/**
 * Slide-out preview panel shared by the recipient portal and the admin folder
 * view. PDFs render in a frame, images inline, other types offer a download.
 */
export function ShareFilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const [content, setContent] = useState(file);
  useEffect(() => { if (file) setContent(file); }, [file]);
  const open = !!file;
  const cur = content;
  const ext = cur ? (cur.name.split(".").pop()?.toLowerCase() ?? "") : "";

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        onTransitionEnd={() => { if (!open) setContent(null); }}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(94vw,640px)] flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)] shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
          <button onClick={onClose} title="Close preview" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--c-ink)]">{cur?.name}</span>
          {cur && <a href={cur.downloadUrl} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Download"><Download size={16} /></a>}
          <button onClick={onClose} title="Slide back" className="rounded p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><ChevronsRight size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--c-surface2)]">
          {cur && ext === "pdf" && <iframe src={cur.previewUrl} title={cur.name} className="h-full w-full border-0" />}
          {cur && IMG_EXT.has(ext) && (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="flex h-full items-center justify-center p-3"><img src={cur.previewUrl} alt={cur.name} className="max-h-full max-w-full object-contain" /></div>
          )}
          {cur && VIDEO_EXT.has(ext) && (
            <div className="flex h-full items-center justify-center bg-black p-2">
              <video key={cur.previewUrl} controls autoPlay playsInline className="max-h-full max-w-full">
                <source src={cur.previewUrl} type={MIME[ext]} />
                Your browser can&apos;t play this video.
              </video>
            </div>
          )}
          {cur && AUDIO_EXT.has(ext) && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
              <p className="max-w-full truncate text-sm text-[var(--c-ink-muted)]">{cur.name}</p>
              <audio key={cur.previewUrl} controls autoPlay className="w-full max-w-md">
                <source src={cur.previewUrl} type={MIME[ext]} />
              </audio>
            </div>
          )}
          {cur && ext !== "pdf" && !IMG_EXT.has(ext) && !VIDEO_EXT.has(ext) && !AUDIO_EXT.has(ext) && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-[var(--c-ink-muted)]">This file type can&apos;t be previewed in the browser.</p>
              <a href={cur.downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white"><Download size={14} /> Download to open</a>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
