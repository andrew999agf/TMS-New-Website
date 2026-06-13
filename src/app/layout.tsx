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
  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: `${name} — ${tagline}`,
      template: `%s | ${name}`,
    },
    description:
      "A Texas trial firm. Over a thousand matters — jury trials, bench trials, and appeals. Prepared for trial from day one.",
    openGraph: {
      type: "website",
      siteName: name,
      title: `${name} — ${tagline}`,
      locale: "en_US",
    },
    twitter: { card: "summary_large_image" },
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
