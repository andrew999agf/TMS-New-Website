import type { CSSProperties, ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { getSetting } from "@/lib/content";
import { PATRIOT_BRANDING_KEY, type PatriotBranding } from "@/lib/patriot/settings";
import { PatriotAdminSidebar } from "./PatriotAdminSidebar";
import styles from "../patriot.module.css";

/** The admin stays dark regardless of the public light/dark toggle. These map
 * the firm ImageUploadField's --c-* theme vars to dark so it looks native here. */
const ADMIN_DARK_VARS: CSSProperties = {
  ["--c-bg" as string]: "#0f1320",
  ["--c-surface" as string]: "rgba(255,255,255,0.04)",
  ["--c-surface-2" as string]: "rgba(255,255,255,0.07)",
  ["--c-surface2" as string]: "rgba(255,255,255,0.07)",
  ["--c-ink" as string]: "#f8fafc",
  ["--c-ink-muted" as string]: "rgba(255,255,255,0.62)",
  ["--c-border" as string]: "rgba(255,255,255,0.14)",
  ["--c-accent" as string]: "#93c5fd",
  ["--c-error" as string]: "#fca5a5",
};

/**
 * Patriot admin shell. The Switchboard tab is intentionally OPEN — no sign-in
 * — so broadcast crew can operate on game day without accounts. The content
 * tabs (News, Teams, Branding, …) each call requirePatriotSignIn() and still
 * demand a session, and every save action re-checks auth server-side.
 */
export default async function PatriotAdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const branding = await getSetting<PatriotBranding>(PATRIOT_BRANDING_KEY, {});

  return (
    <div data-psx-theme="dark" style={ADMIN_DARK_VARS} className={`${styles.page} flex min-h-screen flex-col lg:flex-row`}>
      <PatriotAdminSidebar name={session?.name ?? "Operator"} logo={branding.favicon || branding.tournamentLogo} />
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
