import { NextResponse } from "next/server";
import { resolveRecipient } from "@/lib/share/access";
import { logShareAccess } from "@/lib/share/access-log";

/** The browser builds ZIPs itself now; this records the bulk download in the
 *  firm's access log (one row per archive, with scope and counts). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolveRecipient(token);
  if (!ctx) return NextResponse.json({ ok: false }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { scope?: string; ids?: number[]; files?: number; bytes?: number };
  const scope = body.scope === "selected" ? "selected" : "all";
  await logShareAccess(req, { folderId: ctx.folder.id, recipientId: ctx.rec.id, action: "zip", meta: { scope, files: Number(body.files) || (Array.isArray(body.ids) ? body.ids.length : undefined), bytes: Number(body.bytes) || undefined, ids: Array.isArray(body.ids) ? body.ids.slice(0, 200).map(Number) : undefined, via: "link" } });
  return NextResponse.json({ ok: true });
}
