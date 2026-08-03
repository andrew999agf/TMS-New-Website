/** Settings for share-folder emails. Consts only (client-safe). */
import { FIRM } from "@/lib/firm";

export const SHARE_CC_KEY = "share.ccEmails";

/** Every share invite/re-issue is CC'd here by default so Max keeps a copy. */
export const SHARE_CC_DEFAULT: string[] = [FIRM.email];

/**
 * The firm "Lead team" — the people automatically emailed when a recipient
 * (e.g. a client) uploads documents into a folder. This is the ONLY automatic
 * share-folder upload email; when firm staff upload, they're asked each time
 * whether to notify the recipients. Managed by checkbox at the bottom of the
 * Share Folders page.
 */
export const SHARE_LEAD_TEAM_KEY = "share.leadTeam";
export const SHARE_LEAD_TEAM_DEFAULT: string[] = ["max@texaslawsmith.com", "abergeron@texaslawsmith.com"];
