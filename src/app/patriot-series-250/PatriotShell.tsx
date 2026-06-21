import type { ReactNode } from "react";
import { PatriotHeader } from "./PatriotHeader";
import { PatriotBanner } from "./PatriotBanner";
import { getSetting } from "@/lib/content";
import { PATRIOT_BANNERS_KEY } from "@/lib/patriot/settings";
import styles from "./patriot.module.css";

/**
 * Page shell for the public Patriot content pages: header nav, a Ken Burns hero
 * banner with the page title overlaid, the content column, and a footer.
 */
export async function PatriotShell({
  active,
  eyebrow = "Patriot Series",
  title,
  subtitle,
  children,
}: {
  active?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const banners = await getSetting<string[]>(PATRIOT_BANNERS_KEY, []);
  return (
    <div className={`${styles.page} flex min-h-screen flex-col`}>
      <PatriotHeader active={active} />
      <PatriotBanner images={banners ?? []} eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">{children}</main>
      <footer className="border-t border-[color:var(--psx-border)] px-5 py-8 text-center text-[11px] tracking-wide text-[color:var(--psx-faint)]">
        Patriot Series · Wiffle Ball · Granbury, Texas · Since 2007
      </footer>
    </div>
  );
}
