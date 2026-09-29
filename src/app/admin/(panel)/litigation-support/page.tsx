import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { AdminHeader } from "@/components/admin/AdminShell";
import { LitigationSupport } from "@/components/admin/LitigationSupport";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { dwqPackages, litFiles } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { isBlobConfigured } from "@/lib/blob";

export const metadata: Metadata = { title: "Litigation Support" };
export const dynamic = "force-dynamic";

export default async function LitigationSupportPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/litigation-support", session.role, session.permissions)) notFound();
  if (!db) notFound();
  await ensureDiscoveryTables();

  const [files, packages] = await Promise.all([
    db.select().from(litFiles).orderBy(desc(litFiles.createdAt)),
    db.select().from(dwqPackages).orderBy(desc(dwqPackages.updatedAt)),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminHeader
        title="Litigation Support"
        description="Discovery paper, built in-house — DWQs, notices, subpoenas, and the firm's Word form bank."
      />
      <LitigationSupport
        files={files.map((f) => ({ id: f.id, filename: f.filename, url: f.url, sizeBytes: f.sizeBytes, notes: f.notes, uploadedBy: f.uploadedBy, createdAt: f.createdAt.toISOString() }))}
        packages={packages.map((p) => ({ id: p.id, matter: p.matter, entity: p.entity, data: p.data as Record<string, unknown>, updatedAt: p.updatedAt.toISOString() }))}
        blobReady={isBlobConfigured()}
      />
    </div>
  );
}
