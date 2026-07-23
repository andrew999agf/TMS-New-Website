/**
 * Share-folder taxonomy + the safety logic that keeps privileged material away
 * from the other side. Pure data/functions (no server imports) so both the
 * client UI and the server actions can use it.
 */

/** Who a folder is meant for — drives the color, the banner, and the warnings. */
export type ShareAudience = "adversary" | "client" | "ally" | "neutral";

export type ShareTypeDef = {
  key: string;
  label: string; // full label in the picker
  short: string; // badge text
  audience: ShareAudience;
  blurb: string; // one-liner in the picker
  banner: string; // the explicit banner shown on the folder
};

export const SHARE_TYPES: ShareTypeDef[] = [
  {
    key: "discovery",
    label: "Discovery — produced to Opposing Counsel",
    short: "DISCOVERY",
    audience: "adversary",
    blurb: "Documents produced to the other side in litigation.",
    banner: "This folder is produced to the OTHER SIDE (opposing counsel). Everything placed here is being handed to your opponent.",
  },
  {
    key: "opposing",
    label: "Opposing Counsel — general",
    short: "OPPOSING",
    audience: "adversary",
    blurb: "General sharing with opposing counsel outside formal discovery.",
    banner: "This folder is shared with OPPOSING COUNSEL. Treat everything here as going to the other side.",
  },
  {
    key: "client",
    label: "Client Folder",
    short: "CLIENT",
    audience: "client",
    blurb: "Private documents shared with your client.",
    banner: "CLIENT ONLY. The opposing side must never receive access to this folder.",
  },
  {
    key: "client-drop",
    label: "Client Drop — collect documents from a client",
    short: "CLIENT DROP",
    audience: "client",
    blurb: "A place for a client to send documents to you.",
    banner: "CLIENT ONLY — for collecting documents from your client. Keep the other side out.",
  },
  {
    key: "co-counsel",
    label: "Co-Counsel",
    short: "CO-COUNSEL",
    audience: "ally",
    blurb: "Shared with co-counsel working the case with you.",
    banner: "Shared with CO-COUNSEL on your side. Privileged work product — not for the other side.",
  },
  {
    key: "expert",
    label: "Expert",
    short: "EXPERT",
    audience: "ally",
    blurb: "Materials shared with a retained expert.",
    banner: "Shared with a retained EXPERT on your side. May be consulting/privileged — keep off the other side.",
  },
  {
    key: "consultant",
    label: "Consultant",
    short: "CONSULTANT",
    audience: "ally",
    blurb: "Materials shared with a consultant.",
    banner: "Shared with a CONSULTANT on your side. Often privileged — not for the other side.",
  },
  {
    key: "prospective",
    label: "Prospective Client",
    short: "PROSPECTIVE",
    audience: "client",
    blurb: "Documents exchanged with a prospective client.",
    banner: "PROSPECTIVE CLIENT. Confidential — keep off the other side.",
  },
  {
    key: "other",
    label: "Other / General",
    short: "OTHER",
    audience: "neutral",
    blurb: "Anything that doesn't fit the categories above.",
    banner: "General shared folder. Double-check who you invite before sending.",
  },
];

const BY_KEY = new Map(SHARE_TYPES.map((t) => [t.key, t]));
export function shareType(key: string): ShareTypeDef {
  return BY_KEY.get(key) ?? SHARE_TYPES[SHARE_TYPES.length - 1];
}

/**
 * How long a share link stays live, by folder type. Discovery to the other side
 * is short-lived (21 days); relationships we work with over the life of a case
 * — clients, co-counsel, experts — get long windows (120 days). A re-issue
 * resets the clock.
 */
export function expiryDaysForType(typeKey: string): number {
  switch (typeKey) {
    case "discovery":
    case "opposing":
      return 21;
    case "client":
    case "client-drop":
    case "co-counsel":
    case "expert":
    case "consultant":
      return 120;
    case "prospective":
      return 30;
    default:
      return 60;
  }
}

/** Tailwind class bundle per audience — the visual "this is what kind of folder". */
export type AudienceStyle = { badge: string; ring: string; banner: string; dot: string };
export function audienceStyle(audience: ShareAudience): AudienceStyle {
  switch (audience) {
    case "adversary":
      return {
        badge: "bg-red-600 text-white",
        ring: "border-red-500/60",
        banner: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
        dot: "bg-red-500",
      };
    case "client":
      return {
        badge: "bg-blue-600 text-white",
        ring: "border-blue-500/50",
        banner: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
        dot: "bg-blue-500",
      };
    case "ally":
      return {
        badge: "bg-emerald-600 text-white",
        ring: "border-emerald-500/50",
        banner: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        dot: "bg-emerald-500",
      };
    default:
      return {
        badge: "bg-slate-500 text-white",
        ring: "border-slate-400/50",
        banner: "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300",
        dot: "bg-slate-400",
      };
  }
}

