import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, BookOpen, Users, FileText } from "lucide-react";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { getModule } from "@/lib/training/modules";
import { ModuleBody } from "@/components/admin/training/ModuleBody";
import { ModuleComplete } from "@/components/admin/training/ModuleComplete";
import { getMyCompletion, getMyAllowedSlugs } from "../actions";

export const dynamic = "force-dynamic";

export default async function TrainingModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await requireAdmin();
  const { slug } = await params;
  const mod = getModule(slug);
  if (!mod) notFound();

  // Respect per-user module access (full admins can preview anything).
  if (!isFullAdmin(session.role)) {
    const allowed = await getMyAllowedSlugs();
    if (!allowed.includes(mod.slug)) notFound();
  }

  const completion = await getMyCompletion();
  const completedAt = completion[mod.slug];

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/admin/training"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
      >
        <ArrowLeft size={15} /> All training
      </Link>

      {/* Header */}
      <div className="mt-4 border-b border-[var(--c-border)] pb-6">
        <p className="eyebrow text-[var(--c-accent)]">{mod.category}</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--c-ink)]">{mod.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--c-ink-muted)]">{mod.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--c-ink-muted)]">
          <span className="flex items-center gap-1.5">
            <Users size={13} /> {mod.audience}
          </span>
          <span className="flex items-center gap-1.5">
            <BookOpen size={13} /> {mod.lessons.length} lessons
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} /> {mod.estMinutes} min
          </span>
          <span>Updated {mod.updated}</span>
        </div>
        {mod.sourceNote && (
          <p className="mt-4 flex items-start gap-1.5 text-xs italic text-[var(--c-ink-muted)]">
            <FileText size={13} className="mt-0.5 shrink-0" /> {mod.sourceNote}
          </p>
        )}
      </div>

      {/* Contents */}
      <nav className="mt-6 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface2)] p-4">
        <p className="eyebrow text-[var(--c-ink-muted)] mb-2">In this module</p>
        <ol className="space-y-1 text-sm">
          {mod.lessons.map((l, i) => (
            <li key={l.id}>
              <a href={`#${l.id}`} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
                <span className="text-[var(--c-accent)]">{i + 1}.</span> {l.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Lessons */}
      <div className="mt-10">
        <ModuleBody lessons={mod.lessons} />
      </div>

      <ModuleComplete slug={mod.slug} completedAt={completedAt} />
    </div>
  );
}
