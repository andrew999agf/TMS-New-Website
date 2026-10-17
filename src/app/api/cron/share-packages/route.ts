import { NextResponse } from "next/server";
import { ensureDiscoveryTables } from "@/db/ensure";
import { sweepPackages } from "@/lib/share/package";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Prepared-package heartbeat (every minute, vercel.json): pack the next
 * part(s) of any package being built, and queue rebuilds for packages whose
 * folders changed and have since settled. Each tick works within its time
 * budget and hands off; a lease on the package keeps ticks from overlapping.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureDiscoveryTables().catch(() => {});
  const out = await sweepPackages(250_000);
  return NextResponse.json({ ok: true, ...out });
}
