"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Scale,
  Trophy,
  Newspaper,
  BookMarked,
  Image as ImageIcon,
  Inbox,
  Palette,
  Settings,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { logoutAction } from "@/app/admin/auth-actions";

const NAV = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Pages", href: "/admin/pages", icon: FileText },
  { label: "Practice Areas", href: "/admin/practice-areas", icon: Scale },
  { label: "Results", href: "/admin/results", icon: Trophy },
  { label: "Blog", href: "/admin/blog", icon: Newspaper },
  { label: "Glossary", href: "/admin/glossary", icon: BookMarked },
  { label: "Media", href: "/admin/media", icon: ImageIcon },
  { label: "Intake", href: "/admin/intake", icon: Inbox },
  { label: "Appearance", href: "/admin/appearance", icon: Palette },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-[var(--c-bg)] text-[var(--c-ink)]">
      <aside className="w-60 shrink-0 bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] flex flex-col sticky top-0 h-screen">
        <div className="p-5 border-b border-[var(--c-dark-border)]">
          <div className="font-[family-name:var(--font-display)] text-lg leading-tight">
            T. Maxwell Smith
          </div>
          <div className="text-xs text-[var(--c-dark-ink-muted)] mt-0.5">Content Management</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-[var(--c-dark-surface)] text-[var(--c-dark-ink)] border-l-2 border-[var(--c-dark-accent)]"
                    : "text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] border-l-2 border-transparent"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[var(--c-dark-border)]">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-2 text-xs text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] mb-3"
          >
            <ExternalLink size={14} /> View live site
          </Link>
          <div className="text-xs text-[var(--c-dark-ink-muted)] mb-2 truncate">{user.email}</div>
          <form action={logoutAction}>
            <button className="flex items-center gap-2 text-xs text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)]">
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export function AdminHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-[var(--c-border)] bg-[var(--c-surface)] px-8 py-6 flex items-center justify-between gap-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl">{title}</h1>
        {description && <p className="text-sm text-[var(--c-ink-muted)] mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
