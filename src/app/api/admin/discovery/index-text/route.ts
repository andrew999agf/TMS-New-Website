import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { indexTextChunk, indexStatusFor } from "@/lib/documents/text-index";
import { db } from "@/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Chunked text indexing for one discovery case: every document in the red
 * (opposing + client + portal uploads), yellow, and green piles gets its text
 * pulled into the database so search, the AI tools, and Bates citation work.
 * POST runs one ~35s sweep chunk (call again until done); GET reports status.
 * Read-only with respect to the files — nothing is ever written into a PDF.
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
  return NextResponse.json(await indexStatusFor(setId));
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { setId?: number; retryFailed?: boolean };
  const setId = Math.floor(Number(body.setId));
  if (!Number.isFinite(setId) || setId < 1) return NextResponse.json({ error: "Bad setId" }, { status: 400 });
  return NextResponse.json(await indexTextChunk(setId, { retryFailed: !!body.retryFailed }));
}
