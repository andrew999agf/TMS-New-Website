import type { ReactNode } from "react";
import { PatriotHeader } from "./PatriotHeader";
import styles from "./patriot.module.css";

/** Page shell for the public Patriot Series content pages: shared header nav,
 * centered content column, and a footer. */
export function PatriotShell({ active, children }: { active?: string; children: ReactNode }) {
  return (
    <div className={`${styles.page} flex min-h-screen flex-col`}>
      <PatriotHeader active={active} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">{children}</main>
      <footer className="border-t border-white/10 px-5 py-8 text-center text-[11px] tracking-wide text-white/45">
        Patriot Series 250 · Wiffle Ball Tournament
      </footer>
    </div>
  );
}
