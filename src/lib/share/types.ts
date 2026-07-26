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

// Listed alphabetically by label (the order the New Folder dropdown shows).
export const SHARE_TYPES: ShareTypeDef[] = [
  {
    key: "client",
    label: "Client Documents (collect and provide documents to and from the client)",
    short: "CLIENT",
    audience: "client",
    blurb: "Documents shared with — and collected from — your client. Limit their upload access if you don't want them adding files.",
    banner: "CLIENT ONLY. The opposing side must never receive access to this folder.",
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
    key: "consultant",
    label: "Consultant",
    short: "CONSULTANT",
    audience: "ally",
    blurb: "Materials shared with a consultant.",
    banner: "Shared with a CONSULTANT on your side. Often privileged — not for the other side.",
  },
  {
    key: "discovery",
    label: "Discovery Production (produced to opposing counsel)",
    short: "DISCOVERY",
    audience: "adversary",
    blurb: "Documents produced to the other side in litigation.",
    banner: "This folder is produced to the OTHER SIDE (opposing counsel). Everything placed here is being handed to your opponent.",
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
    key: "opposing",
    label: "Opposing Counsel (general)",
    short: "OPPOSING",
    audience: "adversary",
    blurb: "General sharing with opposing counsel outside formal discovery.",
    banner: "This folder is shared with OPPOSING COUNSEL. Treat everything here as going to the other side.",
  },
  {
    key: "other",
    label: "Other / General",
    short: "OTHER",
    audience: "neutral",
    blurb: "Anything that doesn't fit the categories above.",
    banner: "General shared folder. Double-check who you invite before sending.",
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
    key: "witness",
    label: "Witness (documents to and from a witness)",
    short: "WITNESS",
    audience: "neutral",
    blurb: "Documents shared with, or collected from, a witness.",
    banner: "Shared with a WITNESS. Confidential — share only what is appropriate for this witness.",
  },
];

const BY_KEY = new Map(SHARE_TYPES.map((t) => [t.key, t]));
// Retired keys map onto their replacements so existing folders still render.
const TYPE_ALIAS: Record<string, string> = { "client-drop": "client" };
export function shareType(key: string): ShareTypeDef {
  return BY_KEY.get(TYPE_ALIAS[key] ?? key) ?? BY_KEY.get("other")!;
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
    case "witness":
      return 60;
    default:
      return 60;
  }
}

/* ------------------------------ recipient kinds ------------------------------ */

/** The one list of relationship types — filter chips, not separate buckets. */
export const RECIPIENT_KINDS: { key: string; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "co-counsel", label: "Co-counsel" },
  { key: "opposing", label: "Opposing counsel" },
  { key: "expert", label: "Expert" },
  { key: "witness", label: "Witness" },
  { key: "prose", label: "Pro se party" },
  { key: "consultant", label: "Consultant" },
  { key: "other", label: "Other" },
];
const KIND_LABEL = new Map(RECIPIENT_KINDS.map((k) => [k.key, k.label]));
export function kindLabel(k: string): string {
  return KIND_LABEL.get(k) ?? "";
}

/**
 * Whether a plain link is acceptable for a recipient type, or a secure sign-in
 * is mandatory. YOUR SIDE OF THE FENCE (client, co-counsel, expert, consultant)
 * is always secured — no question asked. The other side and neutral third parties
 * (opposing counsel, pro se opponents, witnesses) may get a plain link, so the
 * sender is asked. Unknown/"other" is asked but defaults to secure.
 */
export function securityForKind(kind: string): "required" | "ask" {
  switch (kind) {
    case "client":
    case "co-counsel":
    case "expert":
    case "consultant":
      return "required";
    default:
      return "ask"; // opposing, witness, prose, other
  }
}

/** When the sender is asked, what to default the choice to (true = secure). */
export function defaultSecureForKind(kind: string): boolean {
  return !(kind === "opposing" || kind === "witness" || kind === "prose");
}

