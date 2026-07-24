import Link from "next/link";
import { BookMarked, ChevronRight } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { TrainingAccordion } from "@/components/admin/training/TrainingAccordion";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { getModules } from "@/lib/training/modules";
import { TRAINING_CATEGORIES } from "@/lib/training/types";
import { getMyCompletion, getMyAllowedSlugs } from "./actions";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const session = await requireAdmin();
  const allowed = await getMyAllowedSlugs();
  const full = isFullAdmin(session.role);
  const modules = getModules().filter((m) => full || allowed.includes(m.slug));
  const completion = await getMyCompletion();
  const doneCount = modules.filter((m) => completion[m.slug]).length;

  const groups = TRAINING_CATEGORIES.map((cat) => ({
    category: cat,
    items: modules
      .filter((m) => m.category === cat)
      .map((m) => ({ slug: m.slug, title: m.title, summary: m.summary, audience: m.audience, lessons: m.lessons.length, estMinutes: m.estMinutes, done: !!completion[m.slug] })),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <AdminHeader
        title="Training"
        description="Onboarding and required-reading modules for the team. Work through each one and mark it complete."
      />
      <div className="p-8 max-w-4xl">
        <p className="mb-4 text-sm text-[var(--c-ink-muted)]">
          <span className="font-semibold text-[var(--c-ink)]">{doneCount}</span> of{" "}
          <span className="font-semibold text-[var(--c-ink)]">{modules.length}</span> modules completed.
        </p>

        <Link
          href="/admin/training/glossary"
          className="group mb-8 flex items-center gap-3 rounded-xl border border-[#1b3a6b]/25 bg-[#1b3a6b]/[0.04] p-4 transition hover:border-[#1b3a6b]/50 hover:shadow-sm"
        >
          <BookMarked size={18} className="shrink-0 text-[#1b3a6b]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#1b3a6b]">Glossary of Key Terms</span>
            <span className="block text-xs leading-relaxed text-[var(--c-ink-muted)]">
              Every navy, dotted-underlined term from the lessons — definitions plus a hypothetical for each. Hover a
              term in any lesson for the same popup.
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-[#1b3a6b] transition group-hover:translate-x-0.5" />
        </Link>

        {modules.length === 0 ? (
          <p className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm text-[var(--c-ink-muted)]">
            No training modules have been assigned to your account yet. Check with an administrator.
          </p>
        ) : (
          <TrainingAccordion groups={groups} />
        )}
      </div>
    </>
  );
}
