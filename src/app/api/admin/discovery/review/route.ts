import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { reviewDiscoveryChunk, reviewStatus } from "@/lib/ai/discovery-review";
import { startLabelJob, getLabelJob, runLabelJobChunk } from "@/lib/ai/label-job";

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
  let body: { setId?: number; retryErrors?: boolean; background?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const setId = Number(body.setId);
  if (!Number.isFinite(setId)) return NextResponse.json({ error: "setId is required." }, { status: 400 });
  await ensureDiscoveryTables();

  // Background mode: register the job (the cron keeps it moving even after
  // the browser leaves), then advance it one chunk right now if free.
  if (body.background) {
    if (!(await getLabelJob(setId))) await startLabelJob(setId, session.email);
    const out = await runLabelJobChunk(setId, { retryErrors: !!body.retryErrors });
    const status = await reviewStatus(setId);
    if ("error" in status) return NextResponse.json(status, { status: 400 });
        const finished = (out.ran && out.done) || (!out.ran && (out.note === "gave-up" || out.note === "no-job"));
    return NextResponse.json({
      ...status,
      jobActive: !finished,
      chunk: out.ran ? out.result : undefined,
      note: out.ran ? undefined : out.note,
    });
  }

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
  const job = await getLabelJob(setId);
  return NextResponse.json({ ...result, jobActive: !!job, jobStartedAt: job?.startedAt });
}
