"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

/** First-party page-view beacon — fires on every client navigation. */
export function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const body = JSON.stringify({ path: pathname, referrer: document.referrer });
    // Prefer sendBeacon so it survives navigation.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/pv", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/pv", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  }, [pathname]);

  return null;
}

/** GA4 — only rendered when a measurement ID is configured in admin Settings. */
export function GA4({ id }: { id: string }) {
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
