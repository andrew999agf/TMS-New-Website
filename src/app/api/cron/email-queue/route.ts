import { NextResponse } from "next/server";
import { flushScheduledEmails } from "@/lib/email-quiet";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Delivers quiet-hours-queued prospective-client emails once they're due.
 * Runs every 15 minutes (see vercel.json); the 7:00 a.m. Central run is the
 * one that actually flushes the overnight queue.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await flushScheduledEmails();
  return NextResponse.json({ ok: true, ...result });
}
