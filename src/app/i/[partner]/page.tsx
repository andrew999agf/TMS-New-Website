import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlocks } from "@/lib/content";
import { FIRM } from "@/lib/firm";
import { getIntakePartner } from "@/lib/intake/partners";
import { PartnerIntake } from "@/components/intake/PartnerIntake";
import { getPartnerProfile } from "@/lib/intake/partner-profile";
import { getPartnerContacts } from "@/lib/intake/partner-contacts";
import { media } from "@/lib/media";

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
  const [consult, globals, profile, team] = await Promise.all([getBlocks("consultation"), getBlocks("global"), getPartnerProfile(partner), getPartnerContacts(partner.slug)]);
  // Names only. An email address is never sent to this page.
  const contacts = team.filter((c) => c.name.trim()).map((c) => ({ id: c.id, name: c.name }));
  const firmName = globals["global.firmName"] || FIRM.name;
  const consent = consult["intake.consent"] || `I understand that sending this form does not create an attorney-client relationship, and that ${firmName} does not represent me until I have signed a representation agreement issued by the firm.`;
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <PartnerIntake partner={{ slug: partner.slug, name: partner.name }} areas={partner.areas} logoUrl={media(profile.logoUrl) ?? ""} contact={profile.contact} contacts={contacts} firmName={firmName} consentText={consent} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
    </main>
  );
}
