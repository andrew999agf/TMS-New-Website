import { Nav, type NavItem, type NavChild } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/site/JsonLd";
import { PageViewTracker, GA4 } from "@/components/site/Analytics";
import { getBlocks, getSetting, getPracticeAreas, getTeam } from "@/lib/content";
import { groupPracticeAreas } from "@/lib/content/defaults/practice-areas";
import { FIRM, OFFICES, LITIGATION_COUNTIES } from "@/lib/firm";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const global = await getBlocks("global");
  const home = await getBlocks("home");
  const payment = await getBlocks("payment");
  const [practices, team] = await Promise.all([getPracticeAreas(), getTeam()]);
  const ga4Id = (await getSetting<string>("ga4", process.env.NEXT_PUBLIC_GA4_ID ?? "")) || "";
  const logoUrl = (await getSetting<string>("logo", "")) || "";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;

  const fortWorth = OFFICES.find((o) => o.id === "fort-worth");
  const meridian = OFFICES.find((o) => o.id === "meridian");
  const weatherford = OFFICES.find((o) => o.id === "weatherford");
  const headerPhones = [
    fortWorth && { label: "Fort Worth", number: fortWorth.phone },
    meridian && { label: "Bosque County", number: meridian.phone },
    weatherford && { label: "Weatherford", number: weatherford.phone },
  ].filter(Boolean) as { label: string; number: string }[];

  // The header menus are built from live content, so a practice area or a team
  // member added in the admin shows up in the nav without a code change. The
  // practice list keeps the same priority order as the home page and the
  // practice-areas index — one definition, three surfaces.
  const practiceChildren: NavChild[] = groupPracticeAreas(practices).flatMap((g) =>
    g.areas.map((p) => ({
      label: p.title,
      href: `/practice-areas/${p.slug}`,
      section: g.label,
    })),
  );
  const teamChildren: NavChild[] = team.map((m) => ({
    label: m.name,
    href: `/about/${m.slug}`,
    note: m.role,
  }));

  const navItems: NavItem[] = [
    {
      label: "Our Team",
      href: "/about",
      children: teamChildren,
      moreLabel: "Meet the whole team",
    },
    {
      label: "Practice Areas",
      href: "/practice-areas",
      children: practiceChildren,
      wide: true,
      moreLabel: "All practice areas",
    },
    { label: "Results", href: "/results" },
    { label: "Insights", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ];

  const legalServiceSchema = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: FIRM.name,
    url: baseUrl,
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-[var(--c-accent)] focus:text-[var(--c-on-accent)] focus:px-4 focus:py-2 focus:rounded"
      >
        Skip to content
      </a>
      <Nav
        firmName={global["global.firmShort"] ?? FIRM.shortName}
        logoUrl={logoUrl}
        items={navItems}
        ctaLabel={home["home.hero.ctaLabel"] ?? "Request a Consultation"}
        ctaHref="/consultation"
        logoLight={global["global.logoLight"] || undefined}
        logoDark={global["global.logoDark"] || undefined}
        paymentUrl={payment["payment.url"] || undefined}
        phones={headerPhones}
      />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
