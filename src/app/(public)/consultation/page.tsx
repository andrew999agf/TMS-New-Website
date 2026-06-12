import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { IntakeWizard } from "@/components/intake/IntakeWizard";
import { getBlocks } from "@/lib/content";

export const metadata: Metadata = {
  title: "Request a Consultation",
  description:
    "Tell us what brings you in. A short, guided intake that routes your matter to the right place at the firm.",
};

export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ practice?: string }>;
}) {
  const { practice } = await searchParams;
  const blocks = await getBlocks("consultation");

  return (
    <>
      <PageHero
        eyebrow="Request a Consultation"
        title={blocks["intake.hero.heading"] || "What brings you in?"}
        lead={blocks["intake.hero.body"]}
      />
      <div className="container-page py-16 lg:py-24">
        <IntakeWizard
          initialPractice={practice}
          consentText={blocks["intake.consent"] ?? ""}
        />
        <p className="mt-12 max-w-2xl text-xs text-[var(--c-ink-muted)] leading-relaxed border-t border-[var(--c-border)] pt-6">
          {blocks["intake.consent"]}
        </p>
      </div>
    </>
  );
}
