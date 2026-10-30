import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/PageHero";
import { searchSite } from "@/lib/search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

/** Site search as a page (the dialog's results, at a URL) — what Google's
 *  sitelinks search box points at. Not indexed itself. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const results = q ? await searchSite(q, 30) : [];
  return (
    <>
      <PageHero title={q ? `Search: ${q}` : "Search"} lead={q ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Search practice areas, results, articles, and the glossary."} />
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
        <form action="/search" method="get" className="mb-8 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Search the site…" className="flex-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2" aria-label="Search" />
          <button type="submit" className="btn btn-accent">Search</button>
        </form>
        {q && results.length === 0 && <p className="text-[var(--c-ink-muted)]">Nothing matched. Try a different word, or <Link href="/contact" className="text-[var(--c-accent)] underline">contact us</Link>.</p>}
        <ul className="divide-y divide-[var(--c-border)]">
          {results.map((r) => (
            <li key={r.url} className="py-4">
              <Link href={r.url} className="text-lg font-semibold hover:text-[var(--c-accent)]">{r.title}</Link>
              <p className="text-xs uppercase tracking-wide text-[var(--c-ink-muted)]">{r.type}</p>
              {r.subtitle && <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{r.subtitle}</p>}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
