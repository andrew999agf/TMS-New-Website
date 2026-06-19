"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { Download, Share, X, MoreVertical } from "lucide-react";
import { detectPlatform } from "@/lib/platform";

/**
 * Registers the admin-scoped service worker and offers an "Install app" path
 * that always works, on every platform:
 *  - Chrome/Edge (Android + desktop): a one-tap "Install app" button when the
 *    browser's install event is available, otherwise the menu instructions
 *    (since that event is unreliable on Android / never fires if already
 *    installed).
 *  - iPhone/iPad (Safari): the Share ▸ Add to Home Screen hint.
 * Renders nothing once installed.
 */
export function PwaInstall() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [os, setOs] = useState<string>("other");
  const [browser, setBrowser] = useState<string>("other");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/admin/" }).catch(() => {});
    }
    const p = detectPlatform();
    setOs(p.os); setBrowser(p.browser);

    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
  }

  if (installed || dismissed) return null;

  const card = "mx-3 mb-2 rounded-md border border-[var(--c-dark-border)] bg-[var(--c-dark-surface)] px-3 py-2 text-[11px] text-[var(--c-dark-ink-muted)] leading-relaxed relative";
  const close = (
    <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="absolute right-1.5 top-1.5 text-[var(--c-dark-ink-muted)]"><X size={12} /></button>
  );

  // One-tap install (Chrome/Edge, Android + desktop) when available.
  if (deferred) {
    return (
      <button
        onClick={install}
        className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-md border border-[var(--c-dark-accent)] bg-[var(--c-dark-surface)] px-3 py-2 text-xs font-semibold text-[var(--c-dark-ink)] hover:opacity-90"
      >
        <Download size={14} /> Install app
      </button>
    );
  }

  // iPhone / iPad — Safari only supports Add to Home Screen.
  if (os === "ios") {
    return (
      <div className={card}>
        {close}
        <span className="flex items-center gap-1 font-medium text-[var(--c-dark-ink)] mb-0.5"><Share size={12} /> Install on iPhone/iPad</span>
        {browser === "safari"
          ? <>Tap the <b>Share</b> button, then <b>“Add to Home Screen.”</b></>
          : <>Open this page in <b>Safari</b>, tap <b>Share</b>, then <b>“Add to Home Screen.”</b></>}
      </div>
    );
  }

  // Android — the install event is flaky; always show the menu path.
  if (os === "android") {
    return (
      <div className={card}>
        {close}
        <span className="flex items-center gap-1 font-medium text-[var(--c-dark-ink)] mb-0.5"><Download size={12} /> Install as an app</span>
        Tap the browser menu <MoreVertical size={11} className="inline align-text-bottom" /> and choose <b>“Install app”</b> (or <b>“Add to Home screen”</b>). If you don&apos;t see it, it may already be installed.
      </div>
    );
  }

  // Desktop without an install event yet — point to the address-bar install icon.
  return (
    <div className={card}>
      {close}
      <span className="flex items-center gap-1 font-medium text-[var(--c-dark-ink)] mb-0.5"><Download size={12} /> Install as an app</span>
      Click the install icon in the address bar (or the browser menu ▸ <b>Install</b>).
    </div>
  );
}
