import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discoverySets, discoveryDocs, shareFolders, shareFiles, productionDocs } from "@/db/schema";

/**
 * The friendly-parties share view of a discovery case's production pipeline:
 * co-counsel, experts, or an outside AI get the DOCUMENTS — and nothing else.
 * No AI labels, no notes, no table of contents, no annotations. Those are
 * internal work product and never leave the admin panel. This link is also
 * not for opposing counsel (finalized productions carry their own OC link).
 */

export type SharedDoc = {
  /** "doc-<id>" | "share-<id>" | "prod-<id>" — the file route key. */
  key: string;
  name: string;
  pages: number | null;
  /** Bates range for staged/produced copies, e.g. "SMITH000201–000202". */
  bates?: string;
};

export type SharedCase = {
  setId: number;
  name: string;
  causeNumber: string;
  received: SharedDoc[];
  staged: SharedDoc[];
  produced: SharedDoc[];
};

const batesRange = (prefix: string, start: number, end: number) =>
  prefix ? `${prefix}${String(start).padStart(6, "0")}${end > start ? `–${String(end).padStart(6, "0")}` : ""}` : "";

export async function getSharedDiscoveryCase(token: string): Promise<SharedCase | null> {
  if (!db || !token || token.length < 10) return null;
  const [set] = await db.select().from(discoverySets).where(eq(discoverySets.shareToken, token));
  if (!set) return null;

  const received: SharedDoc[] = [];
  const docs = await db.select().from(discoveryDocs).where(and(eq(discoveryDocs.setId, set.id), eq(discoveryDocs.bucket, "client")));
  for (const d of docs) if (d.url) received.push({ key: `doc-${d.id}`, name: d.name, pages: d.pageCount });
  if (set.matter) {
    const folders = await db.select({ id: shareFolders.id }).from(shareFolders)
      .where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
    if (folders.length) {
      const files = await db.select().from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
      for (const f of files) if (f.url) received.push({ key: `share-${f.id}`, name: f.filename, pages: f.pageCount });
    }
  }

  const pdocs = await db.select().from(productionDocs).where(eq(productionDocs.setId, set.id));
  const toShared = (d: typeof pdocs[number]): SharedDoc => ({
    key: `prod-${d.id}`, name: d.name, pages: d.pageCount, bates: batesRange(d.batesPrefix, d.batesStart, d.batesEnd) || undefined,
  });
  const staged = pdocs.filter((d) => d.status !== "produced" && d.url).sort((a, b) => a.batesStart - b.batesStart).map(toShared);
  const produced = pdocs.filter((d) => d.status === "produced" && d.url).sort((a, b) => a.batesStart - b.batesStart).map(toShared);

  return { setId: set.id, name: set.name, causeNumber: set.causeNumber, received, staged, produced };
}

/** Resolve a share key to its file, verifying it belongs to this case. */
export async function resolveSharedFile(token: string, key: string): Promise<{ name: string; url: string; contentType: string | null; pathname: string | null } | null> {
  if (!db) return null;
  const [set] = await db.select().from(discoverySets).where(eq(discoverySets.shareToken, token));
  if (!set) return null;
  const m = key.match(/^(doc|share|prod)-(\d{1,10})$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === "doc") {
    const [d] = await db.select().from(discoveryDocs).where(and(eq(discoveryDocs.id, id), eq(discoveryDocs.setId, set.id), eq(discoveryDocs.bucket, "client")));
    return d?.url ? { name: d.name, url: d.url, contentType: d.contentType, pathname: d.pathname } : null;
  }
  if (m[1] === "prod") {
    const [d] = await db.select().from(productionDocs).where(and(eq(productionDocs.id, id), eq(productionDocs.setId, set.id)));
    return d?.url ? { name: d.name, url: d.url, contentType: d.contentType, pathname: d.pathname } : null;
  }
  if (!set.matter) return null;
  const [f] = await db.select().from(shareFiles).where(eq(shareFiles.id, id));
  if (!f?.url) return null;
  const [folder] = await db.select().from(shareFolders).where(and(eq(shareFolders.id, f.folderId), eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
  return folder ? { name: f.filename, url: f.url, contentType: f.contentType, pathname: f.pathname } : null;
}
