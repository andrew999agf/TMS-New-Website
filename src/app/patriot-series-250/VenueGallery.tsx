"use client";

import { useEffect, useState } from "react";
import { ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";

/** A venue "photo book": a thumbnail grid that opens a full-screen lightbox you
 * can flip through. Empty → sized placeholders. */
export function VenueGallery({ photos, label }: { photos: string[]; label: string }) {
  const list = photos.filter(Boolean);
  const [open, setOpen] = useState<number | null>(null);

  const step = (d: number) =>
    setOpen((i) => (i === null ? i : (i + d + list.length) % list.length));

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list.length]);

  if (list.length === 0) {
    return (
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[color:var(--psx-border)] bg-[var(--psx-surface-2)] text-[color:var(--psx-faint)]">
            <ImageIcon size={20} />
            <span className="text-[10px]">{label} photo · 1600×900</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((src, i) => (
          <button key={`${src}-${i}`} onClick={() => setOpen(i)} className="group relative aspect-video overflow-hidden rounded-xl border border-[color:var(--psx-border)] bg-[var(--psx-surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          </button>
        ))}
      </div>

      {open !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <button className="absolute right-4 top-4 text-white/80 transition-colors hover:text-white" onClick={() => setOpen(null)} aria-label="Close">
            <X size={26} />
          </button>
          {list.length > 1 && (
            <>
              <button className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 transition-colors hover:text-white" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous">
                <ChevronLeft size={34} />
              </button>
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 transition-colors hover:text-white" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next">
                <ChevronRight size={34} />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[open]} alt="" className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <span className="absolute bottom-4 text-[11px] uppercase tracking-wider text-white/70">{label} · {open + 1} / {list.length}</span>
        </div>
      )}
    </>
  );
}
