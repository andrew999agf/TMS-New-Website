"use client";

/**
 * Downscale large images in the browser before upload so they fit under the
 * serverless body limit (~4.5MB). Most full-res photos compress to well under
 * 2MB at 2400px / JPEG 0.85 with no visible quality loss for web use.
 * Non-image files (and GIF/SVG) pass through unchanged.
 */
async function downscaleImage(file: File): Promise<Blob> {
  const skip = !file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml";
  if (skip) return file;
  try {
    const img = await createImageBitmap(file);
    const maxDim = 2400;
    const longest = Math.max(img.width, img.height);
    if (longest <= maxDim && file.size < 3_500_000) return file;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Upload a file to Vercel Blob via the server route. Returns the public URL. */
export async function uploadToBlob(file: File, folder = "uploads"): Promise<string> {
  const processed = await downscaleImage(file);

  if (processed.size > 4.4 * 1024 * 1024) {
    throw new Error(
      "This file is too large to upload (4.5MB limit). Photos are shrunk automatically, but large videos need large-file uploads enabled — ask to add a storage token.",
    );
  }

  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-") || "upload";
  const ext = processed.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "bin");
  const form = new FormData();
  form.append("file", processed, `${base}.${ext}`);
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
