/**
 * In-browser background removal using Google's MediaPipe Tasks Vision
 * (Apache-2.0) with the Apache-2.0 selfie-segmentation model. Everything here is
 * permissively licensed and clear for commercial use — no copyleft obligations.
 *
 * The model is tuned for people (headshots, staff photos), which is the common
 * case for the firm's site. It loads from public CDNs the first time and is
 * cached by the browser afterward. If the model can't load or segment, callers
 * catch the error and leave the original image untouched.
 */

const TASKS_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let segmenterPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSegmenter(): Promise<any> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      return vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch((e) => {
      segmenterPromise = null; // allow a retry on the next attempt
      throw e;
    });
  }
  return segmenterPromise;
}

function loadImage(source: string | Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const revoke = () => { if (typeof source !== "string") URL.revokeObjectURL(url); };
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ img, revoke });
    img.onerror = () => { revoke(); reject(new Error("Could not load the image.")); };
    img.src = url;
  });
}

/**
 * Remove the background from an image, returning a transparent-background PNG blob.
 * @param source an image URL or a Blob/File
 * @param onProgress optional status callback for UI ("Loading model…", "Processing…")
 */
export async function removeBackground(
  source: string | Blob,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  onProgress?.("Loading model… (one-time)");
  const segmenter = await getSegmenter();
  const { img, revoke } = await loadImage(source);
  try {
    onProgress?.("Processing…");
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;

    const result = segmenter.segment(img);
    const mask = result.confidenceMasks?.[0];
    if (!mask) { result.close?.(); throw new Error("Segmentation produced no mask."); }
    const maskArr: Float32Array = mask.getAsFloat32Array();
    const mw = mask.width, mh = mask.height;

    // The mask may represent foreground OR background confidence depending on the
    // model build. Sample the four corners (almost always background) and flip if
    // needed so high alpha = subject, low alpha = background.
    const corners = [maskArr[0], maskArr[mw - 1], maskArr[(mh - 1) * mw], maskArr[mh * mw - 1]];
    const cornerAvg = corners.reduce((a, b) => a + b, 0) / corners.length;
    const foregroundIsHigh = cornerAvg < 0.5;

    for (let y = 0; y < h; y++) {
      const my = Math.min(mh - 1, (y * mh / h) | 0);
      for (let x = 0; x < w; x++) {
        const mx = Math.min(mw - 1, (x * mw / w) | 0);
        let v = maskArr[my * mw + mx];
        if (!foregroundIsHigh) v = 1 - v;
        px[(y * w + x) * 4 + 3] = Math.round(Math.max(0, Math.min(1, v)) * 255);
      }
    }
    result.close?.();
    ctx.putImageData(imageData, 0, 0);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not export the cutout."))), "image/png"),
    );
  } finally {
    revoke();
  }
}
