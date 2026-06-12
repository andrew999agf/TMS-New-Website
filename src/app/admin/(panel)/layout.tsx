import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { hasDb } from "@/db";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <AdminShell user={{ name: session.name, email: session.email }}>
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
