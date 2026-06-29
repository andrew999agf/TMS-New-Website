import { AdminHeader } from "@/components/admin/AdminShell";
import { DocumentGenerator } from "@/components/admin/DocumentGenerator";
import { DocToolbar } from "@/components/admin/DocToolbar";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { FIELD_LABELS } from "@/lib/documents/templates";
import { LEGAL_DOC_META } from "@/lib/documents/legal-specs";
import { getSetting } from "@/lib/content";
import { ESTATE_PRACTICE_SLUG } from "@/lib/intake/config";

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

  const templates = await getSetting<{ id: string; name: string; url: string; pathname: string; uploadedAt: string }[]>(
    "documents.templates",
    [],
  );
  const mergeFields = Object.entries(FIELD_LABELS).map(([token, label]) => ({ token, label }));
  const intakeUrl = `/consultation?practice=${ESTATE_PRACTICE_SLUG}`;

  return (
    <>
      <AdminHeader
        title="Document Generator"
        description="Turn an estate-planning intake into draft documents. Blank fields show as placeholders for the attorney to complete."
      />
      <div className="p-8">
        <DocToolbar mergeFields={mergeFields} initialTemplates={Array.isArray(templates) ? templates : []} intakeUrl={intakeUrl} />
        <DocumentGenerator submissions={submissions} docMeta={LEGAL_DOC_META} intakeUrl={intakeUrl} />
      </div>
    </>
  );
}
