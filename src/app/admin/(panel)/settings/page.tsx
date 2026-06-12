import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getSetting } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ga4 = await getSetting<string>("ga4", "");
  const logo = await getSetting<string>("logo", "");

  const envState = [
    { key: "DATABASE_URL", label: "Database", set: Boolean(process.env.DATABASE_URL) },
    { key: "AUTH_SECRET", label: "Auth secret", set: Boolean(process.env.AUTH_SECRET) },
    { key: "BLOB_READ_WRITE_TOKEN", label: "Media storage (Blob)", set: Boolean(process.env.BLOB_READ_WRITE_TOKEN) },
    { key: "RESEND_API_KEY", label: "Email (Resend)", set: Boolean(process.env.RESEND_API_KEY) },
  ];

  return (
    <>
      <AdminHeader title="Settings" description="Analytics, integrations, and environment status." />
      <div className="p-8 max-w-2xl space-y-8">
        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Branding</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            Logo shown in the top navigation. Upload an image in{" "}
            <Link href="/admin/media" className="text-[var(--c-accent)]">Media</Link>, copy its URL,
            and paste it here. Leave blank to show the firm name as text. Use a transparent PNG/SVG
            that reads on both light and dark backgrounds (it sits over the dark hero on the home page).
          </p>
          <SettingsForm settingKey="logo" label="Logo image URL" placeholder="https://…(from Media library)" initial={logo} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">Analytics</h2>
          <SettingsForm settingKey="ga4" label="Google Analytics 4 Measurement ID" placeholder="G-XXXXXXXXXX" initial={ga4} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Appearance &amp; Payment</h2>
          <p className="text-sm text-[var(--c-ink-muted)]">
            Theme (colors + fonts) is managed in{" "}
            <Link href="/admin/appearance" className="text-[var(--c-accent)]">Appearance</Link>. The
            Clio payment link is edited in{" "}
            <Link href="/admin/pages/payment" className="text-[var(--c-accent)]">Pages → Payment</Link>.
          </p>
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">Environment status</h2>
          <ul className="space-y-2.5">
            {envState.map((e) => (
              <li key={e.key} className="flex items-center justify-between text-sm">
                <span>{e.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${e.set ? "bg-[var(--c-success)] text-white" : "bg-[var(--c-surface2)] text-[var(--c-ink-muted)]"}`}>
                  {e.set ? "Configured" : "Not set"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
