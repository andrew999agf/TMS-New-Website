import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { renderPagesChunk, renderStatusFor } from "@/lib/documents/page-images";
import { db } from "@/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Page pictures for one discovery case's red tab. GET reports progress;
 * POST runs one ~45s rendering sweep (call again until done). The tab drives
 * this while open; the minute cron carries on when it isn't.
 */
async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) return null;
  await ensureDiscoveryTables().catch(() => {});
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 500 });
  const setId = Math.floor(Number(req.nextUrl.searchParams.get("setId")));
  if (!Number.isFinite(setId) || setId < 1) return NextResponse.json({ error: "Bad setId" }, { status: 400 });
  return NextResponse.json(await renderStatusFor(setId));
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { setId?: number };
  const setId = Math.floor(Number(body.setId));
  if (!Number.isFinite(setId) || setId < 1) return NextResponse.json({ error: "Bad setId" }, { status: 400 });
  return NextResponse.json(await renderPagesChunk(setId));
}
