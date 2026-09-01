import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { LogoUploadSetting } from "@/components/admin/LogoUploadSetting";
import { PaymentLinkSetting } from "@/components/admin/PaymentLinkSetting";
import { DbSyncButton } from "@/components/admin/DbSyncButton";
import { ContentRefreshButton } from "@/components/admin/ContentRefreshButton";
import { IntakeNotifyManager } from "@/components/admin/IntakeNotifyManager";
import { BillingReminderManager } from "@/components/admin/BillingReminderManager";
import { BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT, type BillingReminder } from "@/lib/billing-reminder";
import { DailyBillingReviewManager } from "@/components/admin/DailyBillingReviewManager";
import { DAILY_REVIEW_KEY, DAILY_REVIEW_DEFAULT, type DailyReviewConfig } from "@/lib/billing/daily-review-config";
import { ShareCcManager } from "@/components/admin/ShareCcManager";
import { SHARE_CC_KEY, SHARE_CC_DEFAULT } from "@/lib/share/settings";
import { getSetting, getBlocks } from "@/lib/content";
import { isBlobConfigured } from "@/lib/blob";
import { FIRM } from "@/lib/firm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ga4 = await getSetting<string>("ga4", "");
  const paymentBlocks = await getBlocks("payment");
  const paymentUrl = paymentBlocks["payment.url"] ?? "";
  const logo = await getSetting<string>("logo", "");
  const intakeNotify = await getSetting<string[]>("intake.statusNotify", [FIRM.email]);
  const billingReminder = await getSetting<BillingReminder>(BILLING_REMINDER_KEY, BILLING_REMINDER_DEFAULT);
  const dailyReview = await getSetting<DailyReviewConfig>(DAILY_REVIEW_KEY, DAILY_REVIEW_DEFAULT);
  const systemUsers = db
    ? (await db.select({ name: admins.name, email: admins.email }).from(admins).orderBy(asc(admins.name))).map((u) => ({ name: u.name ?? "", email: u.email }))
    : [];
  const shareCc = await getSetting<string[]>(SHARE_CC_KEY, SHARE_CC_DEFAULT);

  const envState = [
    { key: "DATABASE_URL", label: "Database", set: Boolean(process.env.DATABASE_URL) },
    { key: "AUTH_SECRET", label: "Auth secret", set: Boolean(process.env.AUTH_SECRET) },
    { key: "BLOB_READ_WRITE_TOKEN", label: "Media storage (Blob)", set: isBlobConfigured() },
    { key: "RESEND_API_KEY", label: "Email (Resend)", set: Boolean(process.env.RESEND_API_KEY) },
  ];

  return (
    <>
      <AdminHeader title="Settings" description="Analytics, integrations, and environment status." />
      <div className="p-8 max-w-2xl space-y-8">
        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Branding</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            Logo shown in the top navigation. Upload a file directly below, or paste a URL. Leave
            blank to show the firm name as text. Use a transparent PNG/SVG that reads on both light
            and dark backgrounds (it sits over the dark hero on the home page). For separate
            light/dark logos, use{" "}
            <Link href="/admin/pages/global" className="text-[var(--c-accent)]">Pages → Global</Link>.
          </p>
          <LogoUploadSetting initial={logo} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Make a Payment</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            The link behind the &quot;Make a Payment&quot; button in the header (and the Payment page).
            Paste your Clio payment URL here.
          </p>
          <PaymentLinkSetting initial={paymentUrl} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">Intake status notifications</h2>
          <IntakeNotifyManager initial={Array.isArray(intakeNotify) ? intakeNotify : [FIRM.email]} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">Monthly billing reminder</h2>
          <BillingReminderManager initial={billingReminder ?? BILLING_REMINDER_DEFAULT} />
        </section>

        <section id="daily-billing-review" className="scroll-mt-20 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">End-of-day billing review</h2>
          <DailyBillingReviewManager initial={dailyReview ?? DAILY_REVIEW_DEFAULT} users={systemUsers} />
        </section>

        <section id="share-cc" className="scroll-mt-20 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">Share-folder notifications (who else gets copied)</h2>
          <ShareCcManager initial={Array.isArray(shareCc) ? shareCc : SHARE_CC_DEFAULT} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-4">Analytics</h2>
          <SettingsForm settingKey="ga4" label="Google Analytics 4 Measurement ID" placeholder="G-XXXXXXXXXX" initial={ga4} />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Database updates</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            When new features are added (like the team and badges sections), click this once to
            create any new tables and load their starter content. It is safe to run anytime.
          </p>
          <DbSyncButton />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Refresh site text</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            Pull the latest wording, results, counties, glossary, and team bios into the live site.
            <strong> Your uploaded logos, photos, banners, badges, and the Make a Payment link are kept.</strong>{" "}
            Note: this overwrites text you may have hand-edited here with the latest version.
          </p>
          <ContentRefreshButton />
        </section>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-2">Appearance</h2>
          <p className="text-sm text-[var(--c-ink-muted)]">
            Theme (colors + fonts) is managed in{" "}
            <Link href="/admin/appearance" className="text-[var(--c-accent)]">Appearance</Link>.
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
