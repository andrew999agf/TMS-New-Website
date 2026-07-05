import type { ReactNode } from "react";
import { PatriotHeader } from "./PatriotHeader";
import { PatriotBanner } from "./PatriotBanner";
import { getSetting } from "@/lib/content";
import { PATRIOT_BANNERS_KEY } from "@/lib/patriot/settings";
import styles from "./patriot.module.css";

/**
 * Page shell for the public Patriot content pages: header nav, a Ken Burns hero
 * banner with the page title overlaid, the content column, and a footer.
 *
 * `bannerImages` overrides the site-wide banner set (e.g. a news article's own
 * photo). Passing an EMPTY array skips the tall hero entirely and renders a
 * slim title header instead — for pages that shouldn't run the general banner.
 */
export async function PatriotShell({
  active,
  eyebrow = "Patriot Series",
  title,
  subtitle,
  bannerImages,
  children,
}: {
  active?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  bannerImages?: string[];
  children: ReactNode;
}) {
  const banners = bannerImages ?? (await getSetting<string[]>(PATRIOT_BANNERS_KEY, []));
  const slimHeader = bannerImages !== undefined && bannerImages.filter(Boolean).length === 0;
  return (
    <div className={`${styles.page} flex min-h-screen flex-col`}>
      <PatriotHeader active={active} />
      {slimHeader ? (
        <section className="border-b border-[color:var(--psx-border)]">
          <div className="mx-auto w-full max-w-6xl px-5 pb-8 pt-10">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[color:var(--psx-faint)] sm:text-xs">{eyebrow}</p>}
            <h1 className="mt-1.5 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[color:var(--psx-fg)] sm:text-5xl">{title}</h1>
            {subtitle && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[color:var(--psx-muted)] sm:text-base">{subtitle}</p>}
          </div>
        </section>
      ) : (
        <PatriotBanner images={banners ?? []} eyebrow={eyebrow} title={title} subtitle={subtitle} />
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">{children}</main>
      <footer className="border-t border-[color:var(--psx-border)] px-5 py-8 text-center text-[11px] tracking-wide text-[color:var(--psx-faint)]">
        Patriot Series · Wiffle Ball · Granbury, Texas · Since 2007
      </footer>
    </div>
  );
}
