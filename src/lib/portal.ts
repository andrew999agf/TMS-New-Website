/** Case Portal shared constants (client-safe). */

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
