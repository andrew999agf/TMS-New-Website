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

/** Upload a file to Vercel Blob via the server route. Returns the public URL. */
export async function uploadToBlob(file: File, folder = "uploads"): Promise<string> {
  // 1) Convert iPhone HEIC to JPEG so it displays everywhere.
  let working: Blob = file;
  let baseName = file.name.replace(/\.[^.]+$/, "");
  if (isHeic(file)) {
    try {
      working = await convertHeic(file);
    } catch {
      throw new Error("Could not convert this HEIC photo. Try exporting it as JPEG first.");
    }
  }

  // 2) Shrink large images.
  working = await downscaleImage(working);

  if (working.size > 4.4 * 1024 * 1024) {
    throw new Error(
      "This file is too large to upload (4.5MB limit). Photos are shrunk automatically; large videos (.mov/.mp4) need large-file uploads enabled — ask to add a storage token.",
    );
  }

  // 3) Pick a clean filename + extension based on the final type.
  baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, "-") || "upload";
  const typeExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  const ext = typeExt[working.type] ?? file.name.split(".").pop() ?? "bin";

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
