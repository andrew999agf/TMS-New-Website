import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { getPracticeAreas } from "@/lib/content";
import { PRACTICE_GROUPS } from "@/lib/content/defaults/practice-areas";

export const metadata: Metadata = {
  title: "Practice Areas",
  description:
    "A trial firm with a general practice. Fifteen practice areas across litigation, defense, and counsel — every matter prepared for trial.",
};

export default async function PracticeAreasPage() {
  const practices = await getPracticeAreas();

  return (
    <>
      <PageHero
        eyebrow="Practice Areas"
        title="A trial firm with a general practice."
        lead="The law is a seamless web. We practice across it — and prepare every matter for trial from day one."
      />
      <div className="container-page py-16 lg:py-24 space-y-16">
        {PRACTICE_GROUPS.map((group) => {
          const inGroup = practices.filter((p) => p.group === group.id);
          return (
            <section key={group.id}>
              <div className="flex items-baseline gap-4 border-b border-[var(--c-border)] pb-3">
                <h2 className="font-[family-name:var(--font-ui)] text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">
                  {group.label}
                </h2>
                <span className="text-xs text-[var(--c-ink-muted)] hidden sm:inline">
                  {group.blurb}
                </span>
              </div>
              <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {inGroup.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/practice-areas/${p.slug}`}
                    className="group block border border-[var(--c-border)] p-7 hover:border-[var(--c-accent)] transition-colors bg-[var(--c-surface)]"
                  >
                    <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight group-hover:text-[var(--c-accent)] transition-colors">
                      {p.title}
                    </h3>
                    <p className="mt-3 text-sm text-[var(--c-ink-muted)] leading-relaxed">
                      {p.tagline}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-[family-name:var(--font-ui)] text-[var(--c-accent)]">
                      Learn more
                      <ArrowRight
                        size={15}
                        className="group-hover:translate-x-1 transition-transform"
                      />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
