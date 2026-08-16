"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X, Phone, CreditCard, ChevronDown, ArrowRight } from "lucide-react";
import { telHref } from "@/lib/utils";
import { media } from "@/lib/media";
import { SiteSearch } from "./SiteSearch";

/** One link inside a header dropdown. `section` groups links under a heading;
 *  `note` is the small secondary line (a role, a one-line description). */
export type NavChild = { label: string; href: string; section?: string; note?: string };

export type NavItem = {
  label: string;
  href: string;
  /** When present, hovering (or focusing) the item opens a dropdown of these. */
  children?: NavChild[];
  /** Render the dropdown as a multi-column panel rather than a single column. */
  wide?: boolean;
  /** Link shown at the foot of the dropdown, e.g. "All practice areas". */
  moreLabel?: string;
};

/** Children in declaration order, bucketed by their `section` heading. */
function sections(children: NavChild[]): { title: string; links: NavChild[] }[] {
  const out: { title: string; links: NavChild[] }[] = [];
  for (const c of children) {
    const title = c.section ?? "";
    const last = out[out.length - 1];
    if (last && last.title === title) last.links.push(c);
    else out.push({ title, links: [c] });
  }
  return out;
}

/**
 * A top-level nav item that opens a panel on hover.
 *
 * Hover alone is not enough to be usable: the trigger is still a real link (so
 * it works on touch and for anyone who just clicks it), the panel also opens on
 * keyboard focus and closes on Escape, and closing is delayed briefly so the
 * pointer can travel from the word down into the panel without it vanishing.
 */
