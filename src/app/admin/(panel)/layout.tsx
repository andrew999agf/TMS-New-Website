import type { Metadata } from "next";
import { requireAdmin, getSession } from "@/lib/auth";
import { SessionRefresher } from "@/components/admin/SessionRefresher";
import { AdminShell } from "@/components/admin/AdminShell";
import { getBlocks } from "@/lib/content";
import { hasDb, db } from "@/db";
import { admins, timeClockPunches } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";

// Makes the admin installable as a home-screen app. The manifest is linked here
// (only on admin pages) rather than via the root app/manifest.ts convention,
// which Next injects on EVERY page — that's what made the browser's "Install"
// prompt appear on the public site. Now it's offered only inside /admin.
export const metadata: Metadata = {
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TMS Time" },
};

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  // The token still carries sign-in-time access; when the database differs,
  // the shell re-issues the cookie so the Edge guard catches up on the next click.
  const token = await getSession();
  const stale = !!token && (token.role !== session.role || JSON.stringify((token.permissions ?? []).slice().sort()) !== JSON.stringify((session.permissions ?? []).slice().sort()));

  const brand = await getBlocks("global").catch(() => ({}) as Record<string, string>);
  const logoLight = brand["global.logoLight"] || "";
  const logoDark = brand["global.logoDark"] || "";

  // Hourly staff get the Clock In / Clock Out button (top right). Tolerates a
  // database that hasn't had "Apply database updates" run yet.
  let timeclock: { openSince: string | null } | null = null;
  if (db) {
    try {
      const me = Number(session.sub);
      const [a] = await db.select({ hourly: admins.hourly }).from(admins).where(eq(admins.id, me));
      if (a?.hourly) {
        const [open] = await db
          .select({ clockIn: timeClockPunches.clockIn })
          .from(timeClockPunches)
          .where(and(eq(timeClockPunches.adminId, me), isNull(timeClockPunches.clockOut)))
          .orderBy(desc(timeClockPunches.clockIn))
          .limit(1);
        timeclock = { openSince: open ? open.clockIn.toISOString() : null };
      }
    } catch {
      /* hourly column not applied yet — no button */
    }
  }

  return (
    <AdminShell user={{ name: session.name, email: session.email, role: session.role, permissions: session.permissions ?? [] }} timeclock={timeclock} logoLight={logoLight} logoDark={logoDark}>
      {stale && <SessionRefresher />}
      {!hasDb && (
        <div className="bg-[var(--c-error)] text-white px-8 py-2 text-sm">
          Database not configured — admin is read-only against seed defaults. Set{" "}
          <code>DATABASE_URL</code> and run <code>db:migrate</code> + <code>db:seed</code> to enable editing.
        </div>
      )}
      {children}
    </AdminShell>
  );
}
