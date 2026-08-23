import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { Assistant } from "@/components/admin/Assistant";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { aiPublicInfo } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) notFound();

  const { configured, label } = aiPublicInfo();

  return (
    <>
      <AdminHeader
        title="Assistant"
        description="An in-house AI assistant for the firm — coding, drafting, and quick answers. Admin-only, kept off the public site."
      />
      <div className="p-6">
        <Assistant configured={configured} label={label} />
      </div>
    </>
  );
}
