import { Nav, type NavItem, type NavChild } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/site/JsonLd";
import { PageViewTracker, GA4 } from "@/components/site/Analytics";
import { getBlocks, getSetting, getPracticeAreas, getTeam } from "@/lib/content";
import { groupPracticeAreas } from "@/lib/content/defaults/practice-areas";
import { FIRM, OFFICES, LITIGATION_COUNTIES } from "@/lib/firm";
import { SITE_URL } from "@/lib/seo";

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
  const baseUrl = SITE_URL;

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

  const social = ["facebook", "instagram", "linkedin", "x", "youtube", "tiktok"].map((k) => (global[`global.social.${k}`] ?? "").trim()).filter((u) => /^https?:\/\//.test(u));
  const principal = OFFICES.find((o) => o.isPrincipal) ?? OFFICES[0];
  const place = (o: typeof OFFICES[number]) => ({
    "@type": "LegalService",
    "@id": `${baseUrl}/#office-${o.id}`,
    name: `${FIRM.name} — ${o.name}`,
    parentOrganization: { "@id": `${baseUrl}/#organization` },
    url: `${baseUrl}/locations/${o.id}`,
    telephone: o.phone,
    address: { "@type": "PostalAddress", streetAddress: o.street2 ? `${o.street}, ${o.street2}` : o.street, addressLocality: o.city, addressRegion: "TX", postalCode: o.zip, addressCountry: "US" },
    hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.street}, ${o.city}, TX ${o.zip}`)}`,
    ...(o.byAppointment ? { openingHours: "By appointment" } : {}),
  });
  const legalServiceSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["LegalService", "Organization"],
        "@id": `${baseUrl}/#organization`,
        name: FIRM.name,
        alternateName: FIRM.shortName,
        url: baseUrl,
        ...(logoUrl ? { logo: logoUrl.startsWith("http") ? logoUrl : `${baseUrl}${logoUrl}`, image: logoUrl.startsWith("http") ? logoUrl : `${baseUrl}${logoUrl}` } : {}),
        telephone: principal.phone,
        faxNumber: FIRM.fax,
        email: FIRM.email,
        description: "A Texas trial firm. Personal injury, wrongful death, civil and commercial litigation, appeals, probate and estate administration, and consumer debt defense — prepared for trial from day one.",
        address: { "@type": "PostalAddress", streetAddress: principal.street, addressLocality: principal.city, addressRegion: "TX", postalCode: principal.zip, addressCountry: "US" },
        location: OFFICES.map(place),
        areaServed: LITIGATION_COUNTIES.map((c) => ({ "@type": "AdministrativeArea", name: `${c} County, Texas` })),
        founder: { "@id": `${baseUrl}/#attorney` },
        employee: [{ "@id": `${baseUrl}/#attorney` }],
        knowsAbout: practices.map((p) => p.title),
        hasOfferCatalog: { "@type": "OfferCatalog", name: "Practice areas", itemListElement: practices.map((p) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: p.title, url: `${baseUrl}/practice-areas/${p.slug}` } })) },
        ...(social.length ? { sameAs: social } : {}),
        priceRange: "$$",
      },
      {
        "@type": "Attorney",
        "@id": `${baseUrl}/#attorney`,
        name: FIRM.attorney.fullName,
        alternateName: FIRM.attorney.displayName,
        jobTitle: FIRM.attorney.title,
        url: `${baseUrl}/about/${team.find((m) => m.isAttorney)?.slug ?? "thomas-maxwell-smith"}`,
        worksFor: { "@id": `${baseUrl}/#organization` },
        identifier: { "@type": "PropertyValue", propertyID: "Texas Bar Number", value: FIRM.attorney.barNumber },
      },
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        url: baseUrl,
        name: FIRM.name,
        publisher: { "@id": `${baseUrl}/#organization` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${baseUrl}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
      {
        "@type": "ItemList",
        "@id": `${baseUrl}/#sitenav`,
        name: "Main navigation",
        itemListElement: [
          { label: "Our Team", href: "/about" }, { label: "Practice Areas", href: "/practice-areas" }, { label: "Results", href: "/results" },
          { label: "Insights", href: "/blog" }, { label: "Contact", href: "/contact" }, { label: "Request a Consultation", href: "/consultation" },
        ].map((n, i) => ({ "@type": "SiteNavigationElement", position: i + 1, name: n.label, url: `${baseUrl}${n.href}` })),
      },
    ],
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
