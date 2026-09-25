"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { discoverySets, discoveryDocs, discoveryMarks, exhibitSets, exhibitDocs } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { extractPdfText } from "@/lib/exhibit-review/text";
import { getOrCreateCaseForMatter } from "@/lib/cases";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) throw new Error("Not allowed.");
  await ensureDiscoveryTables();
  return session;
}

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Combined source-PDF budget for one assembly, so a save can't OOM the function. */
const MAX_ASSEMBLY_SOURCE_BYTES = 200 * 1024 * 1024;

export type PageRef = { docId: number; page: number };

/* -------------------------------- sets --------------------------------- */

export type DiscoverySetInput = { name: string; matter?: string; causeNumber?: string; court?: string };

/**
 * Create a discovery case — and, by default, the matching exhibit set for the
 * same matter, so the two reviewers are born linked. An existing exhibit set
 * with the same matter is linked instead of duplicated.
 */
export async function createDiscoverySet(input: DiscoverySetInput, alsoExhibit: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a case name." };
  const matter = str(input.matter, 500);
  try {
    const [row] = await db
      .insert(discoverySets)
      .values({ name, matter, causeNumber: str(input.causeNumber, 128), court: str(input.court), createdBy: session.email })
      .returning({ id: discoverySets.id });

    if (matter) {
      // Register / enrich the central case record so its info is on file once.
      await getOrCreateCaseForMatter({ matter, name, causeNumber: input.causeNumber, court: input.court }, session.email).catch(() => null);
      revalidatePath("/admin/cases");
    }
    let exhibitCreated = false;
    if (alsoExhibit && matter) {
      const existing = await db.select({ id: exhibitSets.id }).from(exhibitSets)
        .where(and(eq(exhibitSets.matter, matter), eq(exhibitSets.archived, false)));
      if (existing.length === 0) {
        await db.insert(exhibitSets).values({
          name, matter, causeNumber: str(input.causeNumber, 128), court: str(input.court), createdBy: session.email,
        });
        exhibitCreated = true;
        revalidatePath("/admin/exhibit-reviewer");
      }
    }
    await audit(session.email, "create", "discovery-set", String(row.id), `Created discovery case "${name}"`);
    revalidatePath("/admin/discovery-reviewer");
    return { ok: true as const, id: row.id, exhibitCreated };
  } catch (err) {
    console.error("[discovery-reviewer] createDiscoverySet failed:", err);
    return { ok: false as const, error: "Couldn't create the case." };
  }
}

export async function setDiscoverySetArchived(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const };
  await db.update(discoverySets).set({ archived, updatedAt: new Date() }).where(eq(discoverySets.id, id));
  await audit(session.email, "update", "discovery-set", String(id), archived ? "Archived discovery case" : "Restored discovery case");
  revalidatePath("/admin/discovery-reviewer");
  return { ok: true as const };
}

export async function deleteDiscoverySet(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const docs = await db.select({ pathname: discoveryDocs.pathname }).from(discoveryDocs).where(eq(discoveryDocs.setId, id));
    for (const d of docs) {
      if (d.pathname) { try { await del(d.pathname); } catch { /* best-effort */ } }
    }
    // Marks are deleted with the set; the assembled exhibits they produced stay
    // in the Exhibit Reviewer, which owns its own copies.
    await db.delete(discoveryMarks).where(eq(discoveryMarks.setId, id));
    await db.delete(discoveryDocs).where(eq(discoveryDocs.setId, id));
    await db.delete(discoverySets).where(eq(discoverySets.id, id));
    await audit(session.email, "delete", "discovery-set", String(id), "Deleted discovery case");
    revalidatePath("/admin/discovery-reviewer");
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] deleteDiscoverySet failed:", err);
    return { ok: false as const, error: "Couldn't delete the case." };
  }
}

/* -------------------------------- docs --------------------------------- */

