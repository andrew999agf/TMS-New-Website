import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { getActiveTheme, getBlocks } from "@/lib/content";
import { themeToCss } from "@/lib/theme/css";
import { FIRM } from "@/lib/firm";

export async function generateMetadata(): Promise<Metadata> {
  const blocks = await getBlocks("global");
  const name = blocks["global.firmName"] ?? FIRM.name;
  const tagline = blocks["global.tagline"] ?? "Generally trained for your specific legal matter.";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const socialImage = blocks["global.socialImage"] || "";
  // Favicon: the admin-managed upload when present, otherwise the bundled firm
  // icon (the same graphic the PWA manifest uses). Always emit ONE concrete icon
  // so the public site and the admin portal show the identical favicon.
  const favicon = blocks["global.favicon"] || "/icon-512.png";
  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: `${name} — ${tagline}`,
      template: `%s | ${name}`,
    },
    description:
      "A Texas trial firm. Hundreds of matters — jury trials, bench trials, and appeals. Preparing for trial from day one.",
    icons: { icon: [{ url: favicon }], shortcut: [{ url: favicon }], apple: [{ url: favicon }] },
    openGraph: {
      type: "website",
      siteName: name,
      title: `${name} — ${tagline}`,
      locale: "en_US",
      ...(socialImage ? { images: [{ url: socialImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(socialImage ? { images: [socialImage] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = await getActiveTheme();
  const css = themeToCss(theme);

  return (
    <html lang="en" className={`${fontVariables} h-full`} suppressHydrationWarning>
      <head>
        {/* Active theme rendered as CSS variables before first paint — no flash. */}
        <style id="tms-theme" dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
