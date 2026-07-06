import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isBlobConfigured } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * Public upload endpoint for intake document attachments (the petition /
 * complaint / eviction papers a prospect was served). Unauthenticated by
 * design — it's part of the public consultation flow — but tightly
 * constrained: documents and photos only, 20 MB cap, uploads confined to the
 * intake-docs/ prefix, random suffixes so URLs are unguessable, and a
 * best-effort per-IP throttle.
 */
const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
];
const MAX_BYTES = 20 * 1024 * 1024;

const hits = new Map<string, { n: number; t: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 10 * 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 40;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) {
    return NextResponse.json({ error: "Uploads aren't available right now — you can email the papers instead." }, { status: 503 });
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (throttled(ip)) {
    return NextResponse.json({ error: "Too many uploads — please wait a few minutes." }, { status: 429 });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("intake-docs/")) throw new Error("Invalid upload path.");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {
        /* nothing to record server-side; the submission carries the URLs */
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
