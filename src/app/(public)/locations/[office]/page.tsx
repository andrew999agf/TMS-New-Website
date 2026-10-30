import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { PageHero, Breadcrumbs } from "@/components/site/PageHero";
import { JsonLd } from "@/components/site/JsonLd";
import { getPracticeAreas } from "@/lib/content";
import { groupPracticeAreas } from "@/lib/content/defaults/practice-areas";
import { FIRM, OFFICES } from "@/lib/firm";
import { SITE_URL, ORG_ID, clampDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** What each office is near and which counties it usually serves. Names only
 *  — courthouse addresses change; a map link is the reliable pointer. */
const LOCAL: Record<string, { title: string; counties: string[]; courts: string[]; blurb: string }> = {
  "fort-worth": {
    title: "Fort Worth Trial Attorneys — Tarrant County",
    counties: ["Tarrant", "Dallas", "Denton", "Collin", "Johnson", "Wise", "Kaufman"],
    courts: ["Tarrant County Courthouse (district courts)", "Tom Vandergriff Civil Courts Building", "Tim Curry Criminal Justice Center", "Eldon B. Mahon United States Courthouse — Northern District of Texas, Fort Worth Division"],
    blurb: "The firm's litigation hub. Jury trials, bench trials, and appeals are prepared here, a short walk from the Tarrant County courts and the federal courthouse.",
  },
  weatherford: {
    title: "Weatherford Attorneys | Parker County Office",
    counties: ["Parker", "Hood", "Somervell", "Tarrant"],
    courts: ["Parker County Courthouse", "Parker County Justice Center"],
    blurb: "A by-appointment office on Austin Avenue for Parker County matters and clients west of Fort Worth. Call to set a time; the Fort Worth team handles the work.",
  },
  meridian: {
    title: "Meridian Attorneys | Bosque County Office",
    counties: ["Bosque", "Hill", "Hamilton", "Coryell", "McLennan"],
    courts: ["Bosque County Courthouse — 220th Judicial District Court and county courts"],
    blurb: "The firm's principal office, on River Street in Meridian. Bosque County trials and the surrounding counties, with the same preparation the Fort Worth docket gets.",
  },
};

export async function generateStaticParams() { return OFFICES.map((o) => ({ office: o.id })); }

export async function generateMetadata({ params }: { params: Promise<{ office: string }> }): Promise<Metadata> {
  const { office } = await params;
  const o = OFFICES.find((x) => x.id === office); const l = LOCAL[office];
  if (!o || !l) return {};
  return {
    title: l.title,
    description: clampDescription(`${FIRM.name} in ${o.city}, Texas — ${o.street}, ${o.city} ${o.zip}. ${o.phone}. ${o.role}; serving ${l.counties.slice(0, 4).join(", ")} and nearby counties.`),
  };
}

export default async function OfficePage({ params }: { params: Promise<{ office: string }> }) {
  const { office } = await params;
  const o = OFFICES.find((x) => x.id === office); const l = LOCAL[office];
  if (!o || !l) notFound();
  const practices = await getPracticeAreas();
  const addr = `${o.street}, ${o.city}, TX ${o.zip}`;
  const mapsSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  const embed = `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`;
  const tel = `tel:${o.phone.replace(/[^\d+]/g, "")}`;
  const url = `${SITE_URL}/locations/${o.id}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LegalService",
        "@id": `${SITE_URL}/#office-${o.id}`,
        name: `${FIRM.name} — ${o.name}`,
        url,
        telephone: o.phone,
        faxNumber: FIRM.fax,
        parentOrganization: { "@id": ORG_ID },
        address: { "@type": "PostalAddress", streetAddress: o.street, addressLocality: o.city, addressRegion: "TX", postalCode: o.zip, addressCountry: "US" },
        hasMap: mapsSearch,
        areaServed: l.counties.map((c) => ({ "@type": "AdministrativeArea", name: `${c} County, Texas` })),
        ...(o.byAppointment ? { openingHours: "By appointment" } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Contact", item: `${SITE_URL}/contact` },
          { "@type": "ListItem", position: 3, name: o.name, item: url },
        ],
      },
    ],
  };
  return (
    <>
      <JsonLd data={schema} />
      <PageHero eyebrow={`${o.role}${o.county ? ` · ${o.county}` : ""}`} title={`${o.name}, Texas`} lead={l.blurb}>
        <div className="mt-2"><Breadcrumbs jsonLd={false} items={[{ label: "Contact", href: "/contact" }, { label: o.name }]} /></div>
      </PageHero>
      <div className="container-page py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="space-y-12">
            <section>
              <h2 className="h3">Visit or call</h2>
              <address className="not-italic mt-4 text-lg leading-relaxed">
                <span className="inline-flex items-start gap-2"><MapPin size={18} className="mt-1 shrink-0 text-[var(--c-accent)]" /><span>{o.street}{o.street2 ? <><br />{o.street2}</> : null}<br />{o.city}, Texas {o.zip}</span></span>
                <br />
                <a href={tel} className="mt-2 inline-flex items-center gap-2 hover:text-[var(--c-accent)]"><Phone size={18} className="text-[var(--c-accent)]" /> {o.phone}</a>
                {o.mailing && <span className="mt-2 block text-sm text-[var(--c-ink-muted)]">Mail: {o.mailing.line}, {o.mailing.city}, {o.mailing.state} {o.mailing.zip}</span>}
                <span className="mt-1 block text-sm text-[var(--c-ink-muted)]">Fax {FIRM.fax}{o.byAppointment ? " · Visits by appointment" : ""}</span>
              </address>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={directions} target="_blank" rel="noreferrer" className="btn btn-accent">Directions <ArrowRight size={16} /></a>
                <Link href={`/consultation`} className="btn btn-outline">Request a consultation</Link>
              </div>
            </section>
            <section>
              <h2 className="h3">Courts nearby</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[var(--c-ink-muted)]">{l.courts.map((c) => <li key={c}>{c}</li>)}</ul>
              <p className="mt-3 text-sm text-[var(--c-ink-muted)]">Matters from this office are regularly filed in {l.counties.map((c) => `${c} County`).join(", ")}, and in the Northern District of Texas and the Fifth Circuit.</p>
            </section>
            <section>
              <h2 className="h3">What this office handles</h2>
              <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2 text-sm">
                {groupPracticeAreas(practices).flatMap((g) => g.areas).map((p) => (
                  <Link key={p.slug} href={`/practice-areas/${p.slug}`} className="py-1 hover:text-[var(--c-accent)]">{p.title}</Link>
                ))}
              </div>
              <p className="mt-4 text-sm text-[var(--c-ink-muted)]">One firm, three doors. Every matter is prepared by the same team, wherever you walk in.</p>
            </section>
            <section className="text-sm text-[var(--c-ink-muted)]">
              <h2 className="h3 text-[var(--c-ink)]">Other offices</h2>
              <ul className="mt-3 space-y-1">{OFFICES.filter((x) => x.id !== o.id).map((x) => <li key={x.id}><Link href={`/locations/${x.id}`} className="hover:text-[var(--c-accent)]">{x.name} — {x.role}</Link> · {x.phone}</li>)}</ul>
            </section>
          </div>
          <aside>
            <iframe title={`Map to the ${o.name} office`} src={embed} loading="lazy" className="h-80 w-full border border-[var(--c-border)]" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            <a href={mapsSearch} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-[var(--c-accent)] hover:underline">Open in Google Maps</a>
          </aside>
        </div>
      </div>
    </>
  );
}
