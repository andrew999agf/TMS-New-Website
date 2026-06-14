"use client";

/**
 * Banner crop position picker, shared by every admin area that uploads a
 * banner/hero image (home banner, page banners, practice areas, blog posts).
 * The value is a CSS object-position keyword: center | top | bottom | left | right.
 */
export const FOCAL_OPTIONS = ["center", "top", "bottom", "left", "right"] as const;

export function FocalSelect({
  value,
  onChange,
  label = "Position",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <select
        value={value || "center"}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[var(--c-border)] bg-[var(--c-bg)] p-1.5 capitalize"
      >
        {FOCAL_OPTIONS.map((o) => (
          <option key={o} value={o} className="capitalize">
            {o === "center" ? "Center" : `Shift to ${o}`}
          </option>
        ))}
      </select>
    </label>
  );
}
