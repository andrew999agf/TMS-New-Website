import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { getResults, getBlocks, getPracticeAreas } from "@/lib/content";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** A result gets its own page only when the admin checked "Give this result
 *  its own page"; everything else 404s rather than exposing a URL per row. */
async function findResult(slug: string) {
  const results = await getResults();
  return results.find((r) => r.hasPage && slugify(r.title) === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await findResult(slug);
  if (!result) return {};
  return {
    title: result.title,
    description: result.summary ?? result.detail ?? "Case result.",
  };
}

export default async function ResultDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [result, footer, practices] = await Promise.all([
    findResult(slug),
    getBlocks("footer"),
    getPracticeAreas(),
  ]);
  if (!result) notFound();

  const disclaimer =
    footer["footer.results.disclaimer"] ??
    "Past results do not guarantee a similar outcome. Each case depends on its own facts and circumstances.";
  const practice = practices.find((p) => p.slug === result.practiceSlug);

  const paragraphs = (result.pageBody ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      <PageHero
        eyebrow={practice?.title ?? "The Record"}
        title={result.title}
        lead={result.summary}
      />

      <div className="container-page py-16 lg:py-24">
        <div className="max-w-3xl">
          {result.stat && (
            <div className="mb-10">
              <div className="font-[family-name:var(--font-display)] text-5xl lg:text-6xl text-[var(--c-accent)] leading-none">
                {result.stat}
              </div>
              {result.statLabel && (
                <p className="mt-3 text-sm text-[var(--c-ink-muted)] font-[family-name:var(--font-ui)]">
                  {result.statLabel}
                </p>
              )}
            </div>
          )}

          {result.detail && (
            <div className="border-l-2 border-[var(--c-accent)] pl-5">
              <p className="text-[var(--c-ink-muted)] leading-relaxed">{result.detail}</p>
            </div>
          )}

          {paragraphs.length > 0 && (
            <div className="mt-10 space-y-5">
              {paragraphs.map((p, i) => (
                <p key={i} className="leading-relaxed">{p}</p>
              ))}
            </div>
          )}

          <dl className="mt-10 grid gap-4 border-t border-[var(--c-border)] pt-8 sm:grid-cols-2">
            {result.cite && (
              <div>
                <dt className="eyebrow-muted text-xs">Citation</dt>
                <dd className="mt-1 text-sm text-[var(--c-ink-muted)]">{result.cite}</dd>
              </div>
            )}
            {result.year && (
              <div>
                <dt className="eyebrow-muted text-xs">Year</dt>
                <dd className="mt-1 text-sm text-[var(--c-ink-muted)]">{result.year}</dd>
              </div>
            )}
            {practice && (
              <div>
                <dt className="eyebrow-muted text-xs">Practice area</dt>
                <dd className="mt-1 text-sm">
                  <Link href={`/practice-areas/${practice.slug}`} className="text-[var(--c-accent)]">
                    {practice.title}
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          {result.link && (
            <Link href={result.link} className="mt-8 inline-flex items-center gap-1.5 text-sm text-[var(--c-accent)]">
              Watch the argument <ArrowRight size={14} />
            </Link>
          )}

          <div className="mt-12">
            <Link href="/results" className="inline-flex items-center gap-1.5 text-sm text-[var(--c-accent)] font-[family-name:var(--font-ui)]">
              <ArrowLeft size={14} /> All results
            </Link>
          </div>

          <p className="mt-16 text-sm text-[var(--c-ink-muted)] border-t border-[var(--c-border)] pt-8">
            {disclaimer}
          </p>
        </div>
      </div>
    </>
  );
}
