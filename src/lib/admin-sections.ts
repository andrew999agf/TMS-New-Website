/**
 * Canonical list of admin sections. Used by the sidebar, the middleware route
 * guard, and the per-user access toggles so they always agree. Full admins
 * (owner/editor) can access everything; other accounts (timekeepers) get the
 * Time Tracker and Training plus any sections explicitly toggled on for them in
 * User Management.
 */

export type AdminSection = { key: string; label: string; href: string; toggleable: boolean };

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", toggleable: false },
  { key: "analytics", label: "Analytics", href: "/admin/analytics", toggleable: true },
  { key: "pages", label: "Pages", href: "/admin/pages", toggleable: true },
  { key: "team", label: "Our Team", href: "/admin/team", toggleable: true },
  { key: "banner", label: "Home Banner", href: "/admin/banner", toggleable: true },
  { key: "badges", label: "Badges", href: "/admin/badges", toggleable: true },
  { key: "practice-areas", label: "Practice Areas", href: "/admin/practice-areas", toggleable: true },
  { key: "results", label: "Results", href: "/admin/results", toggleable: true },
  { key: "blog", label: "Blog", href: "/admin/blog", toggleable: true },
  { key: "glossary", label: "Glossary", href: "/admin/glossary", toggleable: true },
  { key: "texas-rules", label: "Texas Rules", href: "/admin/texas-rules", toggleable: true },
  { key: "testimonials", label: "Testimonials", href: "/admin/testimonials", toggleable: true },
  { key: "media", label: "Media", href: "/admin/media", toggleable: true },
  { key: "intake", label: "Intake", href: "/admin/intake", toggleable: false },
  { key: "documents", label: "Document Generator", href: "/admin/documents", toggleable: false },
  { key: "share-folders", label: "Share Folders", href: "/admin/share-folders", toggleable: true },
  { key: "pre-trial", label: "Pre-Trial Checklist", href: "/admin/pre-trial", toggleable: true },
  { key: "exhibit-reviewer", label: "Exhibit Reviewer", href: "/admin/exhibit-reviewer", toggleable: true },
  { key: "assistant", label: "Assistant", href: "/admin/assistant", toggleable: true },
  { key: "time-tracker", label: "Time Tracker", href: "/admin/time-tracker", toggleable: false },
  { key: "time-tracker-4", label: "Time Tracker 4.0", href: "/admin/time-tracker-4", toggleable: false },
  { key: "billing-review", label: "Billing Review", href: "/admin/billing-review", toggleable: true },
  { key: "timeclock", label: "Time Clock", href: "/admin/timeclock", toggleable: false },
  { key: "training", label: "Training", href: "/admin/training", toggleable: false },
  { key: "appearance", label: "Appearance", href: "/admin/appearance", toggleable: true },
  { key: "logins", label: "User Management", href: "/admin/logins", toggleable: false },
  { key: "settings", label: "Settings", href: "/admin/settings", toggleable: false },
];

/** Sections an admin can grant to a non-full-admin account. */
export const TOGGLEABLE_SECTIONS = ADMIN_SECTIONS.filter((s) => s.toggleable);

export function isFullAdminRole(role?: string): boolean {
  return role === "owner" || role === "editor";
}

/** Who may review and revise other staff's billing: full admins, or any account
 *  granted the "billing-review" section. */
export function canReviewBilling(role?: string, permissions?: string[]): boolean {
  return isFullAdminRole(role) || (permissions ?? []).includes("billing-review");
}

/** All section keys a given account may access. */
export function allowedSections(role?: string, permissions?: string[]): string[] {
  if (isFullAdminRole(role)) return ADMIN_SECTIONS.map((s) => s.key);
  // Every account (including interns/timekeepers) gets Time Tracker 4.0, Training,
  // Intake, and the Document Generator by default, plus any granted sections. The
  // original Time Tracker (1.0) is admin-only.
  return ["time-tracker-4", "timeclock", "training", "intake", "documents", ...(permissions ?? [])];
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
