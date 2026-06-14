/**
 * Badge bar defaults — organizations, bar associations, and awards shown in a
 * slow-scrolling strip below the hero. Image-only (PNG logos). Seeded empty;
 * the firm uploads its own logos in admin → Badges.
 */
export type BadgeSeed = {
  name: string;
  logo?: string;
  url?: string;
  sort: number;
};

export const BADGES: BadgeSeed[] = [];
