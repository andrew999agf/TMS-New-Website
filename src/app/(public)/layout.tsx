import { Nav, type NavItem } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { getBlocks } from "@/lib/content";
import { FIRM } from "@/lib/firm";

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

  return (
    <>
      <Nav
        firmName={global["global.firmShort"] ?? FIRM.shortName}
        items={NAV_ITEMS}
        ctaLabel={home["home.hero.ctaLabel"] ?? "Request a Consultation"}
        ctaHref="/consultation"
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
