import { NextResponse } from "next/server";
import { resolveDirLink } from "@/lib/share/dir-link";
import { logShareAccess } from "@/lib/share/access-log";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveDirLink(token);
  if (!link) return NextResponse.json({ ok: false }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { scope?: string; ids?: number[]; files?: number; bytes?: number };
  await logShareAccess(req, { folderId: link.folderId, action: "zip", meta: { scope: body.scope === "selected" ? "selected" : "dir", files: Number(body.files) || undefined, bytes: Number(body.bytes) || undefined, ids: Array.isArray(body.ids) ? body.ids.slice(0, 200).map(Number) : undefined, via: "dir-link", dir: link.dirPath } });
  return NextResponse.json({ ok: true });
}
