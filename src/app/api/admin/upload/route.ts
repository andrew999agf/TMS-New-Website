import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";

export const runtime = "nodejs";

const MAX_BYTES = 4.4 * 1024 * 1024; // stay under Vercel's ~4.5MB function body limit
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
];

/**
 * Server-side upload to Vercel Blob. Works with an OIDC-connected store (the
 * SDK uses the project's OIDC token) or a static BLOB_READ_WRITE_TOKEN. Files
 * are shrunk client-side first; this route always responds with JSON so the
 * client can surface a clear message instead of a parse error.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isBlobConfigured()) {
      return NextResponse.json(
        { error: "Media storage not configured. Connect a Vercel Blob store to this project." },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large for direct upload (4.5MB limit)." }, { status: 413 });
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
