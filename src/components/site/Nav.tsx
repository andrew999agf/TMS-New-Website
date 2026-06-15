"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Phone, CreditCard } from "lucide-react";
import { telHref } from "@/lib/utils";
import { SiteSearch } from "./SiteSearch";

export type NavItem = { label: string; href: string };

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

  useEffect(() => setOpen(false), [pathname]);

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
              return <img src={logo} alt={firmName} className="h-20 sm:h-[4.5rem] w-auto max-w-[calc(100vw-6rem)] sm:max-w-[360px] object-contain" />;
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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-[family-name:var(--font-ui)] transition-opacity hover:opacity-70 text-[var(--c-ink-muted)]${active ? " !text-[var(--c-ink)]" : ""}`}
                >
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
              <Link
                key={item.href}
                href={item.href}
                className="py-3 text-base text-[var(--c-ink)] border-b border-[var(--c-border)]"
              >
                {item.label}
              </Link>
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
