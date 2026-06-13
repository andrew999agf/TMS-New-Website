import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";

export const runtime = "nodejs";

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
 * Client-upload token endpoint for Vercel Blob. The browser uploads files
 * DIRECTLY to Blob (no 4.5MB serverless body limit), and this route only mints
 * the short-lived upload token and records metadata on completion. Works with
 * an OIDC-connected store or a static BLOB_READ_WRITE_TOKEN.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "Media storage not configured. Connect a Vercel Blob store to this project." },
      { status: 503 },
    );
  }

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
        // Only signed-in admins may request an upload token.
        const session = await getSession();
        if (!session) throw new Error("Unauthorized");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB (covers banner clips)
          addRandomSuffix: true,
          tokenPayload: clientPayload ?? "uploads",
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Fired by Vercel after the direct upload finishes (production only).
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
