/**
 * Canonical list of admin sections. Used by the sidebar, the middleware route
 * guard, and the per-user access toggles so they always agree. Full admins
 * (owner/editor) can access everything; other accounts get the Time Tracker
 * plus any sections explicitly toggled on for them in User Management.
 */

export type AdminSection = { key: string; label: string; href: string; toggleable: boolean };

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", toggleable: false },
  { key: "pages", label: "Pages", href: "/admin/pages", toggleable: true },
  { key: "team", label: "Our Team", href: "/admin/team", toggleable: true },
  { key: "banner", label: "Home Banner", href: "/admin/banner", toggleable: true },
  { key: "badges", label: "Badges", href: "/admin/badges", toggleable: true },
  { key: "practice-areas", label: "Practice Areas", href: "/admin/practice-areas", toggleable: true },
  { key: "results", label: "Results", href: "/admin/results", toggleable: true },
  { key: "blog", label: "Blog", href: "/admin/blog", toggleable: true },
  { key: "glossary", label: "Glossary", href: "/admin/glossary", toggleable: true },
  { key: "testimonials", label: "Testimonials", href: "/admin/testimonials", toggleable: true },
  { key: "media", label: "Media", href: "/admin/media", toggleable: true },
  { key: "intake", label: "Intake", href: "/admin/intake", toggleable: true },
  { key: "time-tracker", label: "Time Tracker", href: "/admin/time-tracker", toggleable: false },
  { key: "time-tracker-2", label: "Time Tracker 2.0", href: "/admin/time-tracker-2", toggleable: false },
  { key: "time-tracker-3", label: "Time Tracker 3.0", href: "/admin/time-tracker-3", toggleable: false },
  { key: "time-tracker-4", label: "Time Tracker 4.0", href: "/admin/time-tracker-4", toggleable: false },
  { key: "appearance", label: "Appearance", href: "/admin/appearance", toggleable: true },
  { key: "logins", label: "User Management", href: "/admin/logins", toggleable: false },
  { key: "settings", label: "Settings", href: "/admin/settings", toggleable: false },
];

/** Sections an admin can grant to a non-full-admin account. */
export const TOGGLEABLE_SECTIONS = ADMIN_SECTIONS.filter((s) => s.toggleable);

export function isFullAdminRole(role?: string): boolean {
  return role === "owner" || role === "editor";
}

/** All section keys a given account may access. */
export function allowedSections(role?: string, permissions?: string[]): string[] {
  if (isFullAdminRole(role)) return ADMIN_SECTIONS.map((s) => s.key);
  // Timekeepers get the original tracker plus 2.0, 3.0, and 4.0 by default.
  return ["time-tracker", "time-tracker-2", "time-tracker-3", "time-tracker-4", ...(permissions ?? [])];
}

/** Which section key a pathname belongs to (longest matching href wins). */
export function sectionForPath(pathname: string): string | null {
  let best: AdminSection | null = null;
  for (const s of ADMIN_SECTIONS) {
    const match = s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href);
    if (match && (!best || s.href.length > best.href.length)) best = s;
  }
  return best?.key ?? null;
}

export function canAccessPath(pathname: string, role?: string, permissions?: string[]): boolean {
  if (isFullAdminRole(role)) return true;
  const section = sectionForPath(pathname);
  if (!section) return false;
  return allowedSections(role, permissions).includes(section);
}
