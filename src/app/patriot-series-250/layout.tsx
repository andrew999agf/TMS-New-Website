import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { PATRIOT_BRANDING_KEY, type PatriotBranding } from "@/lib/patriot/settings";

/**
 * Pass-through layout for the whole Patriot Series section. Its only job is to
 * apply the uploaded favicon to every Patriot page (watch, teams, admin, …) so
 * the browser-tab icon is the tournament's, not the firm's.
 */
export async function generateMetadata(): Promise<Metadata> {
  const b = await getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {});
  return b.favicon ? { icons: { icon: b.favicon } } : {};
}

export default function PatriotSeriesLayout({ children }: { children: ReactNode }) {
  return children;
}
