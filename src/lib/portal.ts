/** Client Case Portal shared constants (client-safe). */

/** What kind of client file a group is. */
export const FILE_KINDS = [
  { id: "single", label: "Single client file", blurb: "One client — a person or one company — and that client's matters." },
  { id: "family", label: "Multi-entity client file", blurb: "One person at the top (the parent) who owns or controls several entities — companies, trusts, estates — each with its own matters, plus the parent's personal matters. The firm reviews and communicates about all of it at once." },
] as const;
export const ENTITY_KINDS = [
  { id: "company", label: "Company" },
  { id: "partnership", label: "Partnership / LP" },
  { id: "trust", label: "Trust" },
  { id: "estate", label: "Estate" },
  { id: "other", label: "Other entity" },
] as const;
export const entityKind = (id: string) => ENTITY_KINDS.find((k) => k.id === id) ?? ENTITY_KINDS[0];

/** Document-request lifecycle. */
export const REQUEST_STATUSES = [
  { id: "open", label: "Requested", client: "Needed", cls: "bg-amber-100 text-amber-800" },
  { id: "received", label: "Received — to review", client: "Received", cls: "bg-sky-100 text-sky-800" },
  { id: "accepted", label: "Accepted", client: "Complete", cls: "bg-emerald-100 text-emerald-800" },
  { id: "waived", label: "No longer needed", client: "Not needed", cls: "bg-slate-100 text-slate-700" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["id"];
export const requestStatus = (id: string) => REQUEST_STATUSES.find((s) => s.id === id) ?? REQUEST_STATUSES[0];
/** Overdue = still needed and past its due date. */
export const requestOverdue = (r: { status: string; dueOn: string }) => r.status === "open" && !!r.dueOn && r.dueOn < new Date().toISOString().slice(0, 10);

export const POSTURES = [
  { id: "transactional", label: "Transactional" },
  { id: "pre-litigation", label: "Pre-Litigation" },
  { id: "litigation", label: "Litigation" },
] as const;
export type Posture = (typeof POSTURES)[number]["id"];

/**
 * Party roles for exhibits. Wider than the exhibit reviewer's three sides on
 * purpose — intervenors and third-party defendants are stored faithfully here
 * and mapped into the reviewer's nearest bucket until its UI grows to match.
 */
export const PARTY_ROLES = [
  { id: "plaintiff", label: "Plaintiff" },
  { id: "defendant", label: "Defendant" },
  { id: "joint", label: "Joint" },
  { id: "intervenor", label: "Intervenor" },
  { id: "third-party", label: "Third-Party Defendant" },
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number]["id"];

/** Map a portal party role onto the exhibit reviewer's three sides. */
export function partyToReviewerSide(party: string): "plaintiff" | "defendant" | "joint" {
  if (party === "plaintiff" || party === "defendant") return party;
  // Intervenor / third-party / anything future lands in "joint" so it stays
  // visibly separate from the two main sides until the reviewer grows a lane.
  return "joint";
}

export const MATTER_TABS = {
  base: ["dashboard", "correspondence", "documents", "time"],
  litigation: ["pleadings", "discovery", "exhibits"],
} as const;
