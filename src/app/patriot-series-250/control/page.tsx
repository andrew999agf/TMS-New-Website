import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, ShieldAlert } from "lucide-react";
import styles from "../patriot.module.css";

export const metadata: Metadata = {
  title: "Switchboard Operator · Patriot Series 250",
  description: "Operator sign-in for the Patriot Series 250 broadcast control panel.",
  robots: { index: false, follow: false },
};

/**
 * Patriot Series 250 — operator login (placeholder).
 *
 * Entry point for the broadcast control backend we're building: the
 * login-gated, web-based switchboard that drives the live feed (camera takes,
 * preview/program, transitions) and places the video on /patriot-series-250.
 *
 * NOT wired yet — the form is a visual placeholder. Next step once the desktop
 * switcher's control contract is known: real auth + a WebSocket/API control
 * channel to the mixing engine + a protected /control panel UI.
 */
export default function OperatorLoginPage() {
  return (
    <div className={`${styles.page} flex min-h-screen flex-col`}>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/patriot-series-250" className="flex items-center gap-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white">
            <ArrowLeft size={14} /> Live feed
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
            Patriot Series 250
          </span>
          <span className="w-16" />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-7 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
              <Lock size={20} className="text-blue-300" />
            </div>
            <h1 className="mt-4 text-center font-[family-name:var(--font-display)] text-xl font-bold">
              Switchboard Operator
            </h1>
            <p className="mt-1 text-center text-xs text-white/45">
              Sign in to control the live broadcast.
            </p>

            {/* Placeholder form — not wired to a backend yet. */}
            <form className="mt-6 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/45">Email</label>
                <input
                  type="email"
                  disabled
                  placeholder="operator@example.com"
                  className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-blue-400/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/45">Password</label>
                <input
                  type="password"
                  disabled
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-blue-400/50"
                />
              </div>
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white opacity-60"
              >
                Sign in
              </button>
            </form>

            <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              Placeholder. The control backend (auth + switchboard) is being built — sign-in is not active yet.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
