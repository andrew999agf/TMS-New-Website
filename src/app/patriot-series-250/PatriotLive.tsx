"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "./patriot.module.css";

/**
 * Shared "is the broadcast actually live" state for the Patriot watch page.
 * BroadcastStage sets it true only when the PROGRAM video track is really
 * arriving (i.e. the operator has Channel A publish on). The header badge and
 * the under-logo tag read it, so "Live" never lights up unless it truly is.
 * Default is false (e.g. on pages without a provider).
 */
const LiveCtx = createContext<{ live: boolean; setLive: (b: boolean) => void }>({
  live: false,
  setLive: () => {},
});

export function PatriotLiveProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState(false);
  return <LiveCtx.Provider value={{ live, setLive }}>{children}</LiveCtx.Provider>;
}

export function useSetLive() {
  return useContext(LiveCtx).setLive;
}

function useLive() {
  return useContext(LiveCtx).live;
}

/** Header pill — red pulsing "LIVE" only when truly live, otherwise a quiet "Watch". */
export function PatriotLiveBadge() {
  const live = useLive();
  if (live) {
    return (
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[color:var(--psx-live)]"
      >
        <span className={`h-2 w-2 rounded-full bg-red-500 ${styles.liveDot}`} /> Live
      </Link>
    );
  }
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--psx-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-muted)] transition-colors hover:text-[color:var(--psx-fg)]"
    >
      <span className="h-2 w-2 rounded-full bg-[color:var(--psx-faint)]" /> Watch
    </Link>
  );
}

/** Under-logo indicator — "Live Feed" when live, "Offline" otherwise. */
export function LiveFeedTag() {
  const live = useLive();
  return (
    <p className={`mt-3 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.3em] ${live ? "text-[color:var(--psx-muted)]" : "text-[color:var(--psx-faint)]"}`}>
      {live ? (
        <span className={`h-2.5 w-2.5 rounded-full bg-red-500 ${styles.liveDot}`} />
      ) : (
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--psx-faint)]" />
      )}
      {live ? "Live Feed" : "Offline"}
    </p>
  );
}
