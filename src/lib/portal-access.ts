import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { portalMembers, portalGroups, portalMemberMatters } from "@/db/schema";
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

/**
 * Matter ids this member has been added to. Access is granted matter by
 * matter — a member sees nothing on the file until the firm adds them to a
 * matter, and a new matter has no viewers until someone is added to it.
 * (Missing table → no access, never "everything".)
 */
export async function memberMatterIds(memberId: number): Promise<Set<number>> {
  if (!db) return new Set();
  try {
    const rows = await db.select({ matterId: portalMemberMatters.matterId }).from(portalMemberMatters).where(eq(portalMemberMatters.memberId, memberId));
    return new Set(rows.map((r) => r.matterId));
  } catch {
    return new Set();
  }
}

export async function memberCanSeeMatter(memberId: number, matterId: number): Promise<boolean> {
  if (!db) return false;
  try {
    const [row] = await db.select({ id: portalMemberMatters.id }).from(portalMemberMatters).where(and(eq(portalMemberMatters.memberId, memberId), eq(portalMemberMatters.matterId, matterId))).limit(1);
    return !!row;
  } catch {
    return false;
  }
}

/** Active (non-revoked) members who have been added to this matter — the only
 *  people a matter-level email may go to. */
export async function matterViewers(matterId: number) {
  if (!db) return [];
  try {
    const grants = await db.select({ memberId: portalMemberMatters.memberId }).from(portalMemberMatters).where(eq(portalMemberMatters.matterId, matterId));
    if (!grants.length) return [];
    return await db.select().from(portalMembers).where(and(inArray(portalMembers.id, grants.map((g) => g.memberId)), eq(portalMembers.revoked, false)));
  } catch {
    return [];
  }
}
