import "server-only";

/**
 * Decide whether a scanned page is genuinely COLOR or effectively BLACK & WHITE
 * — while deliberately disregarding a colored exhibit sticker/stamp in a margin.
 *
 * Why this exists: a print shop's auto color/mono detector flags a page as
 * "color" the instant it sees ANY colored pixel. A scan of a plain black-and-
 * white document carries two kinds of stray color it shouldn't be billed for:
 *   1. scanner/JPEG chroma noise around black text (faint, low-saturation), and
 *   2. the exhibit sticker — a small, strongly-colored patch in a corner/margin.
 * Printing those as color costs roughly double. This classifier ignores both,
 * so the page can be re-saved as true grayscale and billed as mono.
 *
 * Safety rule that governs every threshold here: NEVER call a genuinely color
 * page black-and-white. When unsure we lean "color". The only thing that can
 * subtract color from the verdict is a region that looks unmistakably like a
 * sticker (small + compact + hugging a margin); a color photo, chart, seal, or
 * highlight anywhere in the body always wins.
 *
 * The algorithm and its thresholds were validated against synthetic pages
 * (plain gray text, gray + corner sticker, gray + edge number-tab, big color
 * photo, faint scan fringe, body highlight, a color blob in the center, and a
 * blank page) — see the project notes.
 */

/** Minimum chroma (max-min of R,G,B, 0-255) for a pixel to count as "colored".
 *  High enough to sit above scanner fringe (~<25) yet below real ink/photo. */
const SAT = 45;
/** A grid cell is "colored" only if at least this fraction of its sampled
 *  pixels are colored — kills isolated speckle. */
const CELL_COLOR_FRAC = 0.06;
/** Grid resolution along the longer page dimension. */
const GRID = 64;
/** Outer band (fraction of the page) treated as "margin" for the sticker test. */
const MARGIN = 0.16;
/** A sticker region must be no larger than this fraction of all cells... */
const MAX_STICKER_FRAC = 0.05;
/** ...and span no more than this fraction of the page in each direction. */
const STICKER_MAX_SPAN = 0.38;
/** At most this many sticker-like regions are disregarded (e.g. a stamp + tab). */
const MAX_STICKERS = 3;
/** >= this fraction of non-sticker cells colored ⇒ COLOR. */
const COLOR_FRAC = 0.004;
/** Between BORDER_FRAC and COLOR_FRAC ⇒ borderline (still treated as color). */
const BORDER_FRAC = 0.002;

export type PageColor = "bw" | "color" | "borderline";

export interface ColorResult {
  /** "color"/"borderline" both mean: keep this page in color. "bw" means it is
   *  safe to render as grayscale for printing. */
  verdict: PageColor;
  /** Fraction of the page (minus stickers) that is meaningfully colored. */
  frac: number;
  coloredCells: number;
  stickerCells: number;
  genuineCells: number;
  totalCells: number;
}

/**
 * Classify a raster of raw pixel data. `px` is RGB or RGBA, row-major.
 * `channels` is 3 or 4 (alpha, if present, is ignored).
 */
export function classifyPixels(px: Uint8Array | Uint8ClampedArray | Buffer, width: number, height: number, channels: number): ColorResult {
  if (!width || !height || channels < 3) {
    return { verdict: "bw", frac: 0, coloredCells: 0, stickerCells: 0, genuineCells: 0, totalCells: 0 };
  }
  const gx = width >= height ? GRID : Math.max(8, Math.round((GRID * width) / height));
  const gy = height > width ? GRID : Math.max(8, Math.round((GRID * height) / width));
  const cellColored = new Float32Array(gx * gy);
  const cellTotal = new Float32Array(gx * gy);

  // Sample at most ~300k pixels so even a large scan classifies quickly.
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 300000)));
  for (let y = 0; y < height; y += step) {
    const cy = Math.min(gy - 1, Math.floor((y / height) * gy));
    const rowBase = cy * gx;
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * channels;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
      const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
      const ci = rowBase + Math.min(gx - 1, Math.floor((x / width) * gx));
      cellTotal[ci]++;
      if (mx - mn >= SAT) cellColored[ci]++;
    }
  }

  const colored = new Uint8Array(gx * gy);
  let coloredCells = 0;
  for (let c = 0; c < gx * gy; c++) {
    if (cellTotal[c] > 0 && cellColored[c] / cellTotal[c] >= CELL_COLOR_FRAC) { colored[c] = 1; coloredCells++; }
  }

  // Connected components (4-connectivity) over the colored cells.
  const seen = new Uint8Array(gx * gy);
  const regions: { size: number; minx: number; maxx: number; miny: number; maxy: number }[] = [];
  const stack: number[] = [];
  for (let c0 = 0; c0 < gx * gy; c0++) {
    if (!colored[c0] || seen[c0]) continue;
    stack.length = 0; stack.push(c0); seen[c0] = 1;
    let size = 0, minx = gx, maxx = 0, miny = gy, maxy = 0;
    while (stack.length) {
      const k = stack.pop() as number;
      size++;
      const kx = k % gx, ky = (k - kx) / gx;
      if (kx < minx) minx = kx; if (kx > maxx) maxx = kx;
      if (ky < miny) miny = ky; if (ky > maxy) maxy = ky;
      if (kx > 0 && colored[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
      if (kx < gx - 1 && colored[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
      if (ky > 0 && colored[k - gx] && !seen[k - gx]) { seen[k - gx] = 1; stack.push(k - gx); }
      if (ky < gy - 1 && colored[k + gx] && !seen[k + gx]) { seen[k + gx] = 1; stack.push(k + gx); }
    }
    regions.push({ size, minx, maxx, miny, maxy });
  }

  const total = gx * gy;
  const marginX = gx * MARGIN, marginY = gy * MARGIN;
  let stickerCells = 0, stickers = 0;
  for (const rg of regions) {
    if (stickers >= MAX_STICKERS) break;
    const spanx = (rg.maxx - rg.minx + 1) / gx;
    const spany = (rg.maxy - rg.miny + 1) / gy;
    const nearMargin = rg.minx <= marginX || rg.maxx >= gx - 1 - marginX || rg.miny <= marginY || rg.maxy >= gy - 1 - marginY;
    const smallEnough = rg.size <= total * MAX_STICKER_FRAC;
    const compact = spanx <= STICKER_MAX_SPAN && spany <= STICKER_MAX_SPAN;
    if (nearMargin && smallEnough && compact) { stickerCells += rg.size; stickers++; }
  }

  const genuine = coloredCells - stickerCells;
  const frac = genuine / total;
  const verdict: PageColor = frac >= COLOR_FRAC ? "color" : frac >= BORDER_FRAC ? "borderline" : "bw";
  return { verdict, frac, coloredCells, stickerCells, genuineCells: genuine, totalCells: total };
}

/** Both "color" and "borderline" mean: keep the page in color when printing. */
export function keepColor(v: PageColor): boolean {
  return v !== "bw";
}
