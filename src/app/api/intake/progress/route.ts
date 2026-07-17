import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { ESTATE_DEPTH, getBranch } from "@/lib/intake/config";

export const runtime = "nodejs";

/**
 * Save-progress endpoint for the COMPREHENSIVE estate questionnaire only.
 * Each step the visitor completes upserts a partial submission (flagged
 * incomplete) keyed by a random browser token, so the intake team can see
 * abandoned questionnaires and the visitor can resume in the same browser.
 * Sends no email; the normal submit completes the same row.
 */
const schema = z.object({
  token: z.string().min(16).max(64).regex(/^[\w-]+$/),
  branch: z.string().min(1),
  step: z.number().int().min(0).max(50),
  answers: z.record(z.unknown()),
});

const hits = new Map<string, { n: number; t: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 10 * 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 120;
}

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ ok: false });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (throttled(ip)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const { token, branch, answers } = parsed.data;

  // Progress saving exists only for the comprehensive estate path.
  if (branch !== "estate" || answers.estateDepth !== ESTATE_DEPTH.FULL) {
    return NextResponse.json({ ok: false });
  }
  if (JSON.stringify(answers).length > 60_000) return NextResponse.json({ error: "Too large" }, { status: 400 });

  const a = answers as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
  const branchDef = getBranch(branch);

  try {
    const [existing] = await db
      .select({ id: intakeSubmissions.id, incomplete: intakeSubmissions.incomplete })
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.resumeToken, token));
    if (existing) {
      // Never regress a completed submission back to incomplete.
      if (!existing.incomplete) return NextResponse.json({ ok: true });
      await db
        .update(intakeSubmissions)
        .set({ answers: a, name: str("name") ?? str("testatorFullName"), email: str("email"), phone: str("phone") })
        .where(eq(intakeSubmissions.id, existing.id));
    } else {
      await db.insert(intakeSubmissions).values({
        branch,
        practiceSlug: branchDef?.practiceSlug,
        answers: a,
        name: str("name") ?? str("testatorFullName"),
        email: str("email"),
        phone: str("phone"),
        incomplete: true,
        resumeToken: token,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
