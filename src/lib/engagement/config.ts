import type { EngagementFees } from "@/db/schema";

/**
 * Engagement-letter defaults. The ONE locational decision lives here: the
 * client's county picks the office, and every fee, retainer, and phone number
 * flows from that single choice. Everything is editable in the builder — these
 * are just the starting values.
 */

export type EngagementOffice = "fort-worth" | "meridian";
export type EngagementSide = "plaintiff" | "defendant";

/** Counties served out of the Meridian office; everything else is Fort Worth. */
const MERIDIAN_COUNTIES = new Set(["bosque", "hamilton", "coryell", "somervell"]);

export function resolveOffice(county: string | null | undefined): EngagementOffice {
  const c = (county ?? "").toLowerCase().replace(/\s+county\s*$/, "").trim();
  return MERIDIAN_COUNTIES.has(c) ? "meridian" : "fort-worth";
}

export const OFFICE_INFO: Record<EngagementOffice, { label: string; phone: string }> = {
  "fort-worth": { label: "Fort Worth", phone: "817-348-8325" },
  meridian: { label: "Meridian", phone: "254-435-4288" },
};

export function defaultFees(office: EngagementOffice): EngagementFees {
  const fw = office === "fort-worth";
  return {
    attorneyRate: fw ? 425 : 335,
    associateRate: fw ? 425 : 335,
    staffRate: 145,
    phase1Retainer: fw ? 1000 : 500,
    litigationRetainer: fw ? 10000 : 5000,
    minTrustBalance: fw ? 5000 : 3500,
    trialRetainer: fw ? 20000 : 10000,
  };
}

/**
 * Standard Phase 1 / Phase 2 scope bullets for a basic litigation engagement.
 * Case-specific additions typed during the intake workflow are appended after
 * these; "Assisting and otherwise counsel the Client…" already follows in the
 * template as the closing item.
 */
export const PHASE1_STANDARD: Record<EngagementSide, string[]> = {
  plaintiff: [
    "Reviewing the facts and documents relevant to the matter and evaluating the Client's claims",
    "Preparing and sending a formal demand letter to the opposing party",
    "Corresponding with the opposing party (and any counsel that appears) to attempt to reach a pre-litigation resolution",
  ],
  defendant: [
    "Reviewing the demand, facts, and documents relevant to the matter and evaluating the claims asserted against the Client",
    "Preparing and sending a formal response to the opposing party's demand",
    "Corresponding with the opposing party (and any counsel that appears) to attempt to reach a pre-litigation resolution",
  ],
};

export const PHASE2_STANDARD: Record<EngagementSide, string[]> = {
  plaintiff: [
    "Preparing and filing an original petition and the other pleadings necessary to prosecute the Client's claims",
    "Serving the opposing party and propounding and responding to discovery as necessary",
    "Setting and appearing at necessary hearings and otherwise prosecuting the case toward resolution or trial",
  ],
  defendant: [
    "Preparing and filing an answer and the other responsive pleadings necessary to defend the Client",
    "Propounding and responding to discovery as necessary",
    "Setting and appearing at necessary hearings and otherwise defending the case toward resolution or trial",
  ],
};

/**
 * Interpret a wall-clock "YYYY-MM-DD" + "HH:mm" as Central time regardless of
 * the server's timezone (tries both CST/CDT offsets and keeps the one that
 * round-trips to the requested hour).
 */
export function centralTime(ymd: string, hm = "17:00"): Date {
  for (const off of ["-05:00", "-06:00"]) {
    const d = new Date(`${ymd}T${hm}:00${off}`);
    const back = d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: false, hour: "2-digit", minute: "2-digit" });
    if (back === hm || back === hm.replace(/^24/, "00")) return d;
  }
  return new Date(`${ymd}T${hm}:00-06:00`);
}

/** Default "open until": two weeks out, 5:00 p.m. Central. */
export function defaultOpenUntil(from = new Date()): Date {
  const d = new Date(from.getTime() + 14 * 86400_000);
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  return centralTime(ymd, "17:00");
}
