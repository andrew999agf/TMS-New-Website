"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TimeClockButton } from "./TimeClockButton";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BarChart3,
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
  AlarmClock,
  ClipboardCheck,
  CalendarClock,
  Bot,
  Briefcase,
  Globe,
  GraduationCap,
  FileSignature,
  FolderLock,
  FileSearch,
  KeyRound,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/admin/auth-actions";
import { allowedSections, sectionForPath } from "@/lib/admin-sections";
import { PwaInstall } from "@/components/admin/PwaInstall";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { AdminClock } from "@/components/admin/AdminClock";

// The website-editing sections, grouped under one "Website Management" entry
// with a sub-tab bar (keeps the left sidebar from getting cluttered).
const WEBSITE_TABS: { label: string; href: string; section: string; icon: LucideIcon }[] = [
  { label: "Pages", href: "/admin/pages", section: "pages", icon: FileText },
  { label: "Team", href: "/admin/team", section: "team", icon: Users },
  { label: "Home Banner", href: "/admin/banner", section: "banner", icon: Film },
  { label: "Badges", href: "/admin/badges", section: "badges", icon: Award },
  { label: "Practice Areas", href: "/admin/practice-areas", section: "practice-areas", icon: Scale },
  { label: "Results", href: "/admin/results", section: "results", icon: Trophy },
  { label: "Blog", href: "/admin/blog", section: "blog", icon: Newspaper },
  { label: "Glossary", href: "/admin/glossary", section: "glossary", icon: BookMarked },
  { label: "Texas Rules", href: "/admin/texas-rules", section: "texas-rules", icon: Gavel },
  { label: "Testimonials", href: "/admin/testimonials", section: "testimonials", icon: Quote },
  { label: "Media", href: "/admin/media", section: "media", icon: ImageIcon },
  { label: "Appearance", href: "/admin/appearance", section: "appearance", icon: Palette },
];
const WEBSITE_SECTIONS = new Set(WEBSITE_TABS.map((t) => t.section));

const NAV = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Website Management", href: "/admin/pages", icon: Globe },
  { label: "Intake", href: "/admin/intake", icon: Inbox },
  { label: "Debt Defense Wins", href: "/admin/debt-wins", icon: ShieldCheck },
  { label: "Document Generator", href: "/admin/documents", icon: FileSignature },
  { label: "Billing Review", href: "/admin/billing-review", icon: ClipboardCheck },
  { label: "Time Clock", href: "/admin/timeclock", icon: AlarmClock },
  { label: "Training", href: "/admin/training", icon: GraduationCap },
  { label: "User Management", href: "/admin/logins", icon: KeyRound },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

/**
 * The day-to-day case tools, pinned to the bottom of the sidebar under their own
 * heading and indented a step so they read as a distinct set. Always visible —
 * this is a visual grouping, not a collapsible menu.
 */
const CASE_TOOLS = [
  { label: "Time Tracker 4.0", href: "/admin/time-tracker-4", icon: Clock },
  { label: "Share Folders", href: "/admin/share-folders", icon: FolderLock },
  { label: "Pre-Trial Checklist", href: "/admin/pre-trial", icon: CalendarClock },
  { label: "Exhibit Reviewer", href: "/admin/exhibit-reviewer", icon: FileSearch },
  { label: "Case Portal", href: "/admin/case-portal", icon: Briefcase },
  { label: "Assistant", href: "/admin/assistant", icon: Bot },
  { label: "Map Overlay", href: "/admin/map-overlay", icon: MapIcon },
];

export function AdminShell({
  children,
  user,
  timeclock = null,
  logoLight = "",
  logoDark = "",
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string; permissions: string[] };
  /** Set for hourly staff: their current punch state. null = no clock button. */
  timeclock?: { openSince: string | null } | null;
  /** White/light logo shown in the (dark) sidebar header; falls back to the main
   *  logo rendered white, then to the firm name text. */
  logoLight?: string;
  logoDark?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const allowed = new Set(allowedSections(user.role, user.permissions));
  const websiteTabs = WEBSITE_TABS.filter((t) => allowed.has(t.section));
  const canWebsite = websiteTabs.length > 0;
  const websiteHref = websiteTabs[0]?.href ?? "/admin/pages";
  const onWebsite = WEBSITE_SECTIONS.has(sectionForPath(pathname) ?? "");
  const nav = NAV.filter((i) => (i.label === "Website Management" ? canWebsite : allowed.has(sectionForPath(i.href) ?? "")));
  const caseTools = CASE_TOOLS.filter((i) => allowed.has(sectionForPath(i.href) ?? ""));

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
              {logoLight ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoLight} alt="T. Maxwell Smith" className="h-8 w-auto max-w-[172px] object-contain" />
              ) : logoDark ? (
                // The main logo rendered white for the dark sidebar.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDark} alt="T. Maxwell Smith" className="h-8 w-auto max-w-[172px] object-contain brightness-0 invert" />
              ) : (
                <div className="font-[family-name:var(--font-display)] text-lg leading-tight truncate">T. Maxwell Smith</div>
              )}
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
        <AdminSearch allowed={[...allowed]} collapsed={collapsed} onExpand={() => { setCollapsed(false); localStorage.setItem("tms_admin_sidebar_collapsed", "0"); }} />
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {nav.map((item) => {
            const isWebsite = item.label === "Website Management";
            const href = isWebsite ? websiteHref : item.href;
            const active = isWebsite
              ? onWebsite
              : item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={href}
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

          {caseTools.length > 0 && (
            <div className="mt-4 border-t border-[var(--c-dark-border)] pt-3">
              {collapsed ? (
                <div className="mb-1 flex justify-center" title="Case & Trial Tools">
                  <Briefcase size={14} className="text-[var(--c-dark-ink-muted)]" />
                </div>
              ) : (
                <p className="px-5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-dark-ink-muted)]">
                  Case &amp; Trial Tools
                </p>
              )}
              {caseTools.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 py-2.5 text-sm transition-colors ${
                      // Indented a step past the main items so the grouping reads
                      // at a glance without hiding anything.
                      collapsed ? "justify-center px-0" : "pl-8 pr-5"
                    } ${
                      active
                        ? "bg-[var(--c-dark-surface)] text-[var(--c-dark-ink)] border-l-2 border-[var(--c-dark-accent)]"
                        : "text-[var(--c-dark-ink-muted)] hover:text-[var(--c-dark-ink)] border-l-2 border-transparent"
                    }`}
                  >
                    <Icon size={17} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          )}
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

      <main className="flex-1 min-w-0">
        {/* Slim strip carrying the DFW clock. Lives in the shell rather than in
            AdminHeader so it is present on every page, including the couple that
            render their own header. */}
        <div className="sticky top-0 z-40 flex h-9 items-center justify-end border-b border-[var(--c-border)] bg-[var(--c-surface)] px-6">
          <AdminClock />
        </div>
        {onWebsite && <WebsiteSubnav tabs={websiteTabs} pathname={pathname} />}
        {children}
      </main>
    </div>
  );
}

function WebsiteSubnav({ tabs, pathname }: { tabs: { label: string; href: string; icon: LucideIcon }[]; pathname: string }) {
  return (
    <div className="sticky top-9 z-20 flex gap-1 overflow-x-auto border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]"
            }`}
          >
            <Icon size={14} /> {t.label}
          </Link>
        );
      })}
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
