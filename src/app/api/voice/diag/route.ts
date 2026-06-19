import { NextResponse } from "next/server";
import { db } from "@/db";
import { voiceDiagnostics } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Best-effort voice diagnostics sink (Time Tracker 3.0). Staff-only. Stores only
 * device capability + which pipeline stage succeeded/failed — never audio,
 * transcript, email, or IP. Always returns ok so it can't disrupt the UI.
 */
const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const b = (v: unknown) => (typeof v === "boolean" ? v : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ ok: true });
  // Staff-only surface (unlike public /api/pv).
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true });
  try {
    const d = (await req.json()) as Record<string, unknown>;
    await db.insert(voiceDiagnostics).values({
      day: new Date().toISOString().slice(0, 10),
      platformLabel: s(d.platformLabel, 128),
      os: s(d.os, 16),
      browser: s(d.browser, 16),
      engineGroup: s(d.engineGroup, 16),
      capture: s(d.capture, 24),
      backend: s(d.backend, 16),
      permission: s(d.permission, 16),
      secure: b(d.secure),
      standalone: b(d.standalone),
      stage: s(d.stage, 24),
      success: b(d.success) ?? false,
      reason: s(d.reason, 32),
      message: s(d.message, 256),
      sampleRate: n(d.sampleRate),
      captureMs: n(d.captureMs),
      transcribeMs: n(d.transcribeMs),
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}
