import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoverySets, shareFolders, shareFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const runtime = "nodejs";

/**
 * Sign-in-checked proxy for a client-uploaded share file, so the Discovery
 * Reviewer's "received from client" grid can render its pages same-origin.
 * The file must belong to a client folder on this case's matter.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id, fileId } = await params;
  const setId = Number(id);
  const fid = Number(fileId);
  if (!Number.isFinite(setId) || !Number.isFinite(fid)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [set] = await db.select({ matter: discoverySets.matter }).from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set?.matter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [file] = await db.select().from(shareFiles).where(eq(shareFiles.id, fid));
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [folder] = await db.select({ id: shareFolders.id }).from(shareFolders)
    .where(and(eq(shareFolders.id, file.folderId), eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(file.url, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  const base = (file.filename.split("/").pop() || "document").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", file.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename="${base}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
