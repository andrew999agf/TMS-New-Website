import { Nav, type NavItem } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/site/JsonLd";
import { PageViewTracker, GA4 } from "@/components/site/Analytics";
import { getBlocks, getSetting } from "@/lib/content";
import { FIRM, OFFICES, LITIGATION_COUNTIES } from "@/lib/firm";

const NAV_ITEMS: NavItem[] = [
  { label: "The Attorney", href: "/about" },
  { label: "Practice Areas", href: "/practice-areas" },
  { label: "Results", href: "/results" },
  { label: "Insights", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const global = await getBlocks("global");
  const home = await getBlocks("home");
  const ga4Id = (await getSetting<string>("ga4", process.env.NEXT_PUBLIC_GA4_ID ?? "")) || "";
  const logoUrl = (await getSetting<string>("logo", "")) || "";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;

  const legalServiceSchema = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: FIRM.name,
    url: baseUrl,
    email: FIRM.email,
    faxNumber: FIRM.fax,
    description:
      "A Texas trial firm. Civil and commercial litigation, personal injury, appeals, debt defense, business, and estate matters — prepared for trial.",
    areaServed: LITIGATION_COUNTIES.map((c) => ({ "@type": "AdministrativeArea", name: `${c} County, Texas` })),
    address: OFFICES.map((o) => ({
      "@type": "PostalAddress",
      streetAddress: o.street,
      addressLocality: o.city,
      addressRegion: "TX",
      postalCode: o.zip,
      addressCountry: "US",
    })),
    employee: {
      "@type": "Attorney",
      name: FIRM.attorney.fullName,
      jobTitle: FIRM.attorney.title,
    },
  };

  return (
    <>
      <JsonLd data={legalServiceSchema} />
      <PageViewTracker />
      <GA4 id={ga4Id} />
      <Nav
        firmName={global["global.firmShort"] ?? FIRM.shortName}
        logoUrl={logoUrl}
        items={NAV_ITEMS}
        ctaLabel={home["home.hero.ctaLabel"] ?? "Request a Consultation"}
        ctaHref="/consultation"
        logoLight={global["global.logoLight"] || undefined}
        logoDark={global["global.logoDark"] || undefined}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
