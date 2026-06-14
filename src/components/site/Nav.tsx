"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { label: string; href: string };

export function Nav({
  firmName,
  logoUrl,
  items,
  ctaLabel,
  ctaHref,
  logoLight,
  logoDark,
}: {
  firmName: string;
  logoUrl?: string | null;
  items: NavItem[];
  ctaLabel: string;
  ctaHref: string;
  logoLight?: string;
  logoDark?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-[var(--c-bg)]/95 backdrop-blur border-b border-[var(--c-border)]">
      <nav className="container-page flex items-center justify-between h-24" aria-label="Primary">
        <Link href="/" aria-label={firmName} className="flex items-center leading-none">
          {(() => {
            // Dark logo on the light header; fall back to a single logo URL or text.
            const logo = logoDark ?? logoLight ?? logoUrl;
            if (logo) {
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={logo} alt={firmName} className="h-[4.5rem] w-auto max-w-[360px] object-contain" />;
            }
            return (
              <span className="font-[family-name:var(--font-display)] text-lg tracking-tight leading-none text-[var(--c-ink)]">
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
                className={cn(
                  "text-sm font-[family-name:var(--font-ui)] transition-opacity hover:opacity-70 text-[var(--c-ink-muted)]",
                  active && "text-[var(--c-ink)]",
                )}
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
          className="lg:hidden p-2 -mr-2 text-[var(--c-ink)]"
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
            <Link href={ctaHref} className="btn btn-accent mt-4">
              {ctaLabel}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
