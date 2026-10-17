import { NextResponse } from "next/server";
import { db } from "@/db";
import { logShareAccess } from "@/lib/share/access-log";
import { resolveRecipient } from "@/lib/share/access";
import { shareCan } from "@/lib/share/types";
import { downloadableParts, getPackage } from "@/lib/share/package";

export const runtime = "nodejs";

/**
 * One part of the folder's prepared download package. Checks the recipient's
 * link (revoked / expired), logs the download once, then hands the browser
 * the stored archive directly — a plain file its own download manager can
 * pause and resume, with no server in the data path.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; part: string }> }) {
  const { token, part } = await params;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "download")) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });
  const n = Number(part);
  const pkg = await getPackage(ctx.folder.id);
  const parts = downloadableParts(pkg);
  const p = parts.find((x) => x.n === n);
  if (!p || !p.url) return NextResponse.json({ error: "That part is not available. Reload the page for the current package." }, { status: 404 });

  await logShareAccess(req, { folderId: ctx.folder.id, recipientId: ctx.rec.id, action: "zip", meta: {
    scope: "package", part: n, parts: parts.length, files: p.fileIds.length, bytes: p.size ?? p.bytes, name: p.name, via: "link",
  } });
  // ?download=1 makes storage send the file as an attachment under its stored name.
  const target = new URL(p.url);
  target.searchParams.set("download", "1");
  return NextResponse.redirect(target.toString(), { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
