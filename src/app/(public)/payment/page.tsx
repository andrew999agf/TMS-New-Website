import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { getBlocks } from "@/lib/content";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Make a Payment" };

export default async function PaymentPage() {
  const blocks = await getBlocks("payment");
  const url = blocks["payment.url"];

  return (
    <>
      <PageHero eyebrow="Billing" title={blocks["payment.heading"] || "Make a Payment"} lead={blocks["payment.body"]} />
      <div className="container-prose py-16 lg:py-24 text-center">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-accent">
            Pay through the firm's portal <ArrowRight size={18} />
          </a>
        ) : (
          <div className="border border-dashed border-[var(--c-border)] p-10 bg-[var(--c-surface2)]">
            <p className="text-[var(--c-ink-muted)]">
              The online payment link is being configured. Please call your office contact to
              arrange payment, or check back shortly.
            </p>
            <p className="mt-4 text-xs text-[var(--c-ink-muted)]">
              [Admin: add the Clio payment URL in Settings → Payment.]
            </p>
          </div>
        )}
      </div>
    </>
  );
}
