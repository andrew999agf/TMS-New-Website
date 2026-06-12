import { MEDIA_SPECS, type MediaSlot } from "@/lib/media-specs";

/**
 * Labeled, clearly-replaceable media placeholder. Shows the recommended upload
 * size so the firm knows exactly what to provide in admin.
 */
export function MediaPlaceholder({
  slot,
  className = "",
}: {
  slot: MediaSlot;
  className?: string;
}) {
  const spec = MEDIA_SPECS[slot];
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 bg-[var(--c-surface2)] border border-dashed border-[var(--c-border)] text-center px-4 ${className}`}
    >
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--c-ink-muted)] opacity-60 font-[family-name:var(--font-ui)]">
        {spec.label} — replace via admin
      </span>
      <span className="text-[11px] text-[var(--c-ink-muted)] opacity-50">{spec.size}</span>
    </div>
  );
}
