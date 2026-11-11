import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlocks } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { getIntakePartner } from "@/lib/intake/partners";
import { PartnerIntake } from "@/components/intake/PartnerIntake";

export const dynamic = "force-dynamic";

/** Unlisted: no menu links to it, it is not in the sitemap, and search engines are told to stay out. */
export async function generateMetadata({ params }: { params: Promise<{ partner: string }> }): Promise<Metadata> {
  const p = getIntakePartner((await params).partner);
  return {
    title: { absolute: p ? `${p.name} — Civil matters intake` : "Intake" },
    description: "Start here.",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
    alternates: { canonical: null },
    openGraph: null,
    twitter: null,
  };
}

export default async function PartnerIntakePage({ params }: { params: Promise<{ partner: string }> }) {
  const partner = getIntakePartner((await params).partner);
  if (!partner) notFound();
  const [consult, globals] = await Promise.all([getBlocks("consultation"), getBlocks("global")]);
  const firmName = globals["global.firmName"] || FIRM.name;
  const consent = consult["intake.consent"] || `I understand that sending this form does not create an attorney-client relationship, and that ${firmName} does not represent me until I have signed a representation agreement issued by the firm.`;
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <header className="border-b border-[var(--c-border)] bg-[var(--c-surface)]">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="font-[family-name:var(--font-display)] text-2xl leading-tight">{partner.name}</p>
          <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Civil, probate and injury matters — legal services provided by <strong className="font-semibold text-[var(--c-ink)]">{firmName}</strong></p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <PartnerIntake partner={{ slug: partner.slug, name: partner.name }} areas={partner.areas} firmName={firmName} consentText={consent} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </div>
      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs leading-relaxed text-[var(--c-ink-muted)]">
        {firmName} is a separate law firm from {partner.name}. Matters submitted here are reviewed and, if accepted, handled by {firmName}.
      </footer>
    </main>
  );
}
