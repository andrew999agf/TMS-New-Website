import Link from "next/link";
import { CheckCircle2, Clock, BookOpen, ChevronRight } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth";
import { getModules } from "@/lib/training/modules";
import { TRAINING_CATEGORIES } from "@/lib/training/types";
import { getMyCompletion } from "./actions";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  await requireAdmin();
  const modules = getModules();
  const completion = await getMyCompletion();
  const doneCount = modules.filter((m) => completion[m.slug]).length;

  const byCategory = TRAINING_CATEGORIES.map((cat) => ({
    cat,
    items: modules.filter((m) => m.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <AdminHeader
        title="Training"
        description="Onboarding and required-reading modules for the team. Work through each one and mark it complete."
      />
      <div className="p-8 max-w-4xl">
        <p className="mb-8 text-sm text-[var(--c-ink-muted)]">
          <span className="font-semibold text-[var(--c-ink)]">{doneCount}</span> of{" "}
          <span className="font-semibold text-[var(--c-ink)]">{modules.length}</span> modules completed.
        </p>

        <div className="space-y-10">
          {byCategory.map((group) => (
            <section key={group.cat}>
              <h2 className="eyebrow text-[var(--c-ink-muted)] mb-3">{group.cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((m) => {
                  const done = completion[m.slug];
                  return (
                    <Link
                      key={m.slug}
                      href={`/admin/training/${m.slug}`}
                      className="group flex flex-col rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 transition hover:border-[var(--c-accent)]/50 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--c-ink)]">
                          {m.title}
                        </h3>
                        {done ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">
                            <CheckCircle2 size={12} /> Done
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-[var(--c-border)] px-2 py-0.5 text-[11px] text-[var(--c-ink-muted)]">
                            {m.audience}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--c-ink-muted)]">{m.summary}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-[var(--c-ink-muted)]">
                        <span className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <BookOpen size={13} /> {m.lessons.length} lessons
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={13} /> {m.estMinutes} min
                          </span>
                        </span>
                        <span className="flex items-center gap-0.5 font-medium text-[var(--c-accent)]">
                          {done ? "Review" : "Start"}
                          <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
