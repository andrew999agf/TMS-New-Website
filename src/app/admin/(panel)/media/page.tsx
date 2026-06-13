import { AdminHeader } from "@/components/admin/AdminShell";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { desc } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";

export const dynamic = "force-dynamic";

export default async function MediaAdmin() {
  let assets: { id: number; url: string; kind: string; alt: string | null; folder: string | null }[] = [];
  if (db) {
    try {
      const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(200);
      assets = rows.map((r) => ({ id: r.id, url: r.url, kind: r.kind, alt: r.alt, folder: r.folder }));
    } catch {
      assets = [];
    }
  }
  const blobConfigured = isBlobConfigured();
  const detected = {
    BLOB_STORE_ID: Boolean(process.env.BLOB_STORE_ID),
    VERCEL_OIDC_TOKEN: Boolean(process.env.VERCEL_OIDC_TOKEN),
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };

  return (
    <>
      <AdminHeader
        title="Media Library"
        description="Upload and manage images and banner video. Stored on Vercel Blob."
      />
      <div className="p-8">
        <MediaLibrary assets={assets} blobConfigured={blobConfigured} detected={detected} />
      </div>
    </>
  );
}
