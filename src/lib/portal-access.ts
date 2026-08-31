import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portalMembers, portalGroups } from "@/db/schema";
import { portalEmail } from "@/lib/share/portal-session";

export type PortalCtx = {
  member: typeof portalMembers.$inferSelect;
  group: typeof portalGroups.$inferSelect;
};

/** Resolve a client-portal invite token to its member + group — only while the
 *  member isn't revoked and the group isn't archived. */
export async function resolvePortalMember(token: string): Promise<PortalCtx | null> {
  if (!db || !token) return null;
  try {
    const [member] = await db.select().from(portalMembers).where(and(eq(portalMembers.token, token), eq(portalMembers.revoked, false)));
    if (!member) return null;
    const [group] = await db.select().from(portalGroups).where(eq(portalGroups.id, member.groupId));
    if (!group || group.archived) return null;
    return { member, group };
  } catch {
    return null;
  }
}

/** True when the signed-in portal session matches this member's email. */
export async function isVerifiedPortalMember(ctx: PortalCtx): Promise<boolean> {
  const email = await portalEmail();
  return !!email && email === ctx.member.email.toLowerCase();
}

/** Resolve + verify in one step; null when either fails. */
export async function verifiedPortalCtx(token: string): Promise<PortalCtx | null> {
  const ctx = await resolvePortalMember(token);
  if (!ctx) return null;
  return (await isVerifiedPortalMember(ctx)) ? ctx : null;
}
