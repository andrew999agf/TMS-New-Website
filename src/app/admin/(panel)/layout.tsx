import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { hasDb } from "@/db";

// Makes the admin installable as a home-screen app on iOS (Android uses the
// site manifest). The home-screen icon inherits the site favicon from the root
// layout. Scoped to the admin panel; the public site is unaffected.
export const metadata: Metadata = {
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TMS Time" },
};

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <AdminShell user={{ name: session.name, email: session.email, role: session.role, permissions: session.permissions ?? [] }}>
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
