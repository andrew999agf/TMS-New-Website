/**
 * Recommended upload dimensions for each media slot, surfaced in admin
 * placeholders and uploaders so the firm always knows what size to provide.
 */
export type MediaSpec = { label: string; size: string; ratio?: string };

export const MEDIA_SPECS = {
  logoHeader: { label: "Logo", size: "Transparent PNG or SVG, ~480 × 120 px", ratio: "wide" },
  logoFooter: { label: "Footer logo", size: "Transparent PNG or SVG, ~480 × 120 px", ratio: "wide" },
  heroBanner: { label: "Hero banner", size: "21:9 — 2400 × 1030 px · JPG, or MP4/WebM under ~20 MB", ratio: "21/9" },
  practiceHero: { label: "Practice hero background", size: "Wide — 2000 × 900 px · JPG", ratio: "20/9" },
  portrait: { label: "Attorney portrait", size: "Portrait 4:5 — 1000 × 1250 px · JPG", ratio: "4/5" },
  blogBanner: { label: "Post banner", size: "16:9 — 1600 × 900 px · JPG", ratio: "16/9" },
  ogImage: { label: "Social share image", size: "1200 × 630 px · JPG/PNG", ratio: "1.91/1" },
} as const satisfies Record<string, MediaSpec>;

export type MediaSlot = keyof typeof MEDIA_SPECS;
