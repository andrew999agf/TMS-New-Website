import { ImageIcon } from "lucide-react";

/**
 * Labeled, sized placeholder for an image slot the admin hasn't filled yet.
 * Shows what goes there and the recommended dimensions, in the pro-sports
 * "your photo here" style. Follows the --psx-* theme.
 */
export function MediaPlaceholder({
  label,
  size,
  aspect = "aspect-video",
  className = "",
  rounded = "rounded-2xl",
}: {
  label: string;
  size: string;
  aspect?: string;
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 border border-dashed border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-4 text-center text-[color:var(--psx-faint)] ${aspect} ${rounded} ${className}`}
    >
      <ImageIcon size={26} strokeWidth={1.5} />
      <p className="text-xs font-semibold text-[color:var(--psx-muted)]">{label}</p>
      <p className="text-[11px]">{size}</p>
    </div>
  );
}
