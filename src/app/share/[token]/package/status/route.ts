import { NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { shareFiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveRecipient } from "@/lib/share/access";
import { getPackage, summarize, buildStep } from "@/lib/share/package";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Package progress for the recipient page's "preparing" notice. Also nudges
 *  a build whose lease has lapsed, so progress never silently stalls. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const ctx = await resolveRecipient(token);
  if (!ctx) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });
  const [pkg, files] = await Promise.all([
    getPackage(ctx.folder.id),
    db.select({ id: shareFiles.id, filename: shareFiles.filename, url: shareFiles.url, sizeBytes: shareFiles.sizeBytes }).from(shareFiles).where(eq(shareFiles.folderId, ctx.folder.id)),
  ]);
  if (pkg?.status === "building" && (!pkg.lockUntil || pkg.lockUntil < new Date())) after(async () => { await buildStep(ctx.folder.id, 240_000).catch(() => {}); });
  const s = summarize(pkg, files);
  return NextResponse.json({ state: s.state, done: s.done, total: s.total }, { headers: { "Cache-Control": "private, no-store" } });
}
