import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isBlobConfigured } from "@/lib/blob";
import { resolvePortalMember, isVerifiedPortalMember } from "@/lib/portal-access";
import { SHARE_ALLOWED_CONTENT_TYPES as ALLOWED, SHARE_MAX_BYTES as MAX_BYTES } from "@/lib/share/upload-limits";

export const runtime = "nodejs";

/**
 * Blob upload authorizer for CLIENT-PORTAL members. The invite token is
 * validated, the member's signed-in session must match their email, and the
 * upload pathname is pinned under this group's prefix — which is also what the
 * clientRegisterDoc action checks before recording the file.
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
      onBeforeGenerateToken: async (pathname) => {
        const ctx = await resolvePortalMember(token);
        if (!ctx || !(await isVerifiedPortalMember(ctx))) throw new Error("Not allowed");
        if (!pathname.startsWith(`client-portal/${ctx.group.id}/`)) throw new Error("Bad path");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: token };
      },
      onUploadCompleted: async () => { /* recorded by clientRegisterDoc */ },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
