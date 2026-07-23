"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TimeClockButton } from "./TimeClockButton";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Scale,
  Trophy,
  Newspaper,
  BookMarked,
  Gavel,
  Image as ImageIcon,
  Inbox,
  Palette,
  Settings,
  LogOut,
  ExternalLink,
  Quote,
  Film,
  Users,
  Award,
  Clock,
  Sparkles, AlarmClock,
  GraduationCap,
  FileSignature,
  FolderLock,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { logoutAction } from "@/app/admin/auth-actions";
import { allowedSections, sectionForPath } from "@/lib/admin-sections";
import { PwaInstall } from "@/components/admin/PwaInstall";

const NAV = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Pages", href: "/admin/pages", icon: FileText },
  { label: "Our Team", href: "/admin/team", icon: Users },
  { label: "Home Banner", href: "/admin/banner", icon: Film },
  { label: "Badges", href: "/admin/badges", icon: Award },
  { label: "Practice Areas", href: "/admin/practice-areas", icon: Scale },
  { label: "Results", href: "/admin/results", icon: Trophy },
  { label: "Blog", href: "/admin/blog", icon: Newspaper },
  { label: "Glossary", href: "/admin/glossary", icon: BookMarked },
  { label: "Texas Rules", href: "/admin/texas-rules", icon: Gavel },
  { label: "Testimonials", href: "/admin/testimonials", icon: Quote },
  { label: "Media", href: "/admin/media", icon: ImageIcon },
  { label: "Intake", href: "/admin/intake", icon: Inbox },
  { label: "Document Generator", href: "/admin/documents", icon: FileSignature },
  { label: "Share Folders", href: "/admin/share-folders", icon: FolderLock },
  { label: "Time Tracker", href: "/admin/time-tracker", icon: Clock },
  { label: "Time Tracker 4.0", href: "/admin/time-tracker-4", icon: Sparkles },
  { label: "Time Clock", href: "/admin/timeclock", icon: AlarmClock },
  { label: "Training", href: "/admin/training", icon: GraduationCap },
  { label: "Appearance", href: "/admin/appearance", icon: Palette },
  { label: "User Management", href: "/admin/logins", icon: KeyRound },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminShell({
  children,
  user,
  timeclock = null,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string; permissions: string[] };
  /** Set for hourly staff: their current punch state. null = no clock button. */
  timeclock?: { openSince: string | null } | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const allowed = new Set(allowedSections(user.role, user.permissions));
  const nav = NAV.filter((i) => allowed.has(sectionForPath(i.href) ?? ""));

  // Restore the saved preference on mount, and persist changes.
  useEffect(() => {
    setCollapsed(localStorage.getItem("tms_admin_sidebar_collapsed") === "1");
  }, []);
  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("tms_admin_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="min-h-screen flex bg-[var(--c-bg)] text-[var(--c-ink)]">
      <aside
        className={`${
          collapsed ? "w-16" : "w-60"
        } shrink-0 bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] flex flex-col sticky top-0 h-screen transition-[width] duration-200 ease-in-out`}
      >
        <div
          className={`flex items-center border-b border-[var(--c-dark-border)] ${
            collapsed ? "justify-center p-3" : "justify-between p-5"
          }`}
        >
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-[family-name:var(--font-display)] text-lg leading-tight truncate">
                T. Maxwell Smith
              </div>
              <div className="text-xs text-[var(--c-dark-ink-muted)] mt-0.5">Content Management</div>
            </div>
          )}
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="shrink-0 text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] p-1"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {timeclock && (
          <div className={`border-b border-[var(--c-dark-border)] ${collapsed ? "px-2 py-3" : "px-4 py-3"}`}>
            <TimeClockButton initialOpenSince={timeclock.openSince} collapsed={collapsed} />
          </div>
        )}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {nav.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 py-2.5 text-sm transition-colors ${
                  collapsed ? "justify-center px-0" : "px-5"
                } ${
                  active
                    ? "bg-[var(--c-dark-surface)] text-[var(--c-dark-ink)] border-l-2 border-[var(--c-dark-accent)]"
                    : "text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] border-l-2 border-transparent"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && <PwaInstall />}

        <div className={`border-t border-[var(--c-dark-border)] ${collapsed ? "p-2" : "p-4"}`}>
          <Link
            href="/"
            target="_blank"
            title="View live site"
            className={`flex items-center gap-2 text-xs text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] mb-3 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <ExternalLink size={16} className="shrink-0" />
            {!collapsed && "View live site"}
          </Link>
          {!collapsed && (
            <div className="text-xs text-[var(--c-dark-ink-muted)] mb-2 truncate">{user.email}</div>
          )}
          <form action={logoutAction}>
            <button
              title="Sign out"
              className={`flex items-center gap-2 text-xs text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] ${
                collapsed ? "justify-center w-full" : ""
              }`}
            >
              <LogOut size={16} className="shrink-0" />
              {!collapsed && "Sign out"}
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
