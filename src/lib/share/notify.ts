import "server-only";
import { getSetting } from "@/lib/content";
import { SHARE_CC_KEY, SHARE_CC_DEFAULT } from "@/lib/share/settings";

/**
 * The firm-wide "also copy these people" list for share-folder notifications —
 * invites, new-document digests, task assignments, and task answers. Managed in
 * Admin → Settings → Share-folder notifications.
 */
export async function shareNotifyList(): Promise<string[]> {
  const cc = await getSetting<string[]>(SHARE_CC_KEY, SHARE_CC_DEFAULT);
  return (Array.isArray(cc) ? cc : SHARE_CC_DEFAULT).map((s) => s.trim().toLowerCase()).filter(Boolean);
}
