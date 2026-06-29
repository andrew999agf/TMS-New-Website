import { AdminHeader } from "@/components/admin/AdminShell";
import { DocumentGenerator } from "@/components/admin/DocumentGenerator";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { DOC_META } from "@/lib/documents/templates";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requireAdmin();

  let submissions: { id: number; name: string; email: string | null; createdAt: string; answers: Record<string, unknown> }[] = [];
  if (db) {
    try {
      const rows = await db
        .select()
        .from(intakeSubmissions)
        .where(eq(intakeSubmissions.branch, "estate"))
        .orderBy(desc(intakeSubmissions.createdAt))
        .limit(100);
      submissions = rows.map((r) => ({
        id: r.id,
        name: r.name ?? "Unnamed",
        email: r.email ?? null,
        createdAt: r.createdAt.toISOString(),
        answers: (r.answers as Record<string, unknown>) ?? {},
      }));
    } catch {
      /* table not present yet */
    }
  }

  return (
    <>
      <AdminHeader
        title="Document Generator"
        description="Turn an estate-planning intake into draft documents. Blank fields show as placeholders for the attorney to complete."
      />
      <div className="p-8">
        <DocumentGenerator submissions={submissions} docMeta={DOC_META} />
      </div>
    </>
  );
}
