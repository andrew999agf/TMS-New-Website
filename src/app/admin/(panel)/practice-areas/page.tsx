import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { getPracticeAreas } from "@/lib/content";
import { PRACTICE_GROUPS } from "@/lib/content/defaults/practice-areas";

export const dynamic = "force-dynamic";

export default async function PracticeAreasAdmin() {
  const areas = await getPracticeAreas();
  return (
    <>
      <AdminHeader
        title="Practice Areas"
        description="15 areas across three groups. Tagline, copy, approach, and keywords are editable per area."
      />
      <div className="p-8 space-y-8 max-w-3xl">
        {PRACTICE_GROUPS.map((g) => (
          <section key={g.id}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)] mb-3">
              {g.label}
            </h2>
            <div className="rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
              {areas
                .filter((a) => a.group === g.id)
                .map((a) => (
                  <div key={a.slug} className="flex items-center justify-between px-5 py-3.5 bg-[var(--c-surface)]">
                    <div>
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-[var(--c-ink-muted)]">{a.tagline}</div>
                    </div>
                    <Link href={`/practice-areas/${a.slug}`} target="_blank" className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
                      <ExternalLink size={15} />
                    </Link>
                  </div>
                ))}
            </div>
          </section>
        ))}
        <p className="text-sm text-[var(--c-ink-muted)]">
          Per-area rich editing (copy, approach, hero image, keywords, SEO) writes to the
          <code className="mx-1">practice_areas</code> table. Seed content loads via
          <code className="mx-1">npm run db:seed</code>.
        </p>
      </div>
    </>
  );
}
