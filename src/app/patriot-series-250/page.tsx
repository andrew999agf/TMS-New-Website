import type { Metadata } from "next";
import Link from "next/link";
import { Radio, Tv, ImageIcon, ArrowLeft, Lock } from "lucide-react";
import styles from "./patriot.module.css";

export const metadata: Metadata = {
  title: "Patriot Series 250 — Whiffle Ball Tournament · Live Feed",
  description: "Live feed for the Patriot Series 250 Whiffle Ball Tournament.",
  robots: { index: false, follow: false },
};

/**
 * Patriot Series 250 — Whiffle Ball Tournament · Live Feed (placeholder).
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
const STREAM_EMBED_URL = "";

const SPONSOR_SLOTS = Array.from({ length: 8 }, (_, i) => i + 1);

export default function PatriotSeries250Page() {
  return (
    <div className={styles.page}>
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0e1a]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/about" className="flex items-center gap-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white">
            <ArrowLeft size={14} /> Back
          </Link>
          <span className="text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60 sm:text-xs">
            Patriot Series 250 · Whiffle Ball
          </span>
          <div className="flex items-center gap-2.5">
            <Link
              href="/patriot-series-250/control"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-white/55 transition-colors hover:border-white/35 hover:text-white"
            >
              <Lock size={12} /> <span className="hidden sm:inline">Operator</span>
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-300">
              <span className={`h-2 w-2 rounded-full bg-red-500 ${styles.liveDot}`} /> Live
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {/* Title */}
        <section className="pt-10 text-center sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-300/80">Patriot Series 250</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-5xl">
            Whiffle Ball Tournament
          </h1>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.3em] text-white/50">
            <Radio size={15} className="text-red-400" /> Live Feed
          </p>
        </section>

        {/* Centered logo slot */}
        <section className="mt-10 flex justify-center">
          <div className="flex h-[220px] w-full max-w-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] text-center text-white/40">
            <ImageIcon size={34} strokeWidth={1.5} />
            <p className="mt-2 text-sm font-medium text-white/60">Tournament logo</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/35">
              Transparent PNG or SVG · square works best
              <br />
              displays up to 420×220 — export at 2× (≈840×440)
            </p>
          </div>
        </section>

        {/* Live video feed */}
        <section className="mt-12">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/70">
            <Tv size={16} className="text-blue-300" /> Live Video Feed
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/12 bg-black shadow-2xl">
            {STREAM_EMBED_URL ? (
              <iframe
                src={STREAM_EMBED_URL}
                title="Patriot Series 250 live feed"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/5">
                  <Tv size={28} className="text-white/40" />
                </div>
                <p className="mt-4 text-sm font-medium text-white/60">Video feed will appear here</p>
                <p className="mt-1 max-w-sm px-6 text-[11px] leading-relaxed text-white/35">
                  16:9 · source 1920×1080 (or 1280×720). The switcher connects via WebRTC
                  (WHIP/WHEP) for low latency, or RTMP→HLS for large audiences.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Sponsor ticker */}
        <section className="mt-14">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-white/40">
            Our Sponsors
          </p>
          <div className={`${styles.marquee} rounded-2xl border border-white/10 bg-white/[0.03] py-6`}>
            <div className={styles.track}>
              {/* Two identical sets for a seamless loop */}
              {[0, 1].map((set) => (
                <div key={set} className="flex items-center gap-14" aria-hidden={set === 1}>
                  {SPONSOR_SLOTS.map((n) => (
                    <div
                      key={`${set}-${n}`}
                      className="flex h-14 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.04] text-[11px] font-medium text-white/35"
                    >
                      Sponsor {n}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/30">
            Sponsor logos: transparent PNG · ~56px tall (any width). They scroll slowly and pause on hover.
          </p>
        </section>

        {/* Operator entry point */}
        <footer className="mt-16 border-t border-white/10 pt-6 text-center">
          <Link
            href="/patriot-series-250/control"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/80"
          >
            <Lock size={12} /> Switchboard operator login
          </Link>
        </footer>
      </main>
    </div>
  );
}
