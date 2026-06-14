import { AdminHeader } from "@/components/admin/AdminShell";
import { BadgesManager } from "@/components/admin/BadgesManager";
import { getBadges } from "@/lib/content";
import { hasDb } from "@/db";

export const dynamic = "force-dynamic";

export default async function BadgesAdmin() {
  const data = await getBadges(false);
  const badges = data.map((b) => ({
    id: b.id,
    name: b.name,
    logo: b.logo ?? "",
    url: b.url ?? "",
    visible: b.visible,
  }));
  return (
    <>
      <AdminHeader title="Badges" description="Organizations, bar associations, and awards shown below the home hero." />
      <div className="p-8">
        <BadgesManager badges={badges} dbEnabled={hasDb} />
      </div>
    </>
  );
}
