import type { MetadataRoute } from "next";

/**
 * PWA manifest. Scoped to /admin so "install" makes the admin/Time Tracker into
 * a home-screen app; the public marketing site is unaffected (it has no service
 * worker and isn't in this scope). Inert metadata — linked site-wide but only
 * actionable inside /admin.
 */
export default function manifest(): MetadataRoute.Manifest {
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
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
