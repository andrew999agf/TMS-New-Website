import "server-only";
import { db } from "@/db";
import { exhibitSets, exhibitDocs } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export type PublicDoc = {
  id: number; side: string; number: number | null; label: string; title: string; description: string; bates: string;
  pageCount: number | null;
};
export type PublicSet = {
  id: number; name: string; causeNumber: string; court: string; token: string;
  docs: PublicDoc[];
};

/**
 * Load a shared exhibit set by its public token — but only when sharing is
 * actually turned on. Returns null otherwise, so a disabled (or unknown) link
 * simply doesn't resolve. Deliberately returns no storage URLs; the bytes are
 * streamed through the token-checked file route instead.
 */
export async function getPublicSet(token: string): Promise<PublicSet | null> {
  if (!db || !token) return null;
  try {
    const [set] = await db
      .select({ id: exhibitSets.id, name: exhibitSets.name, causeNumber: exhibitSets.causeNumber, court: exhibitSets.court, isPublic: exhibitSets.isPublic, token: exhibitSets.publicToken })
      .from(exhibitSets)
      .where(and(eq(exhibitSets.publicToken, token), eq(exhibitSets.isPublic, true)));
    if (!set) return null;
    const rows = await db
      .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, description: exhibitDocs.description, bates: exhibitDocs.bates, url: exhibitDocs.url, pageCount: exhibitDocs.pageCount, sort: exhibitDocs.sort })
      .from(exhibitDocs)
      .where(eq(exhibitDocs.setId, set.id))
      .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));
    const docs: PublicDoc[] = rows
      .filter((r) => r.url)
      .map((r) => ({ id: r.id, side: r.side, number: r.number, label: r.label, title: r.title, description: r.description, bates: r.bates, pageCount: r.pageCount }));
    return { id: set.id, name: set.name, causeNumber: set.causeNumber, court: set.court, token: set.token || token, docs };
  } catch {
    return null;
  }
}

/**
 * Load a set by its opposing-counsel token — only when that link is enabled.
 * Deliberately strips everything but the exhibit name: no Bates, no page count,
 * no description are even sent to the client. The files themselves are still
 * served (opposing counsel needs the exhibits) through the OC file route.
 */
export async function getOcSet(token: string): Promise<PublicSet | null> {
  if (!db || !token) return null;
  try {
    const [set] = await db
      .select({ id: exhibitSets.id, name: exhibitSets.name, causeNumber: exhibitSets.causeNumber, court: exhibitSets.court, ocEnabled: exhibitSets.ocEnabled, token: exhibitSets.ocToken })
      .from(exhibitSets)
      .where(and(eq(exhibitSets.ocToken, token), eq(exhibitSets.ocEnabled, true)));
    if (!set) return null;
    const rows = await db
      .select({ id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label, title: exhibitDocs.title, url: exhibitDocs.url, sort: exhibitDocs.sort })
      .from(exhibitDocs)
      .where(eq(exhibitDocs.setId, set.id))
      .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id));
    const docs: PublicDoc[] = rows
      .filter((r) => r.url)
      .map((r) => ({ id: r.id, side: r.side, number: r.number, label: r.label, title: r.title, description: "", bates: "", pageCount: null }));
    return { id: set.id, name: set.name, causeNumber: set.causeNumber, court: set.court, token: set.token || token, docs };
  } catch {
    return null;
  }
}

/** The set id for an enabled opposing-counsel token (used by the OC file/zip/book
 *  routes, which serve the actual PDFs). Null when the link is off or unknown. */
export async function ocSetForToken(token: string): Promise<{ id: number; name: string } | null> {
  if (!db || !token) return null;
  try {
    const [set] = await db.select({ id: exhibitSets.id, name: exhibitSets.name }).from(exhibitSets).where(and(eq(exhibitSets.ocToken, token), eq(exhibitSets.ocEnabled, true)));
    return set ?? null;
  } catch {
    return null;
  }
}

/** Natural per-side ordering for the public index. */
export function orderPublicDocs(docs: PublicDoc[]): PublicDoc[] {
  const order: Record<string, number> = { plaintiff: 0, defendant: 1, joint: 2 };
  return docs.slice().sort((a, b) => {
    const so = (order[a.side] ?? 9) - (order[b.side] ?? 9);
    if (so !== 0) return so;
    return (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id;
  });
}
