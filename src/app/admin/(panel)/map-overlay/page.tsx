import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { MapOverlayTool } from "@/components/admin/MapOverlayTool";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

export const dynamic = "force-dynamic";

export default async function MapOverlayPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/map-overlay", session.role, session.permissions)) notFound();

  return (
    <>
      <AdminHeader
        title="Map Overlay"
        description="Lay a map, plat, or survey over an aerial photo — drag it into place, adjust the opacity, and download the lined-up result at full resolution. Nothing is uploaded; it all happens in your browser."
      />
      <div className="p-8">
        <MapOverlayTool />
      </div>
    </>
  );
}