export async function addDiscoveryDoc(setId: number, input: { name?: string; file: { url: string; pathname: string; contentType?: string; size?: number }; service?: { servedAt?: string; servedBy?: string; servedTo?: string } }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    let pageCount: number | null = null;
    let pageText: string[] = [];
    if (input.file.url) {
      const extracted = await extractPdfText(input.file.url, input.file.size);
      pageCount = extracted.pageCount || null;
      pageText = extracted.pages;
    }
    const [{ maxSort }] = await db
      .select({ maxSort: sql<number>`coalesce(max(${discoveryDocs.sort}), 0)` })
      .from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
    const [row] = await db
      .insert(discoveryDocs)
      .values({
        setId,
        name: str(input.name, 255) || input.file.pathname.split("/").pop() || "document",
        url: input.file.url, pathname: input.file.pathname,
        contentType: input.file.contentType ?? null, sizeBytes: input.file.size ?? null,
        pageCount, pageText,
        servedAt: str(input.service?.servedAt, 32),
        servedBy: str(input.service?.servedBy, 191),
        servedTo: str(input.service?.servedTo, 191),
        sort: Number(maxSort) + 1,
      })
      .returning({ id: discoveryDocs.id });
    revalidatePath(`/admin/discovery-reviewer/${setId}`);
    return { ok: true as const, id: row.id, pageCount };
  } catch (err) {
    console.error("[discovery-reviewer] addDiscoveryDoc failed:", err);
    return { ok: false as const, error: "Couldn't save the document." };
  }
}

/** Persist the true page count once the browser has the PDF open (covers files
 *  too large for server-side extraction at upload time). */
export async function setDiscoveryDocPageCount(docId: number, pageCount: number) {
  await guard();
  if (!db) return { ok: false as const };
  const n = Math.floor(Number(pageCount));
  if (!Number.isFinite(n) || n <= 0 || n > 50000) return { ok: false as const };
  await db.update(discoveryDocs).set({ pageCount: n }).where(eq(discoveryDocs.id, docId));
  return { ok: true as const };
}

