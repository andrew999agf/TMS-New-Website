import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { PatriotShell } from "../../PatriotShell";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { getSetting } from "@/lib/content";
import { PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS, type PatriotArticle } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

async function getArticle(slug: string): Promise<PatriotArticle | undefined> {
  const articles = await getSetting<PatriotArticle[]>(PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS);
  return articles.find((a) => a.id === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticle(slug);
  return {
    title: a ? `${a.title} · Patriot Series` : "News · Patriot Series",
    description: a?.dek ?? "Tournament coverage from the Patriot Series.",
    robots: { index: false, follow: false },
  };
}

export default async function PatriotArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const vis = await getPageVisibility();
  if (!vis.news) redirect("/");

  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const paragraphs = article.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <PatriotShell active="/news" eyebrow={article.date} title={article.title} subtitle={article.dek}>
      <article className="mx-auto max-w-3xl">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[color:var(--psx-muted)] transition-colors hover:text-[color:var(--psx-fg)]"
        >
          <ArrowLeft size={14} /> All news
        </Link>

        {article.banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.banner}
            alt={article.title}
            className="mt-5 w-full rounded-2xl border border-[color:var(--psx-border)] object-cover"
          />
        )}

        <div className="mt-7 space-y-5 text-[15px] leading-relaxed text-[color:var(--psx-fg)]">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {article.tournamentYear && (
          <Link
            href="/past-tournaments"
            className="mt-9 flex items-center gap-3 rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] p-4 transition-colors hover:border-[color:var(--psx-accent)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-yellow-400/30 bg-yellow-400/10 text-yellow-500">
              <Trophy size={18} strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[color:var(--psx-fg)]">
                {article.tournamentYear} Patriot Series
              </span>
              <span className="block text-xs text-[color:var(--psx-muted)]">See the bracket history and past champions</span>
            </span>
          </Link>
        )}
      </article>
    </PatriotShell>
  );
}
