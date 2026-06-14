"use client";

import { useEffect, useRef, useState } from "react";
import { MEDIA_SPECS } from "@/lib/media-specs";

export type BannerMedia = {
  id: string | number;
  kind: "image" | "video";
  url?: string | null;
  posterUrl?: string | null;
  alt?: string | null;
  durationMs?: number;
  kenBurns?: { enabled: boolean; direction: string; intensity: number } | null;
  /** Focal point: center | top | bottom | left | right */
  focal?: string | null;
  /** Placeholder color block when no media is supplied yet */
  placeholderColor?: string;
  placeholderLabel?: string;
};

/**
 * Hero media sequence: ordered video clips and stills with crossfade
 * transitions, per-item duration, and Ken Burns motion on stills. Honors
 * prefers-reduced-motion (no zoom, no autoplay) and falls back to labeled
 * placeholder blocks until real media is uploaded through the admin.
 */
export function HeroBanner({ items }: { items: BannerMedia[] }) {
  const [active, setActive] = useState(0);
  const reduced = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const list = items.length ? items : DEFAULT_PLACEHOLDERS;
  const single = list.length === 1;

  useEffect(() => {
    if (list.length <= 1) return;
    const current = list[active];
    const duration = current?.durationMs ?? 6000;
    timer.current = setTimeout(() => {
      setActive((i) => (i + 1) % list.length);
    }, duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, list]);

  // Whenever an item becomes active, restart its video from the very beginning
  // (so clients never see it resume from the middle).
  useEffect(() => {
    const v = videoRefs.current[active];
    if (v) {
      try {
        v.currentTime = 0;
        const p = v.play();
        if (p) p.catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--c-dark-bg)]" aria-hidden="true">
      {list.map((item, i) => {
        const isActive = i === active;
        const kb = item.kenBurns?.enabled && !reduced;
        return (
          <div
            key={item.id}
            className="absolute inset-0 transition-opacity duration-[1400ms] ease-in-out"
            style={{ opacity: isActive ? 1 : 0 }}
          >
            {item.kind === "video" && item.url && !reduced ? (
              <video
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                className="h-full w-full object-cover"
                style={{ objectPosition: item.focal || "center" }}
                src={item.url}
                poster={item.posterUrl ?? undefined}
                autoPlay
                muted
                loop={single}
                playsInline
                preload="metadata"
              />
            ) : item.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt=""
                className={`h-full w-full object-cover ${kb && isActive ? "kenburns" : ""}`}
                style={{ objectPosition: item.focal || "center" }}
              />
            ) : (
              <PlaceholderBlock
                color={item.placeholderColor}
                label={item.placeholderLabel}
                animate={kb && isActive}
              />
            )}
          </div>
        );
      })}
      {/* Readability scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-dark-bg)] via-[var(--c-dark-bg)]/55 to-[var(--c-dark-bg)]/75" />
    </div>
  );
}

function PlaceholderBlock({
  color,
  label,
  animate,
}: {
  color?: string;
  label?: string;
  animate?: boolean;
}) {
  return (
    <div
      className={`h-full w-full flex items-center justify-center ${animate ? "kenburns" : ""}`}
      style={{
        background: color
          ? `linear-gradient(135deg, ${color}, var(--c-dark-bg))`
          : "linear-gradient(135deg, var(--c-dark-surface), var(--c-dark-bg))",
      }}
    >
      {label && (
        <span className="flex flex-col items-center gap-1.5 text-center px-4">
          <span className="text-[var(--c-dark-ink-muted)] text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-ui)] opacity-50">
            {label} — replace via admin
          </span>
          <span className="text-[var(--c-dark-ink-muted)] text-[11px] opacity-40">
            {MEDIA_SPECS.heroBanner.size}
          </span>
        </span>
      )}
    </div>
  );
}

const DEFAULT_PLACEHOLDERS: BannerMedia[] = [
  {
    id: "ph-1",
    kind: "image",
    placeholderColor: "#23303d",
    placeholderLabel: "Courtroom footage",
    durationMs: 6500,
    kenBurns: { enabled: true, direction: "in", intensity: 1 },
  },
  {
    id: "ph-2",
    kind: "image",
    placeholderColor: "#2a2420",
    placeholderLabel: "Fort Worth skyline",
    durationMs: 6500,
    kenBurns: { enabled: true, direction: "in", intensity: 1 },
  },
  {
    id: "ph-3",
    kind: "image",
    placeholderColor: "#1f2a22",
    placeholderLabel: "Courthouse exterior",
    durationMs: 6500,
    kenBurns: { enabled: true, direction: "in", intensity: 1 },
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