function NavDropdown({
  item,
  linkClass,
}: {
  item: NavItem & { children: NavChild[] };
  linkClass: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => () => cancelClose(), []);

  const groups = sections(item.children);
  const hasHeadings = groups.some((g) => g.title);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <Link
        href={item.href}
        aria-expanded={open}
        aria-haspopup="true"
        className={`${linkClass} inline-flex items-center gap-1`}
      >
        {item.label}
        <ChevronDown
          size={13}
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Link>

      {open && (
        <>
          {/* Bridges the gap between the word and the panel so the pointer
              never crosses dead space on its way down. */}
          <div aria-hidden className="absolute left-0 right-0 top-full h-4" />
          <div
            className={`absolute top-full left-1/2 -translate-x-1/2 mt-3 z-50 border border-[var(--c-border)] bg-[var(--c-surface)] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] ${
              item.wide ? "w-[min(78rem,calc(100vw-3rem))] p-7" : "w-72 p-5"
            }`}
          >
            <div
              className={
                item.wide
                  ? `grid gap-x-8 gap-y-7 ${
                      groups.length > 3 ? "grid-cols-3 xl:grid-cols-5" : "grid-cols-3"
                    }`
                  : ""
              }
            >
              {groups.map((g) => (
                <div key={g.title || "_"}>
                  {/* The rule lives on a wrapper, not the heading: the global
                      heading line-height is very tight, so a border on a
                      two-line heading lands on top of its second line. */}
                  {hasHeadings && g.title && (
                    <div className="flex items-end min-h-[2.6rem] pb-2 mb-2 border-b border-[var(--c-border)]">
                      <h3 className="font-[family-name:var(--font-ui)] text-[11px] font-semibold uppercase tracking-[0.14em] leading-[1.5] text-[var(--c-accent)]">
                        {g.title}
                      </h3>
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {g.links.map((c) => (
                      <li key={c.href}>
                        <Link
                          href={c.href}
                          className="block rounded-sm px-2 py-1.5 -mx-2 hover:bg-[var(--c-surface2)] transition-colors"
                        >
                          <span className="block font-[family-name:var(--font-display)] text-[15px] leading-snug text-[var(--c-ink)]">
                            {c.label}
                          </span>
                          {c.note && (
                            <span className="block text-xs text-[var(--c-ink-muted)] leading-snug mt-0.5">
                              {c.note}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {item.moreLabel && (
              <div className="mt-5 pt-4 border-t border-[var(--c-border)]">
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 text-sm font-[family-name:var(--font-ui)] text-[var(--c-accent)] hover:opacity-80"
                >
                  {item.moreLabel} <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function Nav({
  firmName,
  logoUrl,
  items,
  ctaLabel,
  ctaHref,
  logoLight,
  logoDark,
  paymentUrl,
  phones,
}: {
  firmName: string;
  logoUrl?: string | null;
  items: NavItem[];
  ctaLabel: string;
  ctaHref: string;
  logoLight?: string;
  logoDark?: string;
  paymentUrl?: string;
  phones?: { label: string; number: string }[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /** Which mobile section is expanded (by href); only one at a time. */
  const [section, setSection] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setSection(null);
  }, [pathname]);

  const payHref = paymentUrl || "/payment";
  const payExternal = Boolean(paymentUrl);

  return (
    <header className="sticky top-0 z-50 bg-[var(--c-bg)]/95 backdrop-blur border-b border-[var(--c-border)] shadow-[0_3px_8px_-4px_rgba(0,0,0,0.18)]">
      {/* Utility bar: office phones (left) + Make a Payment (right) */}
      <div className="hidden lg:block border-b border-[var(--c-border)] bg-[var(--c-surface2)]">
        <div className="container-page flex items-center justify-between h-9 text-xs">
          <div className="flex items-center gap-5 text-[var(--c-ink-muted)]">
            {(phones ?? []).map((p) => (
              <a key={p.label} href={telHref(p.number)} className="flex items-center gap-1.5 hover:text-[var(--c-ink)]">
                <Phone size={12} />
                <span className="font-medium text-[var(--c-ink)]">{p.label}</span> {p.number}
              </a>
            ))}
          </div>
          <a
            href={payHref}
            {...(payExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="flex items-center gap-1.5 font-[family-name:var(--font-ui)] font-semibold text-[var(--c-accent)] hover:opacity-80"
          >
            <CreditCard size={13} /> Make a Payment
          </a>
        </div>
      </div>

      <nav className="container-page flex items-center justify-between gap-3 h-[5.5rem] lg:h-24" aria-label="Primary">
        <Link href="/" aria-label={firmName} className="flex items-center leading-none min-w-0">
          {(() => {
            const logo = logoDark ?? logoLight ?? logoUrl;
            if (logo) {
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={media(logo)} alt={firmName} className="h-20 sm:h-[4.5rem] w-auto max-w-[calc(100vw-6rem)] sm:max-w-[360px] object-contain" />;
            }
            return (
              <span className="font-[family-name:var(--font-display)] text-base sm:text-lg tracking-tight leading-none text-[var(--c-ink)] truncate">
                {firmName}
              </span>
            );
          })()}
        </Link>

        <div className="flex items-center gap-1 lg:gap-6">
          <SiteSearch />
          <div className="hidden lg:flex items-center gap-7">
            {items.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const linkClass = `text-sm font-[family-name:var(--font-ui)] transition-opacity hover:opacity-70 text-[var(--c-ink-muted)]${active ? " !text-[var(--c-ink)]" : ""}`;
              if (item.children?.length) {
                return (
                  <NavDropdown
                    key={item.href}
                    item={item as NavItem & { children: NavChild[] }}
                    linkClass={linkClass}
                  />
                );
              }
              return (
                <Link key={item.href} href={item.href} className={linkClass}>
                  {item.label}
                </Link>
              );
            })}
            <Link href={ctaHref} className="btn btn-accent text-sm py-2.5 px-4">
              {ctaLabel}
            </Link>
          </div>

          <button
            className="lg:hidden shrink-0 p-2 -mr-2 text-[var(--c-ink)]"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="lg:hidden bg-[var(--c-bg)] border-t border-[var(--c-border)]">
          <div className="container-page py-6 flex flex-col gap-1">
            {items.map((item) => (
              <div key={item.href} className="border-b border-[var(--c-border)]">
                <div className="flex items-center justify-between">
                  <Link href={item.href} className="block flex-1 py-3 text-base text-[var(--c-ink)]">
                    {item.label}
                  </Link>
                  {/* There is no hover on a phone, and sixteen practice areas
                      listed flat would bury everything under them — so the
                      sub-links sit behind a tap instead. */}
                  {item.children?.length ? (
                    <button
                      type="button"
                      onClick={() => setSection((s) => (s === item.href ? null : item.href))}
                      aria-expanded={section === item.href}
                      aria-label={`${section === item.href ? "Hide" : "Show"} ${item.label}`}
                      className="p-3 -mr-2 text-[var(--c-ink-muted)]"
                    >
                      <ChevronDown
                        size={18}
                        className={`transition-transform ${section === item.href ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : null}
                </div>
                {item.children?.length && section === item.href ? (
                  <ul className="pb-3 -mt-1 pl-4 border-l border-[var(--c-border)] ml-1">
                    {item.children.map((c) => (
                      <li key={c.href}>
                        <Link
                          href={c.href}
                          className="block py-1.5 text-sm text-[var(--c-ink-muted)]"
                        >
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            <a
              href={payHref}
              {...(payExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="py-3 text-base text-[var(--c-accent)] font-medium border-b border-[var(--c-border)] flex items-center gap-2"
            >
              <CreditCard size={16} /> Make a Payment
            </a>
            {(phones ?? []).map((p) => (
              <a key={p.label} href={telHref(p.number)} className="py-2.5 text-sm text-[var(--c-ink-muted)] flex items-center gap-2">
                <Phone size={14} /> <span className="font-medium text-[var(--c-ink)]">{p.label}</span> {p.number}
              </a>
            ))}
            <Link href={ctaHref} className="btn btn-accent mt-4">
              {ctaLabel}
            </Link>
          </div>
        </div>
      )}

      {/* Modern accent edge: the brand color sits behind the white header and
          peeks out below as a thin stripe across the full width, then juts
          lower with a diagonal on the right (under the hamburger on mobile /
          the Make-a-Payment link on desktop). Purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-[21px] overflow-hidden">
        {/* thin midnight-navy band tucked between the white header and the gold */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-[var(--c-dark-bg)]" />
        {/* gold stripe + diagonal jet on the right, just below the navy band */}
        <div
          className="absolute inset-x-0 top-[3px] bottom-0 bg-[var(--c-accent)]"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 87% 30%, 0 30%)" }}
        />
      </div>
    </header>
  );
}
