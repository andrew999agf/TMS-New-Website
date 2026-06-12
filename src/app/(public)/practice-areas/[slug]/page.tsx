import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHero, Breadcrumbs } from "@/components/site/PageHero";
import { YouTubeEmbed } from "@/components/site/YouTubeEmbed";
import {
  getPracticeArea,
  getPracticeAreas,
  getResultsForPractice,
  getPostsForPractice,
} from "@/lib/content";
import { NELSON_VIDEO_ID } from "@/lib/firm";
import { formatDate } from "@/lib/utils";

export async function generateStaticParams() {
  const all = await getPracticeAreas();
  return all.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pa = await getPracticeArea(slug);
  if (!pa) return {};
  return {
    title: pa.seoTitle ?? pa.title,
    description: pa.seoDescription ?? pa.tagline,
  };
}

export default async function PracticeAreaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pa = await getPracticeArea(slug);
  if (!pa) notFound();

  const [results, posts] = await Promise.all([
    getResultsForPractice(slug),
    getPostsForPractice(slug, 3),
  ]);

  const isAppellate = slug === "appellate-law";

  return (
    <>
      <PageHero eyebrow="Practice Area" title={pa.title} lead={pa.tagline}>
        <div className="mt-2">
          <Breadcrumbs
            items={[
              { label: "Practice Areas", href: "/practice-areas" },
              { label: pa.title },
            ]}
          />
        </div>
      </PageHero>

      <div className="container-page py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_0.6fr] lg:gap-16">
          {/* Main copy */}
          <div>
            <div className="prose-firm">
              {pa.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            {/* Appellate video feature */}
            {isAppellate && (
              <div className="mt-12">
                <h2 className="h3 mb-2">Watch Max argue before the Court of Appeals</h2>
                <p className="text-[var(--c-ink-muted)] mb-5">
                  Oral argument in <em>Nelson v. The City of Lubbock</em>, Seventh Court of
                  Appeals (Amarillo). Presented as advocacy and experience.
                </p>
                <YouTubeEmbed id={NELSON_VIDEO_ID} title="Oral argument — Nelson v. City of Lubbock" />
              </div>
            )}

            {/* How we approach it */}
            <div className="mt-12 border-l-2 border-[var(--c-accent)] pl-6 lg:pl-8 py-1">
              <h2 className="font-[family-name:var(--font-ui)] text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">
                How we approach it
              </h2>
              <p className="mt-3 font-[family-name:var(--font-display)] text-xl lg:text-2xl leading-snug">
                {pa.approach}
              </p>
            </div>

            {/* CTA */}
            <div className="mt-12 bg-[var(--c-surface2)] p-8 lg:p-10">
              <h2 className="h3">Talk to the firm about your matter.</h2>
              <p className="mt-3 text-[var(--c-ink-muted)] max-w-xl">
                Tell us what is going on. The first conversation is straightforward, and we
                will tell you honestly where you stand.
              </p>
              <Link href={`/consultation?practice=${pa.slug}`} className="btn btn-accent mt-6">
                Request a Consultation <ArrowRight size={18} />
              </Link>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-10">
            {results.length > 0 && (
              <div>
                <h3 className="eyebrow eyebrow-muted mb-4">Related results</h3>
                <ul className="space-y-4">
                  {results.slice(0, 4).map((r, i) => (
                    <li key={i} className="border-b border-[var(--c-border)] pb-4">
                      {r.stat && (
                        <div className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-accent)] leading-none">
                          {r.stat}
                        </div>
                      )}
                      <p className="mt-1.5 text-sm leading-snug">{r.title}</p>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/results"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--c-accent)] font-[family-name:var(--font-ui)]"
                >
                  All results <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {posts.length > 0 && (
              <div>
                <h3 className="eyebrow eyebrow-muted mb-4">Related reading</h3>
                <ul className="space-y-4">
                  {posts.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/blog/${p.slug}`} className="group block">
                        <span className="font-[family-name:var(--font-display)] leading-snug group-hover:text-[var(--c-accent)] transition-colors">
                          {p.title}
                        </span>
                        {p.publishAt && (
                          <span className="block text-xs text-[var(--c-ink-muted)] mt-1">
                            {formatDate(p.publishAt)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
