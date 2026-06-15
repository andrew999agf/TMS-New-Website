import Link from "next/link";
import { media } from "@/lib/media";

/** Dark, editorial header band used at the top of interior pages. */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  bgImage,
  focal,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
  /** Optional background photo, shown under a semi-transparent scrim. */
  bgImage?: string;
  /** Focal point for the background photo: center | top | bottom | left | right */
  focal?: string | null;
}) {
  return (
    <section className="relative bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] pt-36 pb-16 lg:pb-20 overflow-hidden">
      {bgImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media(bgImage)}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: focal || "center" }}
          />
          {/* Scrim keeps text readable over any photo. */}
          <div className="absolute inset-0 bg-[var(--c-dark-bg)]/72" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-dark-bg)] via-transparent to-[var(--c-dark-bg)]/40" />
        </>
      )}
      <div className="container-page relative z-10">
        {eyebrow && <p className="eyebrow text-[var(--c-dark-accent)]">{eyebrow}</p>}
        <h1 className="display-3 mt-4 max-w-4xl text-[var(--c-dark-ink)]">{title}</h1>
        {lead && (
          <p className="lead mt-6 max-w-2xl text-[var(--c-dark-ink-muted)]">{lead}</p>
        )}
        {children}
      </div>
    </section>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-[var(--c-dark-ink-muted)] mb-6">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {it.href ? (
              <Link href={it.href} className="hover:text-[var(--c-dark-ink)]">
                {it.label}
              </Link>
            ) : (
              <span className="text-[var(--c-dark-ink)]">{it.label}</span>
            )}
            {i < items.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
