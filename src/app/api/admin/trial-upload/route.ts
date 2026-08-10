import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";
import { SHARE_ALLOWED_CONTENT_TYPES as ALLOWED, SHARE_MAX_BYTES as MAX_BYTES } from "@/lib/share/upload-limits";

export const runtime = "nodejs";

/**
 * Client direct-upload authorizer for trial exhibits and transcripts. Same shape
 * as the share-folder uploader: the browser sends the file straight to Blob (so
 * a 400-page deposition PDF bypasses the 4.5MB function limit) and we only mint
 * the token after checking the admin session. The DB row is written by the
 * client calling the matching server action once the upload resolves.
 */
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
        /* DB row is written by the client via the trial actions */
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
