import { AdminHeader } from "@/components/admin/AdminShell";
import { BannerManager, type BannerRow } from "@/components/admin/BannerManager";
import { db, hasDb } from "@/db";
import { bannerItems } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BannerAdmin() {
  let items: BannerRow[] = [];
  if (db) {
    try {
      const rows = await db.select().from(bannerItems).orderBy(asc(bannerItems.sort));
      items = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        url: r.url,
        alt: r.alt,
        durationMs: r.durationMs,
        kenBurns: r.kenBurns,
        visible: r.visible,
        sort: r.sort,
      }));
    } catch {
      items = [];
    }
  }
  return (
    <>
      <AdminHeader title="Home Banner" description="Ordered hero media sequence — video clips and stills with crossfades and Ken Burns." />
      <div className="p-8">
        <BannerManager items={items} dbEnabled={hasDb} />
      </div>
    </>
  );
}
