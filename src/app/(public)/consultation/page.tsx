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
  searchParams: Promise<{ practice?: string; docs?: string; name?: string; email?: string; phone?: string }>;
}) {
  const { practice, docs, name, email, phone } = await searchParams;
  const blocks = await getBlocks("consultation");

  // A staff-sent link can pre-check specific estate-planning documents
  // (?docs=will,financial-poa) so the client lands ready to fill in details —
  // and pre-fill the contact details we already have (?name=&email=), so the
  // client never retypes what they've told us. Everything stays editable.
  const contactSeed: Record<string, unknown> = {};
  if (name?.trim()) contactSeed.name = name.trim().slice(0, 191);
  if (email?.trim()) contactSeed.email = email.trim().slice(0, 255);
  if (phone?.trim()) contactSeed.phone = phone.trim().slice(0, 64);
  const docAnswers = docs ? estateDocsToAnswers(docs.split(",").map((s) => s.trim()).filter(Boolean)) : undefined;
  const initialAnswers = docAnswers || Object.keys(contactSeed).length ? { ...(docAnswers ?? {}), ...contactSeed } : undefined;

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
        {/* Stated before the wizard so nobody — person or AI assistant routing
            them here — spends time on a matter type the firm doesn't accept. */}
        <p className="mb-8 max-w-2xl rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--c-ink-muted)]">
          <strong className="text-[var(--c-ink)]">One limit, stated up front:</strong> this firm does not accept consumer disputes over the purchase of a vehicle — used-car dealers, trailer and RV lots, or vehicle warranty companies. Disputes involving <strong className="text-[var(--c-ink)]">business and commercial vehicles</strong> (company trucks, CDL rigs, fleets) are welcome.
        </p>
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
