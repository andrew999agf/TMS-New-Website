"use client";

function isHeic(file: File): boolean {
  const t = file.type.toLowerCase();
  return (
    t === "image/heic" ||
    t === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

/** iPhone HEIC → JPEG (most browsers can't display HEIC). Runs in the browser. */
async function convertHeic(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}

/**
 * Downscale large images so they fit under the serverless body limit (~4.5MB).
 * Non-image blobs (and GIF/SVG) pass through unchanged.
 */
async function downscaleImage(blob: Blob): Promise<Blob> {
  const skip = !blob.type.startsWith("image/") || blob.type === "image/gif" || blob.type === "image/svg+xml";
  if (skip) return blob;
  try {
    const img = await createImageBitmap(blob);
    const maxDim = 2400;
    const longest = Math.max(img.width, img.height);
    if (longest <= maxDim && blob.size < 3_500_000) return blob;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

const SERVER_LIMIT = 4.4 * 1024 * 1024; // small-file server path
const VIDEO_LIMIT = 64 * 1024 * 1024; // direct-upload path

const TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Upload a file to Vercel Blob. Returns the public URL. */
export async function uploadToBlob(file: File, folder = "uploads"): Promise<string> {
  // 1) Convert iPhone HEIC to JPEG so it displays everywhere.
  let working: Blob = file;
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-") || "upload";
  if (isHeic(file)) {
    try {
      working = await convertHeic(file);
    } catch {
      throw new Error("Could not convert this HEIC photo. Try exporting it as JPEG first.");
    }
  }

  // 2) Shrink large images (no-op for video).
  working = await downscaleImage(working);

  const ext = TYPE_EXT[working.type] ?? file.name.split(".").pop() ?? "bin";
  const filename = `${folder}/${baseName}.${ext}`;
  const isVideo = working.type.startsWith("video") || file.type.startsWith("video");

  // 3a) Videos / anything still too big for the server path → direct browser→Blob upload.
  if (isVideo || working.size > SERVER_LIMIT) {
    if (working.size > VIDEO_LIMIT) {
      throw new Error("This file is over 64MB. Please trim or compress it before uploading.");
    }
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(filename, working, {
      access: "public",
      handleUploadUrl: "/api/admin/upload",
      clientPayload: folder,
      contentType: working.type || undefined,
    });
    return blob.url;
  }

  // 3b) Small images → server-side upload.
  const form = new FormData();
  form.append("file", working, `${baseName}.${ext}`);
  form.append("folder", folder);

  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  let data: { url?: string; error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON / empty response */
  }
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Upload failed (status ${res.status}).`);
  }
  return data.url;
}
