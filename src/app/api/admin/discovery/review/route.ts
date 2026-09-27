import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { reviewDiscoveryChunk, reviewStatus } from "@/lib/ai/discovery-review";

export const runtime = "nodejs";
export const maxDuration = 60;

async function guard(): Promise<{ email: string } | NextResponse> {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return session;
}

/** One chunk of the AI discovery sweep (~40s of labeling); the client keeps
 *  calling until `done`. Always behind an explicit user confirmation — this
 *  spends GPU time. */
export async function POST(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  let body: { setId?: number; retryErrors?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const setId = Number(body.setId);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "setId is required." }, { status: 400 });
  await ensureDiscoveryTables();
  const result = await reviewDiscoveryChunk(setId, { retryErrors: !!body.retryErrors });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

/** Progress only — no work, no spend. */
export async function GET(req: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const setId = Number(new URL(req.url).searchParams.get("setId"));
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "setId is required." }, { status: 400 });
  await ensureDiscoveryTables();
  const result = await reviewStatus(setId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
