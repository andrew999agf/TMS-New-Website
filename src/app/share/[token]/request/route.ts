import { NextResponse } from "next/server";
import { db } from "@/db";
import { shareFolders, shareRecipients } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * Token-checked inline viewer for the folder's attached discovery-requests
 * document, so the client can read the requests side-by-side while filing
 * documents into the per-request folders. Same guard as file downloads: a
 * valid, unexpired recipient token for this folder.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });
  if (rec.expiresAt && rec.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired." }, { status: 403 });

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (!folder?.discoveryRequestUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const upstream = await fetch(folder.discoveryRequestUrl, range ? { headers: { Range: range } } : undefined);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });

  const safe = (folder.discoveryRequestName || "discovery-requests.pdf").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${safe}"`);
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Referrer-Policy", "no-referrer");
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
