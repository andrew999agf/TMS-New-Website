import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discoverySets, discoveryDocs, shareFolders, shareFiles, productionDocs } from "@/db/schema";

/**
 * Friendly-parties share views of a discovery case — ONE LINK PER TAB.
 * A "received" link shows only the red pile, a "staged" link only the
 * yellow pile, a "produced" link only the green pile; no link ever exposes
 * another tab. Co-counsel, experts, or an outside AI get the DOCUMENTS —
 * and nothing else: no AI labels, no page notes, no TOC, no annotations.
 * Those are internal work product and never leave the admin panel. These
 * links are also not for opposing counsel (finalized productions carry
 * their own OC link).
 */

export type ShareScope = "received" | "staged" | "produced";

export type SharedDoc = {
  /** "doc-<id>" | "share-<id>" | "prod-<id>" — the file route key. */
  key: string;
  name: string;
  pages: number | null;
  /** Bates range for staged/produced copies, e.g. "SMITH000201–000202". */
  bates?: string;
  /** Bates number of page 1, so per-page links can label themselves. */
  batesStart?: number;
  batesPrefix?: string;
};

export type SharedCase = {
  setId: number;
  scope: ShareScope;
  scopeTitle: string;
  name: string;
  causeNumber: string;
  docs: SharedDoc[];
};

const SCOPE_TITLES: Record<ShareScope, string> = {
  received: "Documents received from client",
  staged: "Documents to be produced",
  produced: "Documents produced",
};

const batesRange = (prefix: string, start: number, end: number) =>
  prefix ? `${prefix}${String(start).padStart(6, "0")}${end > start ? `–${String(end).padStart(6, "0")}` : ""}` : "";

type SetRow = typeof discoverySets.$inferSelect;

/** Which scope a token unlocks — the retired all-tabs token unlocks nothing. */
function scopeOf(set: SetRow, token: string): ShareScope | null {
  if (set.shareTokenReceived === token) return "received";
  if (set.shareTokenStaged === token) return "staged";
  if (set.shareTokenProduced === token) return "produced";
  return null;
}

async function setForToken(token: string): Promise<{ set: SetRow; scope: ShareScope } | null> {
  if (!db || !token || token.length < 10) return null;
  for (const col of [discoverySets.shareTokenReceived, discoverySets.shareTokenStaged, discoverySets.shareTokenProduced]) {
    const [set] = await db.select().from(discoverySets).where(eq(col, token));
    if (set) {
      const scope = scopeOf(set, token);
      if (scope) return { set, scope };
    }
  }
  return null;
}

async function docsForScope(set: SetRow, scope: ShareScope): Promise<SharedDoc[]> {
  if (scope === "received") {
    const out: SharedDoc[] = [];
    const docs = await db!.select().from(discoveryDocs).where(and(eq(discoveryDocs.setId, set.id), eq(discoveryDocs.bucket, "client")));
    for (const d of docs) if (d.url) out.push({ key: `doc-${d.id}`, name: d.name, pages: d.pageCount });
    if (set.matter) {
      const folders = await db!.select({ id: shareFolders.id }).from(shareFolders)
        .where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
      if (folders.length) {
        const files = await db!.select().from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
        for (const f of files) if (f.url) out.push({ key: `share-${f.id}`, name: f.filename, pages: f.pageCount });
      }
    }
    return out;
  }
  const pdocs = await db!.select().from(productionDocs).where(eq(productionDocs.setId, set.id));
  return pdocs
    .filter((d) => d.url && (scope === "produced" ? d.status === "produced" : d.status !== "produced"))
    .sort((a, b) => a.batesStart - b.batesStart)
    .map((d) => ({
      key: `prod-${d.id}`, name: d.name, pages: d.pageCount,
      bates: batesRange(d.batesPrefix, d.batesStart, d.batesEnd) || undefined,
      batesStart: d.batesPrefix ? d.batesStart : undefined,
      batesPrefix: d.batesPrefix || undefined,
    }));
}

export async function getSharedDiscoveryCase(token: string): Promise<SharedCase | null> {
  const hit = await setForToken(token);
  if (!hit) return null;
  return {
    setId: hit.set.id, scope: hit.scope, scopeTitle: SCOPE_TITLES[hit.scope],
    name: hit.set.name, causeNumber: hit.set.causeNumber,
    docs: await docsForScope(hit.set, hit.scope),
  };
}

/** Resolve a share key to its file — ONLY within the token's own scope. */
export async function resolveSharedFile(token: string, key: string): Promise<{ name: string; url: string; contentType: string | null; pathname: string | null; pages: number | null; batesPrefix?: string; batesStart?: number } | null> {
  const hit = await setForToken(token);
  if (!hit) return null;
  const m = key.match(/^(doc|share|prod)-(\d{1,10})$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === "prod") {
    if (hit.scope === "received") return null;
    const [d] = await db!.select().from(productionDocs).where(and(eq(productionDocs.id, id), eq(productionDocs.setId, hit.set.id)));
    if (!d?.url) return null;
    if (hit.scope === "produced" ? d.status !== "produced" : d.status === "produced") return null;
    return { name: d.name, url: d.url, contentType: d.contentType, pathname: d.pathname, pages: d.pageCount, batesPrefix: d.batesPrefix || undefined, batesStart: d.batesPrefix ? d.batesStart : undefined };
  }
  if (hit.scope !== "received") return null;
  if (m[1] === "doc") {
    const [d] = await db!.select().from(discoveryDocs).where(and(eq(discoveryDocs.id, id), eq(discoveryDocs.setId, hit.set.id), eq(discoveryDocs.bucket, "client")));
    return d?.url ? { name: d.name, url: d.url, contentType: d.contentType, pathname: d.pathname, pages: d.pageCount } : null;
  }
  if (!hit.set.matter) return null;
  const [f] = await db!.select().from(shareFiles).where(eq(shareFiles.id, id));
  if (!f?.url) return null;
  const [folder] = await db!.select().from(shareFolders).where(and(eq(shareFolders.id, f.folderId), eq(shareFolders.matter, hit.set.matter), eq(shareFolders.type, "client")));
  return folder ? { name: f.filename, url: f.url, contentType: f.contentType, pathname: f.pathname, pages: f.pageCount } : null;
}
