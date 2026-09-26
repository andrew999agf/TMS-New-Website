import "server-only";
import { ADMIN_SECTIONS, allowedSections } from "@/lib/admin-sections";

/**
 * The Assistant's map of the admin panel: what each section is for and where
 * to find it — filtered to the sections the asking user can actually access,
 * so it never navigates someone into a door their account can't open.
 */

const WHAT: Record<string, string> = {
  dashboard: "The landing page after signing in — quick links and at-a-glance status.",
  analytics: "Website traffic: visitors, page views, and where they came from.",
  pages: "Edit the public website's pages and their content.",
  team: "The public Our Team page — attorney and staff bios and photos.",
  banner: "The homepage banner and any floating announcement badges.",
  badges: "Award and membership badges shown on the public site.",
  "practice-areas": "The public practice-area pages — content and ordering.",
  results: "Case results shown on the public site, including featured verdicts.",
  blog: "Write and publish public blog posts.",
  glossary: "The public legal-terms glossary.",
  "texas-rules": "The public Texas court rules reference pages.",
  testimonials: "Client testimonials shown on the public site.",
  media: "Uploaded images and files used across the public site.",
  intake: "Prospective-client submissions from the website: review, track status (new → contacted → converted), refer out.",
  "debt-wins": "The debt-defense win counter that powers the public tally.",
  documents: "The Document Generator — fill firm templates into finished documents.",
  "share-folders": "Secure file-sharing with clients and outside parties: folders, links, permissions, and the client document-request system.",
  "pre-trial": "The Pre-Trial Checklist — trial dates, deadline checklists with assignees, witnesses, and exhibits for cases heading to trial.",
  cases: "Matters / Cases — the central case hub keyed by matter number. Case info entered here auto-fills every other tool.",
  contacts: "The firm contact book: clients, opposing parties, and attorneys on both sides.",
  "discovery-reviewer": "Review opposing productions page by page, designate exhibits, receive client documents, and build Bates-labeled productions with cover letters.",
  "exhibit-reviewer": "The trial exhibit list: designations, Bates ranges, witnesses, foundations, sharing links.",
  "case-portal": "Enterprise client portal: groups, companies, and their matters with tasks and correspondence.",
  assistant: "This AI assistant — general questions, drafting, and (for those granted it) coding.",
  "map-overlay": "The map overlay tool for property/venue visuals.",
  "time-tracker": "The original time tracker (admin-only legacy tool).",
  "time-tracker-4": "Time Tracker 4.0 — daily billable time entry, exported to Clio for billing.",
  "billing-review": "Review and revise staff time entries before export (restricted).",
  timeclock: "Clock in / clock out for hourly staff.",
  training: "Staff training modules and progress.",
  appearance: "Site theme and appearance settings.",
  logins: "User Management — accounts, roles, section access, and special abilities (owner/editor only).",
  settings: "System settings, including the Apply-database-updates button (owner/editor only).",
};

export function buildAdminGuide(role?: string, permissions?: string[]): string {
  const allowed = new Set(allowedSections(role, permissions));
  const sections = ADMIN_SECTIONS.filter((s) => allowed.has(s.key)).map((s) => ({
    name: s.label,
    where: s.href,
    what: WHAT[s.key] ?? "",
  }));
  return JSON.stringify({
    note: "Sections this user can access, in sidebar order. When guiding, name the section and the sidebar path; sections not listed here are off-limits to this user — don't describe or link them.",
    sections,
  });
}
