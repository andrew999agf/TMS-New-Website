import { AdminHeader } from "@/components/admin/AdminShell";
import { TexasRulesManager } from "@/components/admin/TexasRulesManager";
import { getSetting } from "@/lib/content";
import { TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES, type TexasRule } from "@/lib/texas-rules";

export const dynamic = "force-dynamic";

export default async function TexasRulesAdmin() {
  const rules = await getSetting<TexasRule[]>(TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES);
  return (
    <>
      <AdminHeader
        title="Texas Rules"
        description="The downloadable rules shown on the public Texas Rules page. Mirror of the live content."
      />
      <div className="p-8">
        <TexasRulesManager initial={rules} />
      </div>
    </>
  );
}
