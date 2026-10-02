import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { getResults, getBlocks, getPracticeAreas } from "@/lib/content";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Every visible result gets a detail page here in the blog. Results with a
 *  full write-up (the admin's "own page" section) show it; the rest get the
 *  simple version — stat, summary, citation block — until they're built out. */
async function findResult(slug: string) {
  const results = await getResults();
  return results.find((r) => slugify(r.title) === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await findResult(slug);
  if (!result) return {};
  const description = result.summary ?? result.detail ?? "Case result.";
  const base: Metadata = { title: result.title, description };
  // No custom share card → inherit the site's (home page) share exactly.
  if (!result.shareImage && !result.shareTitle && !result.shareDescription) return base;

  const shareTitle = result.shareTitle || result.title;
  const shareDescription = result.shareDescription || description;
  // A title/blurb-only card still needs an image: fall back to the site's.
  const image = result.shareImage || (await getBlocks("global"))["global.socialImage"] || "";
  const imgType = /\.png($|\?)/i.test(image) ? "image/png" : /\.(jpg|jpeg)($|\?)/i.test(image) ? "image/jpeg" : /\.webp($|\?)/i.test(image) ? "image/webp" : undefined;
  const images = image ? [{ url: image, width: 1200, height: 630, alt: shareTitle, ...(imgType ? { type: imgType } : {}) }] : undefined;
  return {
    ...base,
    openGraph: {
      type: "article",
      title: shareTitle,
      description: shareDescription,
      url: `/blog/results/${slug}`,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Render inline [text](url) links inside a page-body paragraph; everything
 *  else stays plain text. Links open in a new tab. */
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0, k = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a key={k++} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-[var(--c-accent)] underline underline-offset-2 hover:opacity-80">
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
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
        bgImage={result.heroImage || undefined}
        focal={result.heroFocal}
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
                <p key={i} className="leading-relaxed">{renderInline(p)}</p>
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

          <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/results" className="inline-flex items-center gap-1.5 text-sm text-[var(--c-accent)] font-[family-name:var(--font-ui)]">
              <ArrowLeft size={14} /> All results
            </Link>
            <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-[var(--c-accent)] font-[family-name:var(--font-ui)]">
              <ArrowLeft size={14} /> Insights
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
