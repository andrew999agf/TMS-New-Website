import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discoverySets } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { discoveryFingerprint } from "@/lib/discovery/fingerprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by open discovery-set pages; when the fingerprint changes, another
 *  user changed something and the page re-renders itself. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!db) return NextResponse.json({ v: "" });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [set] = await db.select({ matter: discoverySets.matter }).from(discoverySets).where(eq(discoverySets.id, id));
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ v: await discoveryFingerprint(id, set.matter) }, { headers: { "Cache-Control": "no-store" } });
}
