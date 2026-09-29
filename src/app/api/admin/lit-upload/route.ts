import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";

export const runtime = "nodejs";

/**
 * Client direct-upload authorizer for the Litigation Support template bank:
 * plain Word/PDF form files the team opens and Saves-As (no merge fields).
 * Browser uploads straight to Blob after the admin-session check; the DB row
 * is recorded by the client calling registerLitFile once the upload resolves.
 */

const ALLOWED = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template", // .dotx
  "application/pdf",
  "application/rtf",
];
const MAX_BYTES = 50 * 1024 * 1024;

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
      onBeforeGenerateToken: async () => {
        const session = await getSession();
        if (!session) throw new Error("Unauthorized");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: "" };
      },
      onUploadCompleted: async () => {
        /* DB row is written by the client via registerLitFile */
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
