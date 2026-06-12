/**
 * Image editor engine — adjustments, the firm's four branded one-click filters,
 * and a non-destructive canvas renderer used for both live preview and export.
 *
 * The branded filters are the firm's own curves (no licensed LUTs):
 *  - Courtroom: high micro-contrast, slightly desaturated, cool shadows
 *  - Headshot:  soft contrast, flattering warmth, gentle vignette
 *  - Authority: deep blacks, accent-tinted shadows
 *  - Archive:   warm monochrome for historical / Bosque imagery
 */

export type Adjustments = {
  brightness: number; // 0.5–1.5 (1 = neutral)
  contrast: number; // 0.5–1.5
  saturation: number; // 0–2
  warmth: number; // -100..100
  sharpness: number; // 0..100
  vignette: number; // 0..100
  rotate: number; // degrees (0/90/180/270 typical)
  flipH: boolean;
  flipV: boolean;
  monochrome: boolean;
};

export const NEUTRAL: Adjustments = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  sharpness: 0,
  vignette: 0,
  rotate: 0,
  flipH: false,
  flipV: false,
  monochrome: false,
};

export type BrandFilter = { id: string; name: string; description: string; apply: Partial<Adjustments> };

export const BRAND_FILTERS: BrandFilter[] = [
  {
    id: "courtroom",
    name: "Courtroom",
    description: "High micro-contrast, slightly desaturated, cool shadows.",
    apply: { contrast: 1.18, saturation: 0.85, warmth: -18, sharpness: 35, vignette: 12 },
  },
  {
    id: "headshot",
    name: "Headshot",
    description: "Soft contrast, flattering warmth, gentle vignette.",
    apply: { contrast: 0.96, brightness: 1.05, saturation: 1.05, warmth: 18, sharpness: 15, vignette: 28 },
  },
  {
    id: "authority",
    name: "Authority",
    description: "Deep blacks, accent-tinted shadows.",
    apply: { contrast: 1.25, brightness: 0.96, saturation: 0.92, warmth: -6, sharpness: 20, vignette: 22 },
  },
  {
    id: "archive",
    name: "Archive",
    description: "Warm monochrome for historical imagery.",
    apply: { contrast: 1.08, saturation: 0, warmth: 30, vignette: 18, monochrome: true },
  },
];

export const ASPECT_PRESETS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "hero", label: "Hero 21:9", ratio: 21 / 9 },
  { id: "card", label: "Card 4:3", ratio: 4 / 3 },
  { id: "square", label: "Square", ratio: 1 },
  { id: "portrait", label: "Portrait 4:5", ratio: 4 / 5 },
];

/** CSS filter string for the fast adjustments (used for live preview too). */
export function cssFilter(a: Adjustments): string {
  const parts = [
    `brightness(${a.brightness})`,
    `contrast(${a.contrast})`,
    `saturate(${a.monochrome ? 0 : a.saturation})`,
  ];
  if (a.monochrome) parts.push("grayscale(1)");
  return parts.join(" ");
}

export type CropRect = { x: number; y: number; w: number; h: number } | null;

/**
 * Render `img` to `canvas` with the given settings. Used for preview and export.
 * Optional `cutout` (from background removal) is composited over `backdrop`.
 */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  a: Adjustments,
  crop: CropRect,
  backdrop?: { type: "none" | "solid" | "gradient"; color: string; color2?: string },
) {
  // Source region (crop is in image pixel space).
  const sx = crop ? crop.x : 0;
  const sy = crop ? crop.y : 0;
  const sw = crop ? crop.w : imgW;
  const sh = crop ? crop.h : imgH;

  const rotated = a.rotate === 90 || a.rotate === 270;
  const outW = rotated ? sh : sw;
  const outH = rotated ? sw : sh;
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Backdrop (headshot canvas mode).
  if (backdrop && backdrop.type !== "none") {
    if (backdrop.type === "gradient") {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, backdrop.color);
      g.addColorStop(1, backdrop.color2 ?? backdrop.color);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = backdrop.color;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((a.rotate * Math.PI) / 180);
  ctx.scale(a.flipH ? -1 : 1, a.flipV ? -1 : 1);
  ctx.filter = cssFilter(a);
  ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  // Warmth overlay (warm = amber, cool = blue), soft-light blend.
  if (a.warmth !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const mag = Math.min(0.5, Math.abs(a.warmth) / 160);
    ctx.fillStyle = a.warmth > 0 ? `rgba(255,170,70,${mag})` : `rgba(70,140,255,${mag})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Vignette.
  if (a.vignette > 0) {
    ctx.save();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.hypot(cx, cy);
    const grd = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, `rgba(0,0,0,${(a.vignette / 100) * 0.8})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Sharpen (unsharp-ish 3x3 kernel), applied last.
  if (a.sharpness > 0) {
    applySharpen(ctx, canvas.width, canvas.height, a.sharpness / 100);
  }
}

function applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (w * h > 6_000_000) return; // skip on very large canvases for performance
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const s = src.data;
  const d = dst.data;
  const c = 1 + 4 * amount;
  const e = -amount;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          d[idx] = s[idx];
        } else {
          const val =
            c * s[idx] +
            e * s[idx - 4] +
            e * s[idx + 4] +
            e * s[idx - w * 4] +
            e * s[idx + w * 4];
          d[idx] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
      d[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
}