export async function deleteDiscoveryDoc(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [doc] = await db.select().from(discoveryDocs).where(eq(discoveryDocs.id, id));
    if (!doc) return { ok: false as const };
    if (doc.pathname) { try { await del(doc.pathname); } catch { /* best-effort */ } }
    await db.delete(discoveryDocs).where(eq(discoveryDocs.id, id));
    await audit(session.email, "delete", "discovery-doc", String(id), `Deleted discovery document "${doc.name}"`);
    revalidatePath(`/admin/discovery-reviewer/${doc.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] deleteDiscoveryDoc failed:", err);
    return { ok: false as const, error: "Couldn't delete the document." };
  }
}

/* ---------------------------- designations ------------------------------ */

/** The exhibit set this discovery case files exhibits into: same matter, not
 *  archived, oldest first (the case's original set wins over later copies). */
async function linkedExhibitSet(matter: string) {
  if (!db || !matter) return null;
  const rows = await db.select().from(exhibitSets)
    .where(and(eq(exhibitSets.matter, matter), eq(exhibitSets.archived, false)))
    .orderBy(asc(exhibitSets.id)).limit(1);
  return rows[0] ?? null;
}

/** Compact "pp. 1–15, 22" description of the designated pages, per document. */
function describePages(pages: PageRef[], docNames: Map<number, string>): string {
  const byDoc = new Map<number, number[]>();
  for (const p of pages) {
    if (!byDoc.has(p.docId)) byDoc.set(p.docId, []);
    byDoc.get(p.docId)!.push(p.page);
  }
  const parts: string[] = [];
  for (const [docId, nums] of byDoc) {
    nums.sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = nums[0], prev = nums[0];
    for (const n of nums.slice(1)) {
      if (n === prev + 1) { prev = n; continue; }
      ranges.push(start === prev ? String(start) : `${start}–${prev}`);
      start = prev = n;
    }
    ranges.push(start === prev ? String(start) : `${start}–${prev}`);
    parts.push(`${docNames.get(docId) ?? `document ${docId}`} pp. ${ranges.join(", ")}`);
  }
  return parts.join("; ");
}

export type SaveDesignationInput = {
  party: "P" | "D";
  /** Exhibit number; omitted = next free number for that side. */
  number?: number;
  title?: string;
  pages: PageRef[];
};

/**
 * Turn checked discovery pages into a real exhibit: assemble the pages into a
 * new PDF, file it in the linked exhibit set (same matter), and record the
 * designation so the pages wear their P-/D- badge in the reviewer.
 */
export async function saveDesignation(setId: number, input: SaveDesignationInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
    if (!set) return { ok: false as const, error: "Case not found." };

    const party = input.party === "D" ? "D" : "P";
    const pages = (Array.isArray(input.pages) ? input.pages : [])
      .map((p) => ({ docId: Math.floor(Number(p.docId)), page: Math.floor(Number(p.page)) }))
      .filter((p) => Number.isFinite(p.docId) && Number.isFinite(p.page) && p.page >= 1);
    if (pages.length === 0) return { ok: false as const, error: "No pages selected." };
    if (pages.length > 2000) return { ok: false as const, error: "Too many pages for one exhibit (max 2000)." };

    if (!set.matter) return { ok: false as const, code: "no-matter" as const, error: "This case has no matter number, so it can't be linked to an exhibit set. Add the matter first." };
    const exhibitSet = await linkedExhibitSet(set.matter);
    if (!exhibitSet) return { ok: false as const, code: "no-exhibit-set" as const, matter: set.matter, error: `No exhibit set exists for matter ${set.matter} yet.` };

    // Number: caller's choice, else the next free number for that side across
    // the exhibit set AND this case's designations.
    const side = party === "P" ? "plaintiff" : "defendant";
    let number = Math.floor(Number(input.number));
    if (!Number.isFinite(number) || number < 1) {
      const docNums = (await db.select({ n: exhibitDocs.number }).from(exhibitDocs)
        .where(and(eq(exhibitDocs.setId, exhibitSet.id), eq(exhibitDocs.side, side))))
        .map((r) => r.n ?? 0);
      const markNums = (await db.select({ n: discoveryMarks.number }).from(discoveryMarks)
        .where(and(eq(discoveryMarks.setId, setId), eq(discoveryMarks.party, party))))
        .map((r) => r.n);
      number = Math.max(0, ...docNums, ...markNums) + 1;
    }
    const label = `${party}-${number}`;

    // Pull each source document once and copy the chosen pages in order.
    const docIds = [...new Set(pages.map((p) => p.docId))];
    const docs = await db.select().from(discoveryDocs)
      .where(eq(discoveryDocs.setId, setId));
    const byId = new Map(docs.map((d) => [d.id, d]));
    let totalBytes = 0;
    for (const id of docIds) {
      const d = byId.get(id);
      if (!d?.url) return { ok: false as const, error: "A selected document is missing its file." };
      totalBytes += d.sizeBytes ?? 0;
    }
    if (totalBytes > MAX_ASSEMBLY_SOURCE_BYTES) {
      return { ok: false as const, error: "The source documents are too large to assemble in one step. Select pages from fewer documents at a time." };
    }

    const sources = new Map<number, PDFDocument>();
    for (const id of docIds) {
      const d = byId.get(id)!;
      const res = await fetch(d.url!);
      if (!res.ok) return { ok: false as const, error: `Couldn't fetch "${d.name}".` };
      sources.set(id, await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true }));
    }
    const out = await PDFDocument.create();
    for (const p of pages) {
      const src = sources.get(p.docId)!;
      if (p.page > src.getPageCount()) return { ok: false as const, error: `Page ${p.page} is past the end of "${byId.get(p.docId)!.name}".` };
      const [copied] = await out.copyPages(src, [p.page - 1]);
      out.addPage(copied);
    }
    const bytes = await out.save();

    const blob = await put(`discovery-exhibits/${setId}/${label}.pdf`, Buffer.from(bytes), {
      access: "public", contentType: "application/pdf", addRandomSuffix: true,
    });

    // Index the assembled exhibit's text so it's searchable in the reviewer.
    const extracted = await extractPdfText(blob.url, bytes.byteLength);

    const docNames = new Map(docs.map((d) => [d.id, d.name]));
    const title = str(input.title, 255);
    const [exhibitDoc] = await db.insert(exhibitDocs).values({
      setId: exhibitSet.id,
      side,
      number,
      label,
      title,
      description: `Assembled in the Discovery Reviewer from ${describePages(pages, docNames)}.`,
      url: blob.url, pathname: blob.pathname, contentType: "application/pdf", sizeBytes: bytes.byteLength,
      pageCount: extracted.pageCount || pages.length,
      pageText: extracted.pages,
      sort: number,
    }).returning({ id: exhibitDocs.id });

    const [mark] = await db.insert(discoveryMarks).values({
      setId, party, number, label, title, pages,
      exhibitSetId: exhibitSet.id, exhibitDocId: exhibitDoc.id, createdBy: session.email,
    }).returning({ id: discoveryMarks.id });

    await audit(session.email, "create", "discovery-mark", String(mark.id), `Designated ${label} (${pages.length} page${pages.length === 1 ? "" : "s"}) in "${set.name}"`);
    revalidatePath(`/admin/discovery-reviewer/${setId}`);
    revalidatePath(`/admin/exhibit-reviewer/${exhibitSet.id}`);
    revalidatePath("/admin/exhibit-reviewer");
    return { ok: true as const, id: mark.id, label, exhibitSetId: exhibitSet.id, exhibitDocId: exhibitDoc.id, exhibitSetName: exhibitSet.name };
  } catch (err) {
    console.error("[discovery-reviewer] saveDesignation failed:", err);
    return { ok: false as const, error: "Couldn't save the exhibit." };
  }
}

