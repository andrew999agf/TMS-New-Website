import type { Metadata } from "next";

/**
 * Social-share card for the AI.fred page. /admin/assistant sits behind the
 * login, so link scrapers (iMessage, Slack, Facebook, X…) can never read its
 * tags — the middleware quietly REWRITES known preview bots to this public
 * stub instead, so pasting the AI.fred link unfurls the branded card while
 * humans still hit the login exactly as before. Every other page's share
 * card is untouched. No index, no data: pure branding.
 */

export const metadata: Metadata = {
  title: { absolute: "AI.fred — AI Administrative Assistant" },
  description:
    "The private in-house AI of T. Maxwell Smith, PLLC — drafting, research, case lookups, and discovery review. At your service.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "T. Maxwell Smith, PLLC",
    title: "AI.fred — AI Administrative Assistant",
    description:
      "The private in-house AI of T. Maxwell Smith, PLLC — drafting, research, case lookups, and discovery review. At your service.",
    url: "https://www.texaslawsmith.com/admin/assistant",
    locale: "en_US",
    images: [{ url: "/aifred-og.png", width: 1200, height: 630, type: "image/png", alt: "AI.fred — AI administrative assistant" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI.fred — AI Administrative Assistant",
    description:
      "The private in-house AI of T. Maxwell Smith, PLLC — drafting, research, case lookups, and discovery review. At your service.",
    images: ["/aifred-og.png"],
  },
};

export default function AifredPreviewPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.25rem", background: "#070a12", color: "#ece7db", padding: "2rem", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/aifred-logo.webp" alt="AI.fred — AI administrative assistant" style={{ maxWidth: "min(560px, 90vw)", height: "auto" }} draggable={false} />
      <p style={{ maxWidth: "36rem", fontSize: "0.95rem", lineHeight: 1.6, color: "#a29a89" }}>
        AI.fred is the private in-house AI of T. Maxwell Smith, PLLC. Firm members can sign in to put it to work.
      </p>
      <a href="/admin/login?next=%2Fadmin%2Fassistant" style={{ color: "#d6ae52", fontSize: "0.9rem", textDecoration: "underline", textUnderlineOffset: 4 }}>
        Sign in
      </a>
    </main>
  );
}
