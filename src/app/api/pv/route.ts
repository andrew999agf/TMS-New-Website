import { NextResponse } from "next/server";
import { db } from "@/db";
import { pageViews } from "@/db/schema";

export const runtime = "nodejs";

/** Lightweight first-party page-view capture. No cookies, no PII. */
export async function POST(req: Request) {
  if (!db) return NextResponse.json({ ok: true });
  try {
    const { path, referrer } = await req.json();
    if (typeof path !== "string" || path.length > 255) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // Ignore admin/api traffic.
    if (path.startsWith("/admin") || path.startsWith("/api")) {
      return NextResponse.json({ ok: true });
    }
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(pageViews).values({
      path,
      referrer: typeof referrer === "string" ? referrer.slice(0, 512) : null,
      day,
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}
