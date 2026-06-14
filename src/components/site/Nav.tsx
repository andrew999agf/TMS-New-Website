"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Phone, CreditCard } from "lucide-react";
import { telHref } from "@/lib/utils";

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
    <header className="sticky top-0 z-50 bg-[var(--c-bg)]/95 backdrop-blur border-b border-[var(--c-border)]">
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

      <nav className="container-page flex items-center justify-between gap-3 h-20 lg:h-24" aria-label="Primary">
        <Link href="/" aria-label={firmName} className="flex items-center leading-none min-w-0">
          {(() => {
            const logo = logoDark ?? logoLight ?? logoUrl;
            if (logo) {
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={logo} alt={firmName} className="h-12 sm:h-[4.5rem] w-auto max-w-[190px] sm:max-w-[360px] object-contain" />;
            }
            return (
              <span className="font-[family-name:var(--font-display)] text-base sm:text-lg tracking-tight leading-none text-[var(--c-ink)] truncate">
                {firmName}
              </span>
            );
          })()}
        </Link>

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
    </header>
  );
}
