import type { MetadataRoute } from "next";
import { getBlocks } from "@/lib/content";

/**
 * PWA manifest. The app icon reuses the website's favicon (admin-managed,
 * stored as global.favicon); bundled icons are kept as a fallback so the app
 * stays installable even if the favicon can't be fetched. Scoped to /admin so
 * "install" makes the admin/Time Tracker a home-screen app; the public site is
 * unaffected (no service worker, not in scope).
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let favicon = "";
  try {
    const blocks = await getBlocks("global");
    favicon = (blocks["global.favicon"] || "").trim();
  } catch { /* fall back to bundled icons */ }

  const type = /\.svg($|\?)/i.test(favicon)
    ? "image/svg+xml"
    : /\.(jpe?g)($|\?)/i.test(favicon)
    ? "image/jpeg"
    : "image/png";

  const fallback = [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" as const },
  ];

  const icons = favicon
    ? [
        { src: favicon, sizes: "any", type, purpose: "any" as const },
        { src: favicon, sizes: "192x192", type, purpose: "any" as const },
        { src: favicon, sizes: "512x512", type, purpose: "any" as const },
        { src: favicon, sizes: "512x512", type, purpose: "maskable" as const },
        ...fallback, // guarantees installability if the favicon can't load
      ]
    : fallback;

  return {
    name: "T. Maxwell Smith — Time Tracker",
    short_name: "TMS Time",
    description: "Time tracking for the office of T. Maxwell Smith, PLLC.",
    start_url: "/admin/time-tracker-2",
    scope: "/admin/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14110F",
    theme_color: "#14110F",
    icons,
  };
}
