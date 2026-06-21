import { NextResponse, type NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";

/**
 * Mints a short-lived, subscribe-only LiveKit token for a public viewer of the
 * Patriot Series broadcast. The room name comes from the Channel B state
 * snapshot (`livekitRoom`, formatted `game-<id>`). Viewers can only watch — no
 * publish — and the API secret never leaves the server.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const room = (req.nextUrl.searchParams.get("room") ?? "").trim();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  // Only ever mint tokens for the broadcast rooms the switcher uses.
  if (!room || !room.startsWith("game-")) {
    return NextResponse.json({ error: "invalid room" }, { status: 400 });
  }
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "livekit not configured" }, { status: 503 });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: `viewer-${Math.random().toString(36).slice(2, 10)}`,
    ttl: 60 * 60 * 6, // 6h — comfortably covers a game without refresh
  });
  at.addGrant({ room, roomJoin: true, canPublish: false, canSubscribe: true });

  const token = await at.toJwt();
  return NextResponse.json({ token, url });
}
