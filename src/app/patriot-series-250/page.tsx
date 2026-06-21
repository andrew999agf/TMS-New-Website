import type { Metadata } from "next";
import Link from "next/link";
import { Radio, Tv, ImageIcon, Lock } from "lucide-react";
import { PatriotHeader } from "./PatriotHeader";
import styles from "./patriot.module.css";
import { BroadcastStage } from "./BroadcastStage";
import { PATRIOT_OVERLAY_FONTS_LINK } from "./PatriotOverlay";
import { getSetting } from "@/lib/content";
import { PATRIOT_BRANDING_KEY, type PatriotBranding } from "@/lib/patriot/settings";

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

/**
 * Patriot Series 250 — Wiffle Ball Tournament · Live Feed (placeholder).
 *
 * Standalone page (intentionally outside the (public) group, so it does NOT
 * inherit the firm's nav/footer). Pure placeholder for now.
 *
 * --- Wiring the live video feed later -------------------------------------
 * Your desktop switcher app (iPhone cameras + view switchboard) gets onto this
 * page through ONE ingest → playback hop. Recommended options:
 *
 *  1) WebRTC (lowest latency, ~0.3–1s) — best for an interactive broadcast.
 *     App PUBLISHES via WHIP to an SFU (Cloudflare Realtime / LiveKit /
 *     mediasoup); the browser PLAYS via WHEP. Drop a <video> + the WHEP client
 *     into STREAM below.
 *  2) RTMP/SRT → HLS (scales to large crowds, ~3–10s latency) — app pushes RTMP
 *     to Cloudflare Stream / Mux / YouTube Live; embed the HLS URL with hls.js
 *     or the service's <iframe> player.
 *
 * To go live, set STREAM_EMBED_URL to the player/embed URL (or swap in the
 * WHEP <video>). Empty = show the placeholder.
 */
const TEAM_SLOTS = Array.from({ length: 8 }, (_, i) => i + 1);

export default async function PatriotSeries250Page() {
  const wsUrl = process.env.PATRIOT_WS_URL ?? "";
  const branding = await getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {});
  return (
    <div className={styles.page}>
      {/* Broadcast overlay fonts (Bebas Neue + Roboto Condensed/Mono) */}
      <link rel="stylesheet" href={PATRIOT_OVERLAY_FONTS_LINK} />
      {/* Top bar */}
      <PatriotHeader active="/" />

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {/* Title */}
        <section className="pt-10 text-center sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series 250</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-5xl">
            Wiffle Ball Tournament
          </h1>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.3em] text-white/50">
            <Radio size={15} className="text-red-400" /> Live Feed
          </p>
        </section>

        {/* Centered logo slot */}
        <section className="mt-10 flex justify-center">
          {branding.tournamentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.tournamentLogo} alt="Patriot Series 250" className="h-[220px] w-auto max-w-full object-contain" />
          ) : (
            <div className="flex h-[220px] w-full max-w-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] text-center text-white/60">
              <ImageIcon size={34} strokeWidth={1.5} />
              <p className="mt-2 text-sm font-medium text-white/70">Tournament logo</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/60">Upload your tournament logo in the admin panel.</p>
            </div>
          )}
        </section>

        {/* Live video feed */}
        <section className="mt-12">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/70">
            <Tv size={16} className="text-blue-300" /> Live Video Feed
          </div>
          <BroadcastStage wsUrl={wsUrl} />
        </section>

        {/* Tournament Teams ticker */}
        <section className="mt-14">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
            Tournament Teams
          </p>
          <div className={`${styles.marquee} rounded-2xl border border-white/10 bg-white/[0.03] py-6`}>
            <div className={styles.track}>
              {/* Two identical sets for a seamless loop */}
              {[0, 1].map((set) => (
                <div key={set} className="flex items-center gap-14" aria-hidden={set === 1}>
                  {TEAM_SLOTS.map((n) => (
                    <div
                      key={`${set}-${n}`}
                      className="flex h-14 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.04] text-[11px] font-medium text-white/60"
                    >
                      Team {n}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/60">
            Team logos: transparent PNG · ~56px tall (any width). They scroll slowly and pause on hover.
          </p>
        </section>

        {/* Operator entry point */}
        <footer className="mt-16 border-t border-white/10 pt-6 text-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white/80"
          >
            <Lock size={12} /> Switchboard operator login
          </Link>
        </footer>
      </main>
    </div>
  );
}
