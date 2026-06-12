import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { getResults, getBlocks } from "@/lib/content";
import {
  LITIGATION_COUNTIES,
  FEDERAL_COURTS,
  OPPOSING_INSTITUTIONS,
} from "@/lib/firm";

export const metadata: Metadata = {
  title: "Results",
  description:
    "The record talks. Summary-judgment dismissals, appellate affirmances, recoveries, and jury-trial experience across Texas.",
};

export default async function ResultsPage() {
  const [results, footer] = await Promise.all([getResults(), getBlocks("footer")]);
  const disclaimer =
    footer["footer.results.disclaimer"] ??
    "Past results do not guarantee a similar outcome. Each case depends on its own facts and circumstances.";

  const marquee = results.find((r) => r.category === "marquee");
  const appellate = results.filter((r) => r.category === "appellate");
  const settlements = results.filter((r) => r.category === "settlement");
  const jury = results.filter((r) => r.category === "jury");

  return (
    <>
      <PageHero
        eyebrow="The Record"
        title="We don't say much. The record talks."
        lead="Over a thousand matters. Jury trials, bench trials, appeals. Here is some of it."
      />

      <div className="container-page py-16 lg:py-24 space-y-20">
        {/* Marquee */}
        {marquee && (
          <section className="bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] p-10 lg:p-16">
            <p className="eyebrow text-[var(--c-dark-accent)]">Marquee result</p>
            <div className="mt-6 grid gap-8 lg:grid-cols-[auto_1fr] lg:gap-16 lg:items-center">
              <div className="font-[family-name:var(--font-display)] text-6xl lg:text-8xl text-[var(--c-dark-accent)] leading-none">
                {marquee.stat}
              </div>
              <div>
                <h2 className="h3 text-[var(--c-dark-ink)]">{marquee.title}</h2>
                <p className="mt-4 text-[var(--c-dark-ink-muted)] leading-relaxed max-w-2xl">
                  {marquee.summary}
                </p>
                {marquee.detail && (
                  <details className="mt-5 group">
                    <summary className="cursor-pointer text-sm text-[var(--c-dark-accent)] font-[family-name:var(--font-ui)] list-none">
                      Case detail &amp; citation →
                    </summary>
                    <p className="mt-3 text-sm text-[var(--c-dark-ink-muted)] leading-relaxed">
                      {marquee.detail}
                    </p>
                  </details>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Appellate record */}
        {appellate.length > 0 && (
          <section>
            <h2 className="h3 border-b border-[var(--c-border)] pb-3">Appellate record</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {appellate.map((r, i) => (
                <article key={i} className="border border-[var(--c-border)] p-7 bg-[var(--c-surface)]">
                  {r.stat && (
                    <div className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-accent)] leading-none mb-3">
                      {r.stat}
                    </div>
                  )}
                  <h3 className="font-[family-name:var(--font-display)] text-lg leading-snug">
                    {r.title}
                  </h3>
                  {r.summary && (
                    <p className="mt-3 text-sm text-[var(--c-ink-muted)] leading-relaxed">
                      {r.summary}
                    </p>
                  )}
                  {r.cite && (
                    <p className="mt-4 text-xs text-[var(--c-ink-muted)] font-[family-name:var(--font-ui)]">
                      {r.cite}
                    </p>
                  )}
                  {r.link && (
                    <Link
                      href={r.link}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--c-accent)]"
                    >
                      Watch the argument <ArrowRight size={14} />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Settlements */}
        {settlements.length > 0 && (
          <section>
            <h2 className="h3 border-b border-[var(--c-border)] pb-3">Settlements &amp; recoveries</h2>
            <ul className="mt-6 divide-y divide-[var(--c-border)]">
              {settlements.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-6 py-4">
                  <span className="leading-snug">{r.title}</span>
                  {r.year && (
                    <span className="text-sm text-[var(--c-ink-muted)] whitespace-nowrap font-[family-name:var(--font-ui)]">
                      {r.year}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Jury trial record */}
        {jury.length > 0 && (
          <section>
            <h2 className="h3 border-b border-[var(--c-border)] pb-3">Jury-trial record</h2>
            <p className="mt-4 text-[var(--c-ink-muted)] max-w-2xl">
              Numerous jury trials, including documented criminal jury trials in Tarrant County.
              A small case tried like a big one, because it was connected to a big one.
            </p>
            <ul className="mt-6 divide-y divide-[var(--c-border)]">
              {jury.map((r, i) => (
                <li key={i} className="py-4">
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="leading-snug">{r.title}</span>
                    {r.year && (
                      <span className="text-sm text-[var(--c-ink-muted)] whitespace-nowrap font-[family-name:var(--font-ui)]">
                        {r.year}
                      </span>
                    )}
                  </div>
                  {r.summary && (
                    <p className="mt-2 text-sm text-[var(--c-ink-muted)]">{r.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Counties, courts, institutions */}
        <section className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="h3 border-b border-[var(--c-border)] pb-3">Counties &amp; courts</h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {LITIGATION_COUNTIES.map((c) => (
                <span
                  key={c}
                  className="px-3.5 py-1.5 text-sm border border-[var(--c-border)] rounded-full font-[family-name:var(--font-ui)]"
                >
                  {c}
                </span>
              ))}
            </div>
            <ul className="mt-6 space-y-2">
              {FEDERAL_COURTS.map((c) => (
                <li key={c} className="text-[var(--c-ink-muted)] text-sm">
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="h3 border-b border-[var(--c-border)] pb-3">We have litigated opposite</h2>
            <ul className="mt-6 grid grid-cols-2 gap-y-2 gap-x-6">
              {OPPOSING_INSTITUTIONS.map((b) => (
                <li key={b} className="text-[var(--c-ink-muted)]">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Disclaimer */}
        <p className="text-sm text-[var(--c-ink-muted)] border-t border-[var(--c-border)] pt-8">
          {disclaimer}
        </p>
      </div>
    </>
  );
}
