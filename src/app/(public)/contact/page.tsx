import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, Phone, Printer } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { getBlocks } from "@/lib/content";
import { FIRM, OFFICES } from "@/lib/firm";
import { telHref } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Three Texas offices — Fort Worth litigation hub, Meridian principal office, and Weatherford by appointment. Talk to the firm.",
};

export default async function ContactPage() {
  const contact = await getBlocks("contact");

  return (
    <>
      <PageHero
        eyebrow={contact["contact.hero.eyebrow"]}
        title={contact["contact.hero.heading"]}
        lead={contact["contact.hero.body"]}
      >
        <div className="mt-8">
          <Link href="/consultation" className="btn btn-accent">
            Request a Consultation <ArrowRight size={18} />
          </Link>
        </div>
      </PageHero>

      <div className="container-page py-16 lg:py-24">
        <div className="grid gap-8 md:grid-cols-3">
          {OFFICES.map((o) => (
            <div key={o.id} className="border border-[var(--c-border)] p-8 bg-[var(--c-surface)] flex flex-col">
              <span className="eyebrow">{o.role}</span>
              <h2 className="font-[family-name:var(--font-display)] text-2xl mt-2">{o.name}</h2>
              {o.county && (
                <span className="text-sm text-[var(--c-ink-muted)]">{o.county}</span>
              )}
              <address className="not-italic mt-5 text-[var(--c-ink-muted)] leading-relaxed flex-1">
                {o.street}
                {o.mailing ? (
                  <>
                    <br />
                    Mailing: {o.mailing}
                  </>
                ) : null}
                <br />
                {o.city}, {o.state} {o.zip}
              </address>
              <a
                href={telHref(o.phone)}
                className="mt-5 inline-flex items-center gap-2 link-underline"
              >
                <Phone size={16} /> {o.phone}
              </a>
              {o.byAppointment && (
                <span className="mt-2 text-xs text-[var(--c-ink-muted)]">By appointment</span>
              )}
              {/* Map placeholder */}
              <div className="mt-6 aspect-video bg-[var(--c-surface2)] border border-[var(--c-border)] flex items-center justify-center">
                <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-ink-muted)] opacity-50 font-[family-name:var(--font-ui)]">
                  Map — embed via admin
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-x-10 gap-y-3 border-t border-[var(--c-border)] pt-8 text-[var(--c-ink-muted)]">
          <a href={`mailto:${FIRM.email}`} className="inline-flex items-center gap-2 link-underline">
            <Mail size={16} /> {FIRM.email}
          </a>
          <span className="inline-flex items-center gap-2">
            <Printer size={16} /> Fax {FIRM.fax}
          </span>
        </div>
      </div>
    </>
  );
}