/* ------------------------------ email safety ------------------------------ */

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com",
  "live.com", "msn.com", "me.com", "comcast.net", "sbcglobal.net", "att.net",
  "proton.me", "protonmail.com", "ymail.com", "verizon.net", "cox.net",
]);

// Substring match (not boundary-delimited) so glued domains like "smithlaw.com",
// "jonesllp.com", or "abclegal.com" are caught. A stray false positive only
// triggers a dismissible warning, which is the safe direction for privilege.
const LAWFIRM_RE = /(law|legal|attorney|counsel|lawfirm|lawoffice|llp|pllc|esq|esquire|barrister|solicitor|advocates?)/i;

export type EmailSignal = { domain: string; freemail: boolean; firmLike: boolean; org: boolean };
export function classifyEmail(email: string): EmailSignal {
  const domain = (email.split("@")[1] ?? "").trim().toLowerCase();
  const freemail = FREEMAIL.has(domain);
  // Test the domain without its TLD so ".law" isn't required but common TLDs
  // (.com/.net) don't cause noise.
  const firmLike = !!domain && !freemail && LAWFIRM_RE.test(domain.replace(/\.[a-z]+$/, ""));
  const org = !!domain && !freemail; // any non-freemail domain is an organization address
  return { domain, freemail, firmLike, org };
}

export type ShareWarning = { level: "danger" | "warn"; message: string };

/**
 * The heart of the "don't hand it to the wrong side" logic. Given a folder type
 * and a proposed recipient email, return warnings the sender must acknowledge.
 */
export function recipientWarnings(typeKey: string, email: string, firmDomain: string): ShareWarning[] {
  const t = shareType(typeKey);
  const sig = classifyEmail(email);
  const out: ShareWarning[] = [];
  if (!sig.domain) return out;

  const notAdversary = t.audience !== "adversary";

  // Sharing privileged/client material with something that looks like a law firm.
  if (notAdversary && sig.firmLike) {
    out.push({
      level: "danger",
      message: `"${sig.domain}" looks like a law firm or attorney. This is a ${t.short} folder — the other side should NOT have access. Are you sure this isn't opposing counsel?`,
    });
  } else if (notAdversary && sig.org && sig.domain !== firmDomain) {
    out.push({
      level: "warn",
      message: `"${sig.domain}" is an organization address, not a personal one. Make sure this recipient should have access to a ${t.short} folder.`,
    });
  }

  // Adversary folders: confirm intent, and flag odd-looking addresses.
  if (t.audience === "adversary") {
    if (sig.domain === firmDomain) {
      out.push({ level: "danger", message: `"${sig.domain}" is one of your own firm's addresses on a folder that goes to the OTHER SIDE. That can't be right — double-check.` });
    } else {
      out.push({ level: "warn", message: `You're sharing a ${t.short} folder with ${email}. This is accessible to the OTHER SIDE. Confirm this is the correct opposing counsel.` });
      if (sig.freemail) out.push({ level: "warn", message: `"${sig.domain}" is a personal email for an opposing-counsel folder — double-check it's the right attorney.` });
    }
  }

  return out;
}

/* ------------------------------ permissions ------------------------------ */

export type SharePermission = "view" | "download" | "upload" | "manage";

export const SHARE_PERMISSIONS: { key: SharePermission; label: string; blurb: string }[] = [
  { key: "view", label: "View only", blurb: "Can open and read documents (no download button)." },
  { key: "download", label: "View & download", blurb: "Can open and download documents." },
  { key: "upload", label: "View, download & upload", blurb: "Can also add files and create folders." },
  { key: "manage", label: "View, download, upload & delete", blurb: "Full access, including deleting files and folders." },
];

const PERM_LABEL = new Map(SHARE_PERMISSIONS.map((p) => [p.key, p.label]));
export function permissionLabel(p: string): string {
  return PERM_LABEL.get(p as SharePermission) ?? "View & download";
}

/** What a given permission level is allowed to do. */
export function shareCan(permission: string, action: "download" | "upload" | "delete"): boolean {
  const p = (PERM_LABEL.has(permission as SharePermission) ? permission : "download") as SharePermission;
  if (action === "download") return p === "download" || p === "upload" || p === "manage";
  if (action === "upload") return p === "upload" || p === "manage"; // upload also permits creating folders
  return p === "manage"; // delete
}

export const FOLDER_SORTS = [
  { key: "updated", label: "Recent activity" },
  { key: "case", label: "Case number" },
  { key: "name", label: "Client name" },
  { key: "type", label: "Folder type" },
] as const;
export type FolderSort = (typeof FOLDER_SORTS)[number]["key"];
