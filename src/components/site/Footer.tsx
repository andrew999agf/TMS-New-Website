import Link from "next/link";
import { getBlocks } from "@/lib/content";
import { FIRM, OFFICES } from "@/lib/firm";
import { telHref } from "@/lib/utils";

const NAV_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Practice",
    links: [
      { label: "All Practice Areas", href: "/practice-areas" },
      { label: "Civil & Commercial Litigation", href: "/practice-areas/civil-commercial-litigation" },
      { label: "Personal Injury", href: "/practice-areas/personal-injury-wrongful-death" },
      { label: "Appellate Law", href: "/practice-areas/appellate-law" },
      { label: "Consumer Debt Defense", href: "/practice-areas/consumer-debt-defense" },
    ],
  },
  {
    title: "Firm",
    links: [
      { label: "The Attorney", href: "/about" },
      { label: "Results", href: "/results" },
      { label: "Insights", href: "/blog" },
      { label: "Glossary", href: "/glossary" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Client",
    links: [
      { label: "Request a Consultation", href: "/consultation" },
      { label: "Make a Payment", href: "/payment" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Legal Disclaimer", href: "/disclaimer" },
    ],
  },
];

export async function Footer() {
  const blocks = await getBlocks("footer");
  const global = await getBlocks("global");
  const firmName = global["global.firmName"] ?? FIRM.name;
  const disclaimer = blocks["footer.disclaimer"] ?? "";

  return (
    <footer className="bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] mt-auto">
      <div className="container-page py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="font-[family-name:var(--font-display)] text-2xl leading-tight">
              {firmName}
            </div>
            <p className="mt-4 text-[var(--c-dark-ink-muted)] max-w-xs text-sm leading-relaxed">
              {blocks["footer.blurb"]}
            </p>
            <Link
              href="/consultation"
              className="btn btn-ghost-dark mt-6 text-sm py-2.5 px-4"
            >
              Request a Consultation
            </Link>
          </div>

          {NAV_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="eyebrow eyebrow-muted text-[var(--c-dark-ink-muted)] mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <hr className="my-12 border-[var(--c-dark-border)]" />

        <div className="grid gap-8 md:grid-cols-3">
          {OFFICES.map((o) => (
            <div key={o.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-ui)] font-semibold text-[var(--c-dark-ink)]">
                  {o.name}
                </span>
                <span className="text-xs text-[var(--c-dark-accent)]">{o.role}</span>
              </div>
              <address className="not-italic mt-2 text-[var(--c-dark-ink-muted)] leading-relaxed">
                {o.street}
                <br />
                {o.city}, {o.state} {o.zip}
                <br />
                <a href={telHref(o.phone)} className="hover:text-[var(--c-dark-ink)]">
                  {o.phone}
                </a>
              </address>
            </div>
          ))}
        </div>

        <hr className="my-12 border-[var(--c-dark-border)]" />

        <div
          className="text-xs text-[var(--c-dark-ink-muted)] leading-relaxed max-w-4xl space-y-3 [&_p]:mt-2"
          dangerouslySetInnerHTML={{ __html: disclaimer }}
        />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--c-dark-ink-muted)]">
          <span>
            © {new Date().getFullYear()} {firmName}. All rights reserved.
          </span>
          <span>
            Fax {FIRM.fax} ·{" "}
            <a href={`mailto:${FIRM.email}`} className="hover:text-[var(--c-dark-ink)]">
              {FIRM.email}
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
