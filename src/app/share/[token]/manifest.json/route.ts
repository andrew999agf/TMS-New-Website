import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles, shareFolders, shareRecipients } from "@/db/schema";
import { portalEmail } from "@/lib/share/portal-session";
import { getSession, isFullAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bates range when the file is named like "ESQ_000972-ESQ_000981 (…).pdf". */
function batesOf(name: string): { batesStart: string; batesEnd: string } | null {
  const base = name.split("/").pop() ?? name;
  const m = /^([A-Z]{1,12}[_-]?\d{3,})\s*[-–]\s*([A-Z]{1,12}[_-]?\d{3,})/.exec(base);
  if (!m) return null;
  const prefix = (s: string) => s.replace(/[\d_-]+$/, "");
  return prefix(m[1]) === prefix(m[2]) ? { batesStart: m[1], batesEnd: m[2] } : null;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Read-only listing of the share's documents — the same list the page shows,
 * as JSON — so an authorized reader can see what is there without opening
 * the ZIP parts. Same token, same revocation and expiry checks, and the same
 * sign-in requirement as the page. Each entry links to the single document,
 * streamed inline. Nothing here writes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });
  if (rec.expiresAt && rec.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired." }, { status: 403 });
  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (folder.requireAuth || rec.requireAuth) {
    const who = await portalEmail();
    if (!who || who !== rec.email.toLowerCase()) {
      const admin = await getSession().catch(() => null);
      if (!admin || !isFullAdmin(admin.role)) return NextResponse.json({ error: "Sign in on the share page first." }, { status: 401 });
    }
  }

  const files = await db.select({ id: shareFiles.id, filename: shareFiles.filename, contentType: shareFiles.contentType, sizeBytes: shareFiles.sizeBytes, pageCount: shareFiles.pageCount, createdAt: shareFiles.createdAt })
    .from(shareFiles).where(eq(shareFiles.folderId, folder.id));
  files.sort((a, b) => collator.compare(a.filename, b.filename) || a.id - b.id);
  // Public origin: the forwarded host behind the hosting proxy, else the request's own.
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").trim();
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  const documents = files.map((f) => {
    const slash = f.filename.lastIndexOf("/");
    const bates = batesOf(f.filename);
    return {
      id: f.id,
      name: slash >= 0 ? f.filename.slice(slash + 1) : f.filename,
      folder: slash >= 0 ? f.filename.slice(0, slash) : "",
      path: f.filename,
      size: f.sizeBytes,
      contentType: f.contentType,
      ...(f.pageCount ? { pages: f.pageCount } : {}),
      ...(bates ?? {}),
      uploadedAt: f.createdAt.toISOString(),
      url: `${origin}/share/${token}/file/${f.id}?preview=1`,
    };
  });
  return NextResponse.json({
    folder: { name: folder.name, caseNumber: folder.caseNumber, matter: folder.matter },
    generatedAt: new Date().toISOString(),
    expiresAt: rec.expiresAt?.toISOString() ?? null,
    documentCount: documents.length,
    totalBytes: documents.reduce((n, d) => n + (d.size ?? 0), 0),
    documents,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
