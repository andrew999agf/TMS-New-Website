import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isBlobConfigured } from "@/lib/blob";
import { resolveRecipient } from "@/lib/share/access";
import { shareCan } from "@/lib/share/types";

export const runtime = "nodejs";

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED = [
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/rtf", "application/zip", "message/rfc822", "application/octet-stream",
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/tiff", "image/heic", "image/heif",
];

/**
 * Blob upload authorizer for RECIPIENTS (people with an upload/manage share
 * link, not admins). The token in the path is validated and the permission
 * checked before a Blob token is minted. The DB row is written afterward by the
 * recipientRegisterFile action.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  if (!isBlobConfigured()) return NextResponse.json({ error: "File storage not configured." }, { status: 503 });
  const { token } = await params;
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
      onBeforeGenerateToken: async () => {
        const ctx = await resolveRecipient(token);
        if (!ctx || !shareCan(ctx.rec.permission, "upload")) throw new Error("Not allowed");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: token };
      },
      onUploadCompleted: async () => { /* recorded by recipientRegisterFile */ },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