/** A sensible default recipient kind for a folder type. */
export function defaultKindForType(typeKey: string): string {
  switch (typeKey) {
    case "discovery":
    case "opposing":
      return "opposing";
    case "client":
    case "client-drop":
      return "client";
    case "prospective":
      return "client";
    case "co-counsel":
      return "co-counsel";
    case "expert":
      return "expert";
    case "consultant":
      return "consultant";
    case "witness":
      return "witness";
    default:
      return "other";
  }
}

/** How to address a recipient in the invite email, based on the folder type. */
export function rolePhrase(typeKey: string): string {
  switch (typeKey) {
    case "discovery":
    case "opposing":
      return "opposing counsel";
    case "client":
    case "client-drop":
      return "the client";
    case "prospective":
      return "a prospective client";
    case "co-counsel":
      return "co-counsel";
    case "expert":
      return "a retained expert";
    case "consultant":
      return "a consultant";
    case "witness":
      return "a witness";
    default:
      return "an authorized recipient";
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

/* --------------------------- folder workspace meta --------------------------- */

export type ShareTodo = { id: string; text: string; assignees?: string[]; uploadDir?: string; due?: string; dueSet?: string; doneBy?: string; doneAt?: string; archived?: boolean; answerEnabled?: boolean; answer?: string; answerAt?: string };

/**
 * Colour a task's goal date. Red once the date has passed; yellow once the
 * remaining time is within the last 25% of the window from when it was set
 * (e.g. 4 days out → yellow with 1 day left; 4 months out → yellow with 1
 * month left). `due` is a "YYYY-MM-DD" date; `dueSet` is when it was set.
 */
export function taskDueStatus(due?: string, dueSet?: string, now: number = Date.now()): "overdue" | "soon" | null {
  if (!due) return null;
  const dueT = new Date(`${due}T23:59:59`).getTime();
  if (!Number.isFinite(dueT)) return null;
  if (now >= dueT) return "overdue";
  const setT = dueSet ? new Date(dueSet).getTime() : now;
  const span = dueT - setT;
  if (span <= 0) return "soon";
  return dueT - now <= span * 0.25 ? "soon" : null;
}

/** Optional, viewer-facing extras an admin can turn on per folder. Each section
 *  only appears in the viewer portal when enabled AND it has content. */
export type ShareFolderMeta = {
  causesEnabled?: boolean;
  causes?: string[];
  notesEnabled?: boolean;
  notes?: string;
  todosEnabled?: boolean;
  todos?: ShareTodo[];
};

export function normalizeMeta(m: unknown): ShareFolderMeta {
  const o = (m ?? {}) as ShareFolderMeta;
  return {
    causesEnabled: !!o.causesEnabled,
    causes: Array.isArray(o.causes) ? o.causes.filter((x) => typeof x === "string") : [],
    notesEnabled: !!o.notesEnabled,
    notes: typeof o.notes === "string" ? o.notes : "",
    todosEnabled: !!o.todosEnabled,
    todos: Array.isArray(o.todos)
      ? o.todos
          .filter((t) => t && typeof t.id === "string" && typeof t.text === "string")
          .map((t) => ({
            ...t,
            assignees: Array.isArray(t.assignees) ? t.assignees.filter((a) => typeof a === "string") : [],
            uploadDir: typeof t.uploadDir === "string" && t.uploadDir ? t.uploadDir : undefined,
            due: typeof t.due === "string" && t.due ? t.due : undefined,
            dueSet: typeof t.dueSet === "string" && t.dueSet ? t.dueSet : undefined,
            archived: !!t.archived,
            answerEnabled: !!t.answerEnabled,
            answer: typeof t.answer === "string" && t.answer ? t.answer : undefined,
            answerAt: typeof t.answerAt === "string" && t.answerAt ? t.answerAt : undefined,
          }))
      : [],
  };
}

export const FOLDER_SORTS = [
  { key: "updated", label: "Recent activity" },
  { key: "case", label: "Case number" },
  { key: "name", label: "Client name" },
  { key: "type", label: "Folder type" },
] as const;
export type FolderSort = (typeof FOLDER_SORTS)[number]["key"];
