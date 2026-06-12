import { AdminHeader } from "@/components/admin/AdminShell";
import { AppearanceEditor } from "@/components/admin/AppearanceEditor";
import { getActiveTheme } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const theme = await getActiveTheme();
  return (
    <>
      <AdminHeader
        title="Appearance"
        description="Switch the site's color palette and typography. Changes publish instantly, site-wide."
      />
      <div className="p-8">
        <AppearanceEditor initial={theme} />
      </div>
    </>
  );
}
