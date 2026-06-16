import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroBanner, type BannerMedia } from "@/components/site/HeroBanner";
import { BadgeBar } from "@/components/site/BadgeBar";
import { TeamTeaser } from "@/components/site/TeamTeaser";
import { HomeIntro } from "@/components/site/HomeIntro";
import { media } from "@/lib/media";

/** First sentence (or a short truncation) of a bio, for the hover popover. */
function shortSummary(bio?: string): string | undefined {
  if (!bio) return undefined;
  const firstSentence = bio.split(/(?<=\.)\s/)[0];
  const base = firstSentence.length <= 180 ? firstSentence : bio.slice(0, 160).trim() + "…";
  return base;
}
import {
  getBlocks,
  getBannerItems,
  getFeaturedResults,
  getPracticeAreas,
  getTestimonials,
  getTeam,
  getBadges,
} from "@/lib/content";
import { PRACTICE_GROUPS } from "@/lib/content/defaults/practice-areas";
import {
  FEDERAL_COURTS,
  LITIGATION_COUNTIES,
  OFFICES,
} from "@/lib/firm";

// Always render from current database content (banners, copy, team, badges)
// so admin changes appear immediately — never a stale prebuilt snapshot.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [home, global, banner, results, practices, testimonials, team, badges] = await Promise.all([
    getBlocks("home"),
    getBlocks("global"),
    getBannerItems(),
    getFeaturedResults(6),
    getPracticeAreas(),
    getTestimonials(),
    getTeam(),
    getBadges(),
  ]);
  const lead = team.find((m) => m.isLead) ?? team[0];

  const bannerMedia: BannerMedia[] = banner.map((b) => ({
    id: b.id,
    kind: b.kind as "image" | "video",
    url: b.url,
    posterUrl: b.posterUrl,
    alt: b.alt,
    durationMs: b.durationMs,
    kenBurns: b.kenBurns,
    focal: b.focal,
  }));

  return (
    <>
      <HomeIntro
        logoLight={global["global.logoLight"] || undefined}
        logoDark={global["global.logoDark"] || undefined}
        firmName={global["global.firmShort"] ?? "T. Maxwell Smith"}
      />

      {/* ============================== HERO ============================== */}
      <section className="relative min-h-[68vh] flex items-end text-[var(--c-dark-ink)]">
        <HeroBanner items={bannerMedia} />
        <div className="container-page relative z-10 pb-16 pt-32 lg:pb-20">
          <p className="eyebrow text-[var(--c-dark-accent)] fade-up">
            {home["home.hero.eyebrow"]}
          </p>
          <h1 className="display-2 mt-5 max-w-4xl text-[var(--c-dark-ink)] fade-up">
            {home["home.hero.headline"]}
          </h1>
          <p className="lead mt-6 max-w-2xl text-[var(--c-dark-ink-muted)] fade-up">
            {home["home.hero.support"]}
          </p>
          <div className="mt-9 flex flex-wrap gap-4 fade-up">
            <Link href={home["home.hero.ctaHref"] || "/consultation"} className="btn btn-accent">
              {home["home.hero.ctaLabel"]}
              <ArrowRight size={18} />
            </Link>
            <Link href={home["home.hero.cta2Href"] || "/results"} className="btn btn-ghost-dark">
              {home["home.hero.cta2Label"]}
            </Link>
          </div>
        </div>
      </section>

      {/* ============================ BADGE BAR ========================== */}
      <BadgeBar badges={badges} />

      {/* ========================== FIRM STRIP =========================== */}
      <section className="container-page pt-20 lg:pt-28 pb-12 lg:pb-16">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow">{home["home.firm.eyebrow"]}</p>
            <h2 className="h2 mt-4">{home["home.firm.heading"]}</h2>
          </div>
          <div
            className="prose-firm text-[var(--c-ink-muted)]"
            dangerouslySetInnerHTML={{ __html: home["home.firm.body"] ?? "" }}
          />
        </div>
      </section>

      {/* =========================== TEAM TEASER ========================= */}
      {lead && (
        <section className="bg-[var(--c-surface2)] pt-12 lg:pt-16 pb-20 lg:pb-28">
          <div className="container-page grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:items-center">
            <div>
              <p className="eyebrow">Our Team</p>
              <h2 className="h2 mt-3">Led by a trial lawyer who tries cases.</h2>
              <p className="lead mt-4">
                {lead.name} founded the firm and leads its litigation. A Texas team across Bosque
                County, Fort Worth, and Weatherford keeps every matter moving.
              </p>
              <Link
                href="/about"
                className="mt-6 inline-flex items-center gap-1.5 link-underline font-[family-name:var(--font-ui)]"
              >
                Meet the team <ArrowRight size={16} />
              </Link>
            </div>
            <TeamTeaser
              members={team.slice(0, 4).map((m) => ({
                slug: m.slug,
                name: m.name,
                role: m.role,
                photo: m.photo,
                shortBio: shortSummary(m.bioProfessional),
              }))}
            />
          </div>
        </section>
      )}

      {/* ========================= RESULTS BAND ========================== */}
      <section className="bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] py-20 lg:py-28">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow text-[var(--c-dark-accent)]">{home["home.results.eyebrow"]}</p>
              <h2 className="h2 mt-4 text-[var(--c-dark-ink)] max-w-2xl">
                {home["home.results.heading"]}
              </h2>
            </div>
            <Link
              href="/results"
              className="btn btn-ghost-dark text-sm py-2.5 px-4 self-start sm:self-auto"
            >
              {home["home.results.ctaLabel"]} <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mt-12 grid gap-px bg-[var(--c-dark-border)] sm:grid-cols-2 lg:grid-cols-3 border border-[var(--c-dark-border)]">
            {results.map((r, i) => {
              const practiceTitle = practices.find((p) => p.slug === r.practiceSlug)?.title;
              return (
                <div key={i} className="bg-[var(--c-dark-bg)] p-8 lg:p-10 flex flex-col">
                  {/* Practice type — small */}
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-dark-accent)] font-[family-name:var(--font-ui)]">
                    {practiceTitle ?? "Result"}
                  </p>
                  {/* Value / tagline — larger */}
                  {r.stat && (
                    <div className="mt-3 font-[family-name:var(--font-display)] text-3xl lg:text-4xl text-[var(--c-dark-ink)] leading-none">
                      {r.stat}
                    </div>
                  )}
                  <p className="mt-3 text-[var(--c-dark-ink)] font-[family-name:var(--font-ui)] font-medium leading-snug">
                    {r.statLabel ?? r.title}
                  </p>
                  {/* Description */}
                  {r.summary && (
                    <p className="mt-3 text-sm text-[var(--c-dark-ink-muted)] leading-relaxed line-clamp-4">
                      {r.summary}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs text-[var(--c-dark-ink-muted)] max-w-2xl">
            Past results do not guarantee a similar outcome. Each case depends on its own facts.
          </p>
        </div>
      </section>

      {/* ======================= PRACTICE AREAS ========================== */}
      <section className="container-page py-20 lg:py-28">
        <div className="max-w-2xl">
          <p className="eyebrow">{home["home.practice.eyebrow"]}</p>
          <h2 className="h2 mt-4">{home["home.practice.heading"]}</h2>
          <p className="lead mt-4">{home["home.practice.body"]}</p>
        </div>

        <div className="mt-14 space-y-14">
          {PRACTICE_GROUPS.map((group) => {
            const inGroup = practices.filter((p) => p.group === group.id);
            return (
              <div key={group.id}>
                <div className="flex items-baseline gap-4 border-b border-[var(--c-border)] pb-3">
                  <h3 className="font-[family-name:var(--font-ui)] text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">
                    {group.label}
                  </h3>
                  <span className="text-xs text-[var(--c-ink-muted)] hidden sm:inline">
                    {group.blurb}
                  </span>
                </div>
                <div className="mt-6 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {inGroup.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/practice-areas/${p.slug}`}
                      className="group flex items-center justify-between gap-4 py-4 border-b border-[var(--c-border)] hover:border-[var(--c-accent)] transition-colors"
                    >
                      <span className="font-[family-name:var(--font-display)] text-lg leading-tight group-hover:text-[var(--c-accent)] transition-colors">
                        {p.title}
                      </span>
                      <ArrowRight
                        size={18}
                        className="text-[var(--c-ink-muted)] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================= QUOTE BAND ============================ */}
      {home["home.quote.image"] ? (
        <section className="relative py-28 lg:py-36 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media(home["home.quote.image"])} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[var(--c-dark-bg)]/72" />
          <div className="container-prose text-center relative z-10">
            <blockquote className="font-[family-name:var(--font-display)] text-2xl lg:text-4xl leading-tight text-[var(--c-dark-ink)]">
              “{home["home.quote.text"]}”
            </blockquote>
            <p className="mt-6 eyebrow text-[var(--c-dark-accent)]">{home["home.quote.attribution"]}</p>
          </div>
        </section>
      ) : (
        <section className="bg-[var(--c-surface2)] py-20 lg:py-28">
          <div className="container-prose text-center">
            <blockquote className="font-[family-name:var(--font-display)] text-2xl lg:text-4xl leading-tight text-[var(--c-ink)]">
              “{home["home.quote.text"]}”
            </blockquote>
            <p className="mt-6 eyebrow eyebrow-muted">{home["home.quote.attribution"]}</p>
          </div>
        </section>
      )}

      {/* ======================== TESTIMONIALS =========================== */}
      {testimonials.length > 0 && (
        <section className="container-page py-20 lg:py-28">
          <p className="eyebrow">In their words</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="h2">5-star reviews from Google</h2>
            <span className="text-[var(--c-accent)] text-lg tracking-wide" aria-hidden>★★★★★</span>
          </div>
          <p className="mt-3 text-sm text-[var(--c-ink-muted)] max-w-2xl">
            Verified 5-star reviews published by clients on Google.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.slice(0, 6).map((t) => (
              <figure key={t.id} className="border-l-2 border-[var(--c-accent)] pl-6">
                <span className="text-[var(--c-accent)] text-sm tracking-wide" aria-label="5 out of 5 stars">★★★★★</span>
                <blockquote className="mt-2 font-[family-name:var(--font-display)] text-lg leading-snug">
                  “{t.quote}”
                </blockquote>
                {(t.attribution || t.context) && (
                  <figcaption className="mt-3 text-sm text-[var(--c-ink-muted)]">
                    {t.attribution}
                    {t.context ? ` — ${t.context}` : ""}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
          <p className="mt-10 text-xs text-[var(--c-ink-muted)] max-w-3xl leading-relaxed border-t border-[var(--c-border)] pt-6">
            Reviews are reproduced from Google and reflect the individual experience of each
            reviewer. They are not a guarantee, warranty, or prediction regarding the outcome of
            your legal matter — every case is different and depends on its own facts. These
            testimonials are not a paid endorsement. This website may be considered attorney
            advertising.
          </p>
        </section>
      )}

      {/* ======================= COUNTIES BAND =========================== */}
      <section className="container-page py-20 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow">{home["home.counties.eyebrow"]}</p>
            <h2 className="h2 mt-4">{home["home.counties.heading"]}</h2>
            <p className="lead mt-4">{home["home.counties.body"]}</p>
          </div>
          <div>
            <h4 className="eyebrow eyebrow-muted mb-4">Counties</h4>
            <div className="flex flex-wrap gap-2">
              {LITIGATION_COUNTIES.map((c) => (
                <span
                  key={c}
                  className="px-3.5 py-1.5 text-sm border border-[var(--c-border)] rounded-full font-[family-name:var(--font-ui)]"
                >
                  {c}
                </span>
              ))}
            </div>
            <h4 className="eyebrow eyebrow-muted mt-8 mb-4">Federal Courts</h4>
            <ul className="space-y-2">
              {FEDERAL_COURTS.map((c) => (
                <li key={c} className="text-[var(--c-ink-muted)]">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ========================= OFFICES BAND ========================== */}
      <section className="bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] py-20 lg:py-28">
        <div className="container-page">
          <p className="eyebrow text-[var(--c-dark-accent)]">{home["home.offices.eyebrow"]}</p>
          <h2 className="h2 mt-4 text-[var(--c-dark-ink)]">{home["home.offices.heading"]}</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {OFFICES.map((o) => (
              <div
                key={o.id}
                className="border border-[var(--c-dark-border)] p-8 flex flex-col"
              >
                <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-dark-accent)] font-[family-name:var(--font-ui)]">
                  {o.role}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-2xl mt-2 text-[var(--c-dark-ink)]">
                  {o.name}
                </h3>
                <address className="not-italic mt-4 text-sm text-[var(--c-dark-ink-muted)] leading-relaxed flex-1">
                  {o.street}
                  <br />
                  {o.city}, {o.state} {o.zip}
                  {o.mailing ? (
                    <span className="block mt-2">
                      {o.mailing.line} (mailing address)
                      <br />
                      {o.mailing.city}, {o.mailing.state} {o.mailing.zip}
                    </span>
                  ) : null}
                </address>
                <a
                  href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}
                  className="mt-4 text-[var(--c-dark-ink)] hover:text-[var(--c-dark-accent)] transition-colors font-[family-name:var(--font-ui)]"
                >
                  {o.phone}
                </a>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Link href="/consultation" className="btn btn-accent">
              Request a Consultation <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
