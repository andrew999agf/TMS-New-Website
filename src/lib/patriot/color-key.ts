/**
 * Flat-colour background key-out — NO machine learning, no subject detection.
 *
 * It samples the dominant colour along the image's border (that's the
 * background), then makes every pixel within `tolerance` of that one colour
 * transparent, with a short feathered edge so the cut isn't jagged. Anything
 * that isn't close to the background colour is left completely untouched.
 *
 * Browser-only (uses <canvas>); call it from a client component.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = src;
  });
}

/** Most common colour around the 1px border = the background colour. Quantised
 * into coarse buckets so noise/JPEG artefacts don't split the vote; the winning
 * bucket's average is returned. Already-transparent border pixels are ignored. */
function dominantBorderColor(px: Uint8ClampedArray, w: number, h: number) {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 128) return;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const c = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    c.r += r; c.g += g; c.b += b; c.n += 1;
    buckets.set(key, c);
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y); }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const c of buckets.values()) if (!best || c.n > best.n) best = c;
  if (!best) return { r: 255, g: 255, b: 255 };
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
}

/**
 * @param tolerance RGB distance from the background colour to fully erase
 *                  (~0–120). Higher removes more shades of that one colour.
 */
export async function keyOutBackground(src: string, tolerance = 55): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const bg = dominantBorderColor(px, canvas.width, canvas.height);

  const inner = Math.max(2, tolerance); // fully transparent within this distance
  const outer = inner * 1.5; // feather out to here for a soft edge
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const dr = px[i] - bg.r;
    const dg = px[i + 1] - bg.g;
    const db = px[i + 2] - bg.b;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    if (d <= inner) {
      px[i + 3] = 0;
    } else if (d < outer) {
      const alpha = Math.round(255 * ((d - inner) / (outer - inner)));
      if (alpha < px[i + 3]) px[i + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Export failed");
  return blob;
}
