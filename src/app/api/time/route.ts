import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authoritative clock for the admin panel.
 *
 * The host keeps this machine NTP-synced, so it's a better time source than the
 * viewer's laptop — which is the one thing that actually goes wrong. It is not
 * needed for daylight saving: the DFW offset comes from the IANA database built
 * into the runtime (see lib/dfw-time). Using our own server rather than a public
 * time API keeps this free of rate limits, outages, and third parties.
 */
export async function GET() {
  return NextResponse.json(
    { now: Date.now() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
