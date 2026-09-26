import { AdminHeader } from "@/components/admin/AdminShell";
import { DocumentGenerator } from "@/components/admin/DocumentGenerator";
import { TemplateLibrary } from "@/components/admin/TemplateLibrary";
import { listTemplateBank } from "./actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { LEGAL_DOC_META } from "@/lib/documents/legal-specs";
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

  const intakeUrl = `/consultation?practice=${ESTATE_PRACTICE_SLUG}`;
  const bank = await listTemplateBank();

  return (
    <>
      <AdminHeader
        title="Docs & Templates"
        description="The firm's Word-template bank — drop templates in, organize by practice area (or let AI.fred sort them), and generate filled documents from a matter. The estate-planning generator lives below."
      />
      <div className="p-4 sm:p-8">
        <TemplateLibrary initial={bank.templates} folders={bank.folders} standardFields={bank.standardFields} />
        <h2 className="mb-3 border-t border-[var(--c-border)] pt-6 font-[family-name:var(--font-display)] text-lg">Estate document generator</h2>
        <DocumentGenerator submissions={submissions} docMeta={LEGAL_DOC_META} intakeUrl={intakeUrl} />
      </div>
    </>
  );
}
