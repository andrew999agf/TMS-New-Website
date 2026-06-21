"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import styles from "./patriot.module.css";

/**
 * Full-width hero banner with a Ken Burns slow-zoom and crossfade between the
 * admin-uploaded banner images. A dark gradient keeps the overlaid title
 * readable in both themes. Empty → a sized placeholder.
 */
export function PatriotBanner({
  images,
  eyebrow,
  title,
  subtitle,
}: {
  images: string[];
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  const [idx, setIdx] = useState(0);
  const valid = images.filter(Boolean);

  useEffect(() => {
    if (valid.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % valid.length), 6500);
    return () => clearInterval(t);
  }, [valid.length]);

  return (
    <section className="relative h-[42vh] min-h-[300px] w-full overflow-hidden border-b border-[color:var(--psx-border)] bg-[var(--psx-surface-2)]">
      {valid.length > 0 ? (
        valid.map((src, i) => (
          <div key={`${src}-${i}`} className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? "opacity-100" : "opacity-0"}`}>
            <div className={styles.kenburns} style={{ backgroundImage: `url(${src})` }} />
          </div>
        ))
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[color:var(--psx-faint)]">
          <ImageIcon size={30} strokeWidth={1.5} />
          <p className="text-xs font-semibold text-[color:var(--psx-muted)]">Hero banner</p>
          <p className="text-[11px]">1920 × 800 · add photos in Admin → Banners</p>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-6xl px-5 pb-8">
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80 sm:text-xs">{eyebrow}</p>}
          <h1 className="mt-1.5 font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-white drop-shadow-lg sm:text-6xl">{title}</h1>
          {subtitle && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">{subtitle}</p>}
        </div>
      </div>
    </section>
  );
}
