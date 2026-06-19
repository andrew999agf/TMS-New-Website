"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

/**
 * Registers the admin-scoped service worker and offers an "Install app" button
 * so the Time Tracker can be added to the home screen (fullscreen, app-like,
 * persistent mic permission). On iOS Safari (which has no install event) it
 * shows the Share ▸ Add to Home Screen hint instead. Renders nothing once
 * installed or when installation isn't available.
 */
export function PwaInstall() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      // Scoped to /admin/ — cannot touch the public site.
      navigator.serviceWorker.register("/sw.js", { scope: "/admin/" }).catch(() => {});
    }
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as any).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome|Android/.test(ua);
    if (isIOS && isSafari) setIosHint(true);

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

  if (iosHint) {
    return (
      <div className="mx-3 mb-2 rounded-md border border-[var(--c-dark-border)] bg-[var(--c-dark-surface)] px-3 py-2 text-[11px] text-[var(--c-dark-ink-muted)] leading-relaxed relative">
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="absolute right-1.5 top-1.5 text-[var(--c-dark-ink-muted)]"><X size={12} /></button>
        <span className="flex items-center gap-1 font-medium text-[var(--c-dark-ink)] mb-0.5"><Share size={12} /> Install on iPhone/iPad</span>
        Tap the Share button, then “Add to Home Screen.”
      </div>
    );
  }

  return null;
}
