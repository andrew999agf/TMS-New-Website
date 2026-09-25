import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { Assistant } from "@/components/admin/Assistant";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath, canUseAssistantCode } from "@/lib/admin-sections";
import { aiPublicInfo } from "@/lib/ai/config";
import { db } from "@/db";
import { assistantThreads, caseHub } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { ThreadRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) notFound();

  const { configured, label } = aiPublicInfo();

  // Saved conversations (newest first). If the table isn't created yet the tab
  // still works — conversations just aren't saved until Database updates runs.
  let threads: ThreadRow[] = [];
  let saveable = false;
  if (db) {
    try {
      const rows = await db
        .select({ id: assistantThreads.id, mode: assistantThreads.mode, title: assistantThreads.title, updatedAt: assistantThreads.updatedAt })
        .from(assistantThreads)
        .where(eq(assistantThreads.userEmail, session.email))
        .orderBy(desc(assistantThreads.updatedAt))
        .limit(100);
      threads = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
      saveable = true;
    } catch {
      saveable = false;
    }
  }

  // Matter numbers for the attach-a-case picker (most recently touched first).
  let matters: string[] = [];
  if (db) {
    try {
      const rows = await db
        .select({ matter: caseHub.matter })
        .from(caseHub)
        .where(eq(caseHub.archived, false))
        .orderBy(desc(caseHub.updatedAt))
        .limit(200);
      matters = rows.map((r) => r.matter).filter(Boolean);
    } catch { /* hub table pending */ }
  }

  // The Coding tool is a separately granted ability (owners always have it;
  // everyone else needs the checkbox in User Management).
  const codeAllowed = canUseAssistantCode(session.role, session.permissions);

  return (
    <>
      <AdminHeader
        title="Assistant"
        description="The firm's in-house AI — general conversation, document drafting, and coding, with saved conversations and voice. Admin-only, kept off the public site."
      />
      <div className="p-6">
        <Assistant configured={configured} label={label} initialThreads={threads} saveable={saveable} codeAllowed={codeAllowed} matters={matters} />
      </div>
    </>
  );
}
