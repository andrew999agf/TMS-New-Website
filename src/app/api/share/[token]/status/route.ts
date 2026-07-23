import { NextResponse } from "next/server";
import { resolveRecipient } from "@/lib/share/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_MS = 90_000; // if no progress heartbeat within this window, treat as finished

/** Lightweight poll: is someone currently uploading to this folder, and how far
 *  along? Lets a viewer know to wait before downloading. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolveRecipient(token);
  if (!ctx) return NextResponse.json({ uploading: false }, { headers: { "Cache-Control": "no-store" } });
  const f = ctx.folder;
  const fresh = f.uploadAt ? Date.now() - new Date(f.uploadAt).getTime() < STALE_MS : false;
  const uploading = f.uploadTotal > 0 && f.uploadDone < f.uploadTotal && fresh;
  return NextResponse.json({ uploading, total: f.uploadTotal, done: f.uploadDone }, { headers: { "Cache-Control": "no-store" } });
}
