import "server-only";
import { getSetting } from "@/lib/content";
import { SHARE_CC_KEY, SHARE_CC_DEFAULT, SHARE_LEAD_TEAM_KEY, SHARE_LEAD_TEAM_DEFAULT } from "@/lib/share/settings";

/**
 * The firm-wide "also copy these people" list for share-folder notifications —
 * invites, task assignments, and task answers. Managed in
 * Admin → Settings → Share-folder notifications.
 */
export async function shareNotifyList(): Promise<string[]> {
  const cc = await getSetting<string[]>(SHARE_CC_KEY, SHARE_CC_DEFAULT);
  return (Array.isArray(cc) ? cc : SHARE_CC_DEFAULT).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * The firm "Lead team" — automatically emailed when a recipient uploads
 * documents into a folder. Managed at the bottom of the Share Folders page.
 */
export async function shareLeadTeam(): Promise<string[]> {
  const team = await getSetting<string[]>(SHARE_LEAD_TEAM_KEY, SHARE_LEAD_TEAM_DEFAULT);
  return (Array.isArray(team) ? team : SHARE_LEAD_TEAM_DEFAULT).map((s) => s.trim().toLowerCase()).filter(Boolean);
}
