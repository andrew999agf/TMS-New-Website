import { getDesiredModel } from "@/lib/ai/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one word the GPU pod's boot script needs: "text" or "vision".
 * The pod curls this on startup to decide which model to load, which is
 * what makes a model swap as simple as "flip the setting, restart the
 * pod". Deliberately public and unauthenticated — it reveals nothing but
 * that single word, and the pod boots before it has any session to hold.
 */
export async function GET() {
  const desired = await getDesiredModel().catch(() => "text" as const);
  return new Response(desired, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
