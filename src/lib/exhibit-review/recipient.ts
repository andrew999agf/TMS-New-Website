import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, exhibitRecipients } from "@/db/schema";
import { portalEmail } from "@/lib/share/portal-session";
import type { PublicDoc } from "./public";
import { isVideoFile } from "./media";

export type RecipientContext = {
  rec: { id: number; setId: number; email: string; name: string; token: string };
  set: { id: number; name: string; causeNumber: string; court: string };
};

/**
 * Resolve a recipient token to its recipient + set, or null if the link is
 * invalid, revoked, expired, or the set is no longer shared in restricted mode.
 * Central gate for every recipient-facing route.
 */
export async function resolveExhibitRecipient(token: string): Promise<RecipientContext | null> {
  if (!db || !token) return null;
  try {
    const [rec] = await db.select().from(exhibitRecipients).where(eq(exhibitRecipients.token, token));
    if (!rec || rec.revoked) return null;
    if (rec.expiresAt && rec.expiresAt < new Date()) return null;
    const [set] = await db.select({ id: exhibitSets.id, name: exhibitSets.name, causeNumber: exhibitSets.causeNumber, court: exhibitSets.court, access: exhibitSets.access }).from(exhibitSets).where(eq(exhibitSets.id, rec.setId));
    if (!set || set.access !== "restricted") return null;
    return { rec: { id: rec.id, setId: rec.setId, email: rec.email, name: rec.name, token: rec.token }, set: { id: set.id, name: set.name, causeNumber: set.causeNumber, court: set.court } };
  } catch {
    return null;
  }
}

/** True when the current visitor has verified as this recipient's email. */
export async function isVerifiedAs(email: string): Promise<boolean> {
  const who = await portalEmail();
  return !!who && who === email.toLowerCase();
}

/** The recipient's exhibits (no storage URLs — streamed through the file route). */
export async function recipientDocs(setId: number): Promise<PublicDoc[]> {
  if (!db) return [];
  const rows = await db
    .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, description: exhibitDocs.description, bates: exhibitDocs.bates, url: exhibitDocs.url, pathname: exhibitDocs.pathname, contentType: exhibitDocs.contentType, pageCount: exhibitDocs.pageCount, sort: exhibitDocs.sort })
    .from(exhibitDocs)
    // Omitted exhibits never reach recipients (their file routes refuse them too).
    .where(and(eq(exhibitDocs.setId, setId), eq(exhibitDocs.omitted, false)))
    .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));
  return rows.filter((r) => r.url).map((r) => ({ id: r.id, side: r.side, number: r.number, label: r.label, title: r.title, description: r.description, bates: r.bates, pageCount: r.pageCount, isVideo: isVideoFile(r.pathname ?? r.url, r.contentType) }));
}
