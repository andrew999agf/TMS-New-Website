import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";

export const runtime = "nodejs";

const SERVER_MAX_BYTES = 4.4 * 1024 * 1024; // Vercel function body limit (~4.5MB)
const CLIENT_MAX_BYTES = 64 * 1024 * 1024; // direct browser→Blob uploads (videos)
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
];

/**
 * Dual-mode upload endpoint:
 *  - JSON body  → client direct-upload token flow (large files / videos),
 *    sent straight from the browser to Blob, bypassing the 4.5MB body limit.
 *  - FormData   → server-side put() for small images (auto-shrunk client-side).
 * Both work with an OIDC-connected store or a static BLOB_READ_WRITE_TOKEN.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "Media storage not configured. Connect a Vercel Blob store to this project." },
      { status: 503 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ---- Client direct-upload token flow ----
  if (contentType.includes("application/json")) {
    let body: HandleUploadBody;
    try {
      body = (await req.json()) as HandleUploadBody;
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    try {
      const result = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (_pathname, clientPayload) => {
          const session = await getSession();
          if (!session) throw new Error("Unauthorized");
          return {
            allowedContentTypes: ALLOWED,
            maximumSizeInBytes: CLIENT_MAX_BYTES,
            addRandomSuffix: true,
            tokenPayload: clientPayload ?? "uploads",
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          if (!db) return;
          try {
            const folder = typeof tokenPayload === "string" && tokenPayload ? tokenPayload : "uploads";
            await db.insert(mediaAssets).values({
              url: blob.url,
              pathname: blob.pathname,
              kind: (blob.contentType ?? "").startsWith("video") ? "video" : "image",
              folder,
            });
          } catch {
            /* metadata is best-effort */
          }
        },
      });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  // ---- Server-side upload (small images) ----
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > SERVER_MAX_BYTES) {
      return NextResponse.json({ error: "File too large for this path (4.5MB)." }, { status: 413 });
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
    }

    const folder = String(form.get("folder") ?? "uploads");
    const blob = await put(`${folder}/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    let id: number | null = null;
    if (db) {
      try {
        const [row] = await db
          .insert(mediaAssets)
          .values({
            url: blob.url,
            pathname: blob.pathname,
            kind: file.type.startsWith("video") ? "video" : "image",
            sizeBytes: file.size,
            folder,
          })
          .returning({ id: mediaAssets.id });
        id = row?.id ?? null;
      } catch {
        /* metadata is best-effort */
      }
    }

    return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname, id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Upload failed" }, { status: 500 });
  }
}
