/** Settings for share-folder emails. Consts only (client-safe). */
import { FIRM } from "@/lib/firm";

export const SHARE_CC_KEY = "share.ccEmails";

/** Every share invite/re-issue is CC'd here by default so Max keeps a copy. */
export const SHARE_CC_DEFAULT: string[] = [FIRM.email];
