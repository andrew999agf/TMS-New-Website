import { AdminHeader } from "@/components/admin/AdminShell";
import { getGlossaryTerms } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function GlossaryAdmin() {
  const terms = await getGlossaryTerms();
  return (
    <>
      <AdminHeader
        title="Glossary"
        description={`${terms.length} terms. Each has a definition, a flashcard hypothetical, and related practice areas.`}
      />
      <div className="p-8 max-w-3xl">
        <div className="rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
          {terms.map((t) => (
            <div key={t.slug} className="px-5 py-3.5 bg-[var(--c-surface)]">
              <div className="font-medium">{t.term}</div>
              <div className="text-xs text-[var(--c-ink-muted)] line-clamp-1">{t.definition}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--c-ink-muted)]">
          Terms auto-highlight in post bodies and populate the public Glossary index. New terms
          can be created here or inline from the post editor; they write to the
          <code className="mx-1">glossary_terms</code> table.
        </p>
      </div>
    </>
  );
}
