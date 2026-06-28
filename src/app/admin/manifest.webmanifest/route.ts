import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";
import { getBlocks } from "@/lib/content";

/**
 * PWA manifest for the admin app — served from /admin/manifest.webmanifest and
 * linked ONLY from the admin panel layout (not the special root app/manifest.ts
 * convention, which Next injects on every page). That keeps the browser's
 * "Install app" prompt off the public site: it only appears inside /admin.
 *
 * The installed icon reuses the admin-panel favicon (global.adminFavicon),
 * falling back to the site favicon (global.favicon); bundled icons stay as a
 * fallback so the app is installable even if the favicon can't be fetched.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let favicon = "";
  try {
    const blocks = await getBlocks("global");
    favicon = (blocks["global.adminFavicon"] || blocks["global.favicon"] || "").trim();
  } catch {
    /* fall back to bundled icons */
  }

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

  const manifest: MetadataRoute.Manifest = {
    name: "T. Maxwell Smith — Time Tracker",
    short_name: "TMS Time",
    description: "Time tracking for the office of T. Maxwell Smith, PLLC.",
    start_url: "/admin/time-tracker-4",
    scope: "/admin/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14110F",
    theme_color: "#14110F",
    icons,
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
