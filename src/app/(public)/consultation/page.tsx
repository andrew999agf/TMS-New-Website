import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { IntakeWizard } from "@/components/intake/IntakeWizard";
import { getBlocks } from "@/lib/content";
import { estateDocsToAnswers } from "@/lib/intake/config";

export const metadata: Metadata = {
  title: "Request a Consultation",
  description:
    "Tell us what brings you in. A short, guided intake that routes your matter to the right place at the firm.",
};

export default async function ConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ practice?: string; docs?: string }>;
}) {
  const { practice, docs } = await searchParams;
  const blocks = await getBlocks("consultation");

  // A staff-sent link can pre-check specific estate-planning documents
  // (?docs=will,financial-poa) so the client lands ready to fill in details.
  const initialAnswers = docs ? estateDocsToAnswers(docs.split(",").map((s) => s.trim()).filter(Boolean)) : undefined;

  return (
    <>
      <PageHero
        eyebrow="Request a Consultation"
        title={blocks["intake.hero.heading"] || "What brings you in?"}
        lead={blocks["intake.hero.body"]}
        bgImage={blocks["consultation.hero.image"] || undefined}
        focal={blocks["consultation.hero.image.focal"]}
      />
      <div className="container-page py-16 lg:py-24">
        <IntakeWizard
          initialPractice={practice}
          initialAnswers={initialAnswers}
          consentText={blocks["intake.consent"] ?? ""}
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        />
        <p className="mt-12 max-w-2xl text-xs text-[var(--c-ink-muted)] leading-relaxed border-t border-[var(--c-border)] pt-6">
          {blocks["intake.consent"]}
        </p>
      </div>
    </>
  );
}
