import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { AdminHeader } from "@/components/admin/AdminShell";
import { MapOverlayTool, type SavedProject } from "@/components/admin/MapOverlayTool";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { mapOverlayProjects } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function MapOverlayPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/map-overlay", session.role, session.permissions)) notFound();

  let projects: SavedProject[] = [];
  if (db) {
    try {
      projects = (await db.select().from(mapOverlayProjects).orderBy(desc(mapOverlayProjects.updatedAt))).map((p) => ({
        id: p.id, name: p.name, base: p.base, baseTx: p.baseTx, layers: p.layers ?? [], crop: p.crop ?? null,
        updatedAt: p.updatedAt.toISOString(),
      }));
    } catch {
      /* run Settings → Database updates once */
    }
  }

  return (
    <>
      <AdminHeader
        title="Map Overlay"
        description="Lay a map, plat, or survey over an aerial photo — drag any layer into place, adjust opacity, trim to the area that matters, and download at full resolution. Save keeps the whole setup to reopen later."
      />
      <div className="p-8">
        <MapOverlayTool projects={projects} />
      </div>
    </>
  );
}
