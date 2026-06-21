import type { Metadata } from "next";
import Link from "next/link";
import { Radio, Tv, ImageIcon, Lock } from "lucide-react";
import { PatriotHeader } from "./PatriotHeader";
import styles from "./patriot.module.css";
import { BroadcastStage } from "./BroadcastStage";
import { PATRIOT_OVERLAY_FONTS_LINK } from "./PatriotOverlay";
import { getSetting } from "@/lib/content";
import { PATRIOT_BRANDING_KEY, PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotBranding, type PatriotTeam } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {});
  return {
    title: "Patriot Series 250 — Wiffle Ball Tournament · Live Feed",
    description: "Live feed for the Patriot Series 250 Wiffle Ball Tournament.",
    robots: { index: false, follow: false },
    ...(b.favicon ? { icons: { icon: b.favicon } } : {}),
    ...(b.socialShare
      ? { openGraph: { images: [b.socialShare] }, twitter: { card: "summary_large_image", images: [b.socialShare] } }
      : {}),
  };
}

export default async function PatriotSeries250Page() {
  const wsUrl = process.env.PATRIOT_WS_URL ?? "";
  const [branding, savedTeams] = await Promise.all([
    getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {}),
    getSetting<PatriotTeam[]>(PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS),
  ]);
  const teams = savedTeams.length > 0 ? savedTeams : DEFAULT_PATRIOT_TEAMS;
  const ticker = [...teams, ...teams]; // duplicate for a seamless marquee loop

  return (
    <div className={styles.page}>
      {/* Broadcast overlay fonts (Bebas Neue + Roboto Condensed/Mono) */}
      <link rel="stylesheet" href={PATRIOT_OVERLAY_FONTS_LINK} />
      {/* Top bar */}
      <PatriotHeader active="/" />

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {/* Title */}
        <section className="pt-10 text-center sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[color:var(--psx-accent)]">Patriot Series 250</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-5xl">
            Wiffle Ball Tournament
          </h1>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.3em] text-[color:var(--psx-muted)]">
            <Radio size={15} className="text-[color:var(--psx-live)]" /> Live Feed
          </p>
        </section>

        {/* Centered logo slot */}
        <section className="mt-10 flex justify-center">
          {branding.tournamentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.tournamentLogo} alt="Patriot Series 250" className={`h-[220px] w-auto max-w-full object-contain ${styles.logo}`} />
          ) : (
            <div className="flex h-[220px] w-full max-w-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--psx-border)] bg-[var(--psx-surface)] text-center text-[color:var(--psx-muted)]">
              <ImageIcon size={34} strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium text-[color:var(--psx-muted)]">Tournament logo</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--psx-faint)]">Upload your tournament logo in the admin panel.</p>
            </div>
          )}
        </section>

        {/* Live video feed */}
        <section className="mt-12">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[color:var(--psx-muted)]">
            <Tv size={16} className="text-[color:var(--psx-accent)]" /> Live Video Feed
          </div>
          <BroadcastStage wsUrl={wsUrl} />
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

        {/* Operator entry point */}
        <footer className="mt-16 border-t border-[color:var(--psx-border)] pt-6 text-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--psx-muted)] transition-colors hover:text-[color:var(--psx-fg)]"
          >
            <Lock size={12} /> Switchboard operator login
          </Link>
        </footer>
      </main>
    </div>
  );
}
