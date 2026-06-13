"use client";

import { upload } from "@vercel/blob/client";

/**
 * Upload a file directly from the browser to Vercel Blob (bypasses the
 * serverless request-size limit). Returns the public URL. The token is minted
 * by /api/admin/upload, which also records metadata on completion.
 */
export async function uploadToBlob(file: File, folder = "uploads"): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const blob = await upload(`${folder}/${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/admin/upload",
    clientPayload: folder,
  });
  return blob.url;
}