/** Create the missing exhibit set for this case's matter, then the designation
 *  can be retried. Carries the discovery case's coding across. */
export async function createLinkedExhibitSet(discoverySetId: number, name?: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, discoverySetId));
    if (!set) return { ok: false as const, error: "Case not found." };
    if (!set.matter) return { ok: false as const, error: "This case has no matter number." };
    const existing = await linkedExhibitSet(set.matter);
    if (existing) return { ok: true as const, id: existing.id, name: existing.name };
    const [row] = await db.insert(exhibitSets).values({
      name: str(name, 191) || set.name, matter: set.matter, causeNumber: set.causeNumber, court: set.court, createdBy: session.email,
    }).returning({ id: exhibitSets.id });
    await audit(session.email, "create", "exhibit-set", String(row.id), `Created exhibit set for matter ${set.matter} from the Discovery Reviewer`);
    revalidatePath("/admin/exhibit-reviewer");
    revalidatePath(`/admin/discovery-reviewer/${discoverySetId}`);
    return { ok: true as const, id: row.id, name: str(name, 191) || set.name };
  } catch (err) {
    console.error("[discovery-reviewer] createLinkedExhibitSet failed:", err);
    return { ok: false as const, error: "Couldn't create the exhibit set." };
  }
}

/** Remove a designation. The assembled exhibit in the Exhibit Reviewer is
 *  removed with it (it exists only because of this designation). */
export async function deleteDesignation(markId: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [mark] = await db.select().from(discoveryMarks).where(eq(discoveryMarks.id, markId));
    if (!mark) return { ok: false as const };
    if (mark.exhibitDocId) {
      const [doc] = await db.select({ pathname: exhibitDocs.pathname }).from(exhibitDocs).where(eq(exhibitDocs.id, mark.exhibitDocId));
      if (doc?.pathname) { try { await del(doc.pathname); } catch { /* best-effort */ } }
      await db.delete(exhibitDocs).where(eq(exhibitDocs.id, mark.exhibitDocId));
      if (mark.exhibitSetId) revalidatePath(`/admin/exhibit-reviewer/${mark.exhibitSetId}`);
    }
    await db.delete(discoveryMarks).where(eq(discoveryMarks.id, markId));
    await audit(session.email, "delete", "discovery-mark", String(markId), `Removed designation ${mark.label}`);
    revalidatePath(`/admin/discovery-reviewer/${mark.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] deleteDesignation failed:", err);
    return { ok: false as const, error: "Couldn't remove the designation." };
  }
}