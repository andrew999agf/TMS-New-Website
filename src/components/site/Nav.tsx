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
}: {
  firmName: string;
  logoUrl?: string | null;
  items: NavItem[];
  ctaLabel: string;
  ctaHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The home page has a dark hero, so the nav starts transparent/light there.
  const onDarkHero = pathname === "/" && !scrolled;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled
          ? "bg-[var(--c-bg)]/95 backdrop-blur border-b border-[var(--c-border)]"
          : onDarkHero
            ? "bg-transparent"
            : "bg-[var(--c-bg)] border-b border-[var(--c-border)]",
      )}
    >
      <nav className="container-page flex items-center justify-between h-[72px]" aria-label="Primary">
        <Link href="/" className="flex items-center leading-none" aria-label={firmName}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={firmName}
              className="h-10 w-auto max-h-11 object-contain"
            />
          ) : (
            <span
              className={cn(
                "font-[family-name:var(--font-display)] text-lg tracking-tight",
                onDarkHero ? "text-[var(--c-dark-ink)]" : "text-[var(--c-ink)]",
              )}
            >
              {firmName}
            </span>
          )}
        </Link>

        <div className="hidden lg:flex items-center gap-7">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-[family-name:var(--font-ui)] transition-opacity hover:opacity-70",
                  onDarkHero ? "text-[var(--c-dark-ink-muted)]" : "text-[var(--c-ink-muted)]",
                  active && (onDarkHero ? "text-[var(--c-dark-ink)]" : "text-[var(--c-ink)]"),
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href={ctaHref}
            className={cn("btn text-sm py-2.5 px-4", onDarkHero ? "btn-ghost-dark" : "btn-accent")}
          >
            {ctaLabel}
          </Link>
        </div>

        <button
          className={cn(
            "lg:hidden p-2 -mr-2",
            onDarkHero ? "text-[var(--c-dark-ink)]" : "text-[var(--c-ink)]",
          )}
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
