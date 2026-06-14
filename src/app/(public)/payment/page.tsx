import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/site/PageHero";
import { getBlocks } from "@/lib/content";

export const metadata: Metadata = { title: "Make a Payment" };

export default async function PaymentPage() {
  const blocks = await getBlocks("payment");
  const url = blocks["payment.url"];

  // Go straight to the payment portal — no interstitial page.
  if (url) redirect(url);

  return (
    <>
      <PageHero eyebrow="Billing" title="Make a Payment" />
      <div className="container-prose py-16 lg:py-24 text-center">
        <div className="border border-dashed border-[var(--c-border)] p-10 bg-[var(--c-surface2)]">
          <p className="text-[var(--c-ink-muted)]">
            The online payment link is being configured. Please call your office contact to arrange
            payment, or check back shortly.
          </p>
          <p className="mt-4 text-xs text-[var(--c-ink-muted)]">
            [Admin: add the Clio payment URL in Settings → Make a Payment.]
          </p>
        </div>
      </div>
    </>
  );
}
