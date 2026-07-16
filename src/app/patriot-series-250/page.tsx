import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon, Trophy, Newspaper } from "lucide-react";
import { PatriotHeader } from "./PatriotHeader";
import styles from "./patriot.module.css";
import { getSetting } from "@/lib/content";
import { PATRIOT_BRANDING_KEY, PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotBranding, type PatriotTeam } from "@/lib/patriot/settings";
import { patriotPublicPath } from "@/lib/patriot/hosts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {});
  return {
    title: "Patriot Series 250 — Wiffle Ball Tournament",
    description: "The Patriot Series Wiffle Ball Tournament — champions, news, teams, and the record book.",
    robots: { index: false, follow: false },
    ...(b.favicon ? { icons: { icon: b.favicon } } : {}),
    ...(b.socialShare
      ? { openGraph: { images: [b.socialShare] }, twitter: { card: "summary_large_image", images: [b.socialShare] } }
      : {}),
  };
}

export default async function PatriotSeries250Page() {
  const [branding, savedTeams] = await Promise.all([
    getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {}),
    getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS),
  ]);
  const teams = savedTeams.length > 0 ? savedTeams : DEFAULT_PATRIOT_TEAMS;
  const ticker = [...teams, ...teams]; // duplicate for a seamless marquee loop
  const [newsHref, bracketHref] = await Promise.all([
    patriotPublicPath("/news/2026-minutemen-repeat-champions"),
    patriotPublicPath("/past-tournaments"),
  ]);

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <PatriotHeader active="/" />

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {/* Logo + live indicator */}
        <section className="flex flex-col items-center pt-4">
          {branding.tournamentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.tournamentLogo} alt="Patriot Series 250" className={`h-[440px] w-auto max-w-full object-contain ${styles.logo}`} />
          ) : (
            <div className="flex h-[220px] w-full max-w-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--psx-border)] bg-[var(--psx-surface)] text-center text-[color:var(--psx-muted)]">
              <ImageIcon size={34} strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium text-[color:var(--psx-muted)]">Tournament logo</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--psx-faint)]">Upload your tournament logo in the admin panel.</p>
            </div>
          )}
        </section>

        {/* 2026 champions callout (the broadcast returns on game day) */}
        <section className="mt-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-400/[0.06] px-6 py-8 text-center sm:flex-row sm:text-left">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-yellow-400/30 bg-yellow-400/10 text-yellow-500">
              <Trophy size={26} strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[color:var(--psx-accent)]">19th Annual · USA 250</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-[color:var(--psx-fg)]">2026 Champions: The Minutemen</p>
              <p className="mt-1 text-sm text-[color:var(--psx-muted)]">Back-to-back titles, sealed 4–1 in the if-necessary game.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link href={newsHref} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-4 py-2 text-xs font-semibold text-white hover:brightness-110">
                <Newspaper size={13} /> Read the story
              </Link>
              <Link href={bracketHref} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--psx-border)] px-4 py-2 text-xs font-semibold text-[color:var(--psx-fg)] hover:border-[color:var(--psx-accent)]">
                <Trophy size={13} /> Full bracket
              </Link>
            </div>
          </div>
        </section>

        {/* Tournament Teams ticker */}
        <section className="mt-14">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-[color:var(--psx-muted)]">
            Tournament Teams
          </p>
          <div className={`${styles.marquee} rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] py-6`}>
            <div className={styles.track}>
              {ticker.map((t, i) => (
                <div
                  key={`${t.id}-${i}`}
                  aria-hidden={i >= teams.length}
                  className="flex shrink-0 items-center justify-center"
                >
                  {t.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo} alt={t.name} className={`h-24 w-auto max-w-[11rem] object-contain ${styles.logo}`} />
                  ) : (
                    <span className="text-base font-semibold uppercase tracking-wide text-[color:var(--psx-muted)]">{t.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-[color:var(--psx-faint)]">
            The {teams.length} clubs of the Patriot Series. Upload team logos in the admin panel.
          </p>
        </section>

      </main>
    </div>
  );
}
