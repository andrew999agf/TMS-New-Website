import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * Client direct-upload authorizer for share-folder documents. The browser uploads
 * the file straight to Blob (so large discovery PDFs bypass the 4.5MB function
 * limit); we only mint the token after checking the admin session. The file's DB
 * row is recorded by the client calling the registerShareFile server action once
 * the upload resolves.
 */
const MAX_BYTES = 500 * 1024 * 1024; // 500MB per file
const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/zip",
  "message/rfc822",
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/heic",
  "image/heif",
];

export async function POST(req: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) {
    return NextResponse.json({ error: "File storage not configured. Connect a Vercel Blob store to this project." }, { status: 503 });
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
        const session = await getSession();
        if (!session) throw new Error("Unauthorized");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: clientPayload ?? "",
        };
      },
      onUploadCompleted: async () => {
        /* DB row is written by the client via registerShareFile */
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
