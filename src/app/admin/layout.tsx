import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getBlocks } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * Admin-area metadata. The admin & login screens use their OWN favicon
 * (global.adminFavicon) so they can be told apart from the public site at a
 * glance. If no admin favicon is uploaded it falls back to the site favicon,
 * then to the bundled firm icon. Scoped to /admin — the public site is
 * unaffected (its favicon comes from the root layout).
 */
export async function generateMetadata(): Promise<Metadata> {
  let icon = "/icon-512.png";
  try {
    const b = await getBlocks("global");
    icon = (b["global.adminFavicon"] || b["global.favicon"] || "/icon-512.png").trim() || "/icon-512.png";
  } catch {
    /* fall back to the bundled icon */
  }
  return { icons: { icon: [{ url: icon }], shortcut: [{ url: icon }], apple: [{ url: icon }] } };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
