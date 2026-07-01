import Link from "next/link";
import { ArrowLeft, BookMarked } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getGlossaryEntries, GLOSSARY_CATEGORIES } from "@/lib/training/glossary";
import { GlossaryList } from "@/components/admin/training/GlossaryList";

export const dynamic = "force-dynamic";

/**
 * The full training glossary. Every term that appears navy-and-underlined in a
 * lesson lives here, grouped by practice area, with the same definition and
 * hypothetical shown in the hover popups.
 */
export default async function TrainingGlossaryPage() {
  await requireAdmin();

  const entries = getGlossaryEntries();
  const groups = GLOSSARY_CATEGORIES.map((category) => ({
    category: category as string,
    entries: entries.filter((e) => e.category === category),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="p-8 max-w-4xl">
      <Link
        href="/admin/training"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
      >
        <ArrowLeft size={15} /> All training
      </Link>

      <div className="mt-4 border-b border-[var(--c-border)] pb-6">
        <p className="eyebrow flex items-center gap-1.5 text-[#1b3a6b]">
          <BookMarked size={13} /> Reference
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--c-ink)]">
          Glossary of Key Terms
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--c-ink-muted)]">
          Every key term from the training modules in one place — each with a plain-English definition and a short
          hypothetical showing the term in action. In the lessons themselves, these terms appear in{" "}
          <span className="font-semibold text-[#1b3a6b] underline decoration-dotted decoration-[#1b3a6b]/60 underline-offset-2">
            navy with a dotted underline
          </span>{" "}
          — hover one to see the same definition and hypothetical without leaving the page.
        </p>
      </div>

      <div className="mt-6">
        <GlossaryList groups={groups} />
      </div>
    </div>
  );
}
