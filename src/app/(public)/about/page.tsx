import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { MediaPlaceholder } from "@/components/site/MediaPlaceholder";
import { getBlocks } from "@/lib/content";
import {
  BAR_ADMISSIONS,
  EDUCATION,
  MEMBERSHIPS,
  FIRM,
} from "@/lib/firm";

export const metadata: Metadata = {
  title: "The Attorney",
  description:
    "Thomas Maxwell Smith — Fort Worth trial attorney. Over a thousand matters, jury trials, and appeals. Bosque County roots since the mid-1800s.",
};

export default async function AboutPage() {
  const about = await getBlocks("about");

  return (
    <>
      <PageHero
        eyebrow={about["about.hero.eyebrow"]}
        title={about["about.hero.heading"]}
        lead={about["about.hero.subhead"]}
      />

      <div className="container-page py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_0.6fr] lg:gap-16">
          {/* Bio */}
          <div>
            {/* Portrait — uploaded image or labeled placeholder */}
            {about["about.portrait"] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={about["about.portrait"]}
                alt={about["about.hero.heading"] ?? "Attorney portrait"}
                className="w-full aspect-[4/5] object-cover mb-10 border border-[var(--c-border)]"
              />
            ) : (
              <MediaPlaceholder slot="portrait" className="aspect-[4/5] w-full mb-10" />
            )}

            <div
              className="prose-firm"
              dangerouslySetInnerHTML={{ __html: about["about.bio.body"] ?? "" }}
            />

            <blockquote className="mt-12 border-l-2 border-[var(--c-accent)] pl-6 lg:pl-8">
              <p className="font-[family-name:var(--font-display)] text-xl lg:text-2xl italic leading-snug text-[var(--c-ink)]">
                “{about["about.quote.text"]}”
              </p>
              <footer className="mt-4 eyebrow eyebrow-muted">
                {about["about.quote.attribution"]}
              </footer>
            </blockquote>

            <div className="mt-12">
              <Link href="/practice-areas/appellate-law" className="btn btn-outline">
                Watch Max argue before the Court of Appeals <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* Credentials sidebar */}
          <aside className="space-y-10">
            <div>
              <h2 className="eyebrow eyebrow-muted mb-4">Bar admissions</h2>
              <ul className="space-y-3">
                {BAR_ADMISSIONS.map((a) => (
                  <li key={a.court} className="text-sm">
                    <span className="block">{a.court}</span>
                    <span className="text-[var(--c-ink-muted)]">Admitted {a.year}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="eyebrow eyebrow-muted mb-4">Education</h2>
              <ul className="space-y-3">
                {EDUCATION.map((e) => (
                  <li key={e.school} className="text-sm">
                    <span className="block">{e.school}</span>
                    <span className="text-[var(--c-ink-muted)]">
                      {e.degree}, {e.year}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="eyebrow eyebrow-muted mb-4">Memberships</h2>
              <ul className="space-y-2">
                {MEMBERSHIPS.map((m) => (
                  <li key={m} className="text-sm text-[var(--c-ink-muted)]">
                    {m}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-sm text-[var(--c-ink-muted)] border-t border-[var(--c-border)] pt-6">
              State Bar of Texas No. {FIRM.attorney.barNumber}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
