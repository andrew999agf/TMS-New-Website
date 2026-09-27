"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { discoverySets, discoveryDocs, discoveryMarks, discoveryAnnotations, exhibitSets, exhibitDocs, shareFolders, shareDirs, shareRecipients, shareFiles, caseHub, productionDocs, productions, type CaseParty } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { extractPdfText } from "@/lib/exhibit-review/text";
import { getOrCreateCaseForMatter } from "@/lib/cases";
import { expiryDaysForType } from "@/lib/share/types";
import { stampToPdf, mergeProductionPdf, buildProductionLetter, batesLabel, ordinal, type StampStyle } from "@/lib/production/build";
import { buildStagedPdf, compressPageRanges, type RedactionMark } from "@/lib/production/subset";
import { FIRM } from "@/lib/firm";
import { randomBytes } from "crypto";

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

export async function addDiscoveryDoc(setId: number, input: { name?: string; file: { url: string; pathname: string; contentType?: string; size?: number }; service?: { servedAt?: string; servedBy?: string; servedTo?: string }; bucket?: "opposing" | "client" }) {
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
        bucket: input.bucket === "client" ? "client" : "opposing",
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

/** Change a designation's party, number, or title — the linked exhibit in the
 *  Exhibit Reviewer moves with it. Pages stay as designated. */
export async function updateDesignation(markId: number, input: { party: "P" | "D"; number: number; title?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [mark] = await db.select().from(discoveryMarks).where(eq(discoveryMarks.id, markId));
    if (!mark) return { ok: false as const, error: "Designation not found." };
    const party = input.party === "D" ? "D" : "P";
    const number = Math.max(1, Math.floor(Number(input.number)) || mark.number);
    const label = `${party}-${number}`;
    const title = str(input.title, 255);
    await db.update(discoveryMarks).set({ party, number, label, title }).where(eq(discoveryMarks.id, markId));
    if (mark.exhibitDocId) {
      await db.update(exhibitDocs).set({ side: party === "P" ? "plaintiff" : "defendant", number, label, title, sort: number })
        .where(eq(exhibitDocs.id, mark.exhibitDocId));
      if (mark.exhibitSetId) revalidatePath(`/admin/exhibit-reviewer/${mark.exhibitSetId}`);
    }
    await audit(session.email, "update", "discovery-mark", String(markId), `Designation ${mark.label} \u2192 ${label}`);
    revalidatePath(`/admin/discovery-reviewer/${mark.setId}`);
    return { ok: true as const, label };
  } catch (err) {
    console.error("[discovery-reviewer] updateDesignation failed:", err);
    return { ok: false as const, error: "Couldn't update the designation." };
  }
}

/** Move a document between the opposing-production pile and the
 *  received-from-client pile (for files dropped into the wrong bucket). */
export async function setDiscoveryDocBucket(docId: number, bucket: "opposing" | "client") {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [doc] = await db.select().from(discoveryDocs).where(eq(discoveryDocs.id, docId));
    if (!doc) return { ok: false as const, error: "Document not found." };
    const target = bucket === "client" ? "client" : "opposing";
    await db.update(discoveryDocs).set({ bucket: target }).where(eq(discoveryDocs.id, docId));
    await audit(session.email, "update", "discovery-doc", String(docId), `Moved "${doc.name}" to the ${target === "client" ? "received-from-client" : "opposing-production"} bucket`);
    revalidatePath(`/admin/discovery-reviewer/${doc.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] setDiscoveryDocBucket failed:", err);
    return { ok: false as const };
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

const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");

/* ------------------- request documents from the client ------------------- */

/**
 * Read a served discovery-requests document and work out how many requests it
 * contains and their numbers — including later sets that continue the
 * numbering (a second set may run 15–22). The firm confirms or corrects the
 * result before any folders are created.
 */
export async function parseDiscoveryRequestDoc(file: { url: string; size?: number }) {
  await guard();
  try {
    const extracted = await extractPdfText(file.url, file.size);
    const text = extracted.pages.join("\n");
    if (!text.trim()) return { ok: true as const, prefix: "RFP", numbers: [] as number[], note: "No text layer found (scanned document?) — enter the request numbers below." };

    const collect = (re: RegExp) => {
      const out = new Set<number>();
      for (const m of text.matchAll(re)) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 999) out.add(n);
      }
      return [...out].sort((a, b) => a - b);
    };
    const candidates: { prefix: string; numbers: number[] }[] = [
      { prefix: "RFP", numbers: collect(/REQUEST\s+FOR\s+PRODUCTION\s+(?:NO\.?|NUMBER|#)?\s*(\d{1,3})/gi) },
      { prefix: "ROG", numbers: collect(/INTERROGATORY\s+(?:NO\.?|NUMBER|#)?\s*(\d{1,3})/gi) },
      { prefix: "RFA", numbers: collect(/REQUEST\s+FOR\s+ADMISSION\s+(?:NO\.?|NUMBER|#)?\s*(\d{1,3})/gi) },
      { prefix: "RFD", numbers: collect(/REQUEST\s+FOR\s+DISCLOSURE\s+(?:NO\.?|NUMBER|#)?\s*(\d{1,3})/gi) },
    ];
    let best = candidates.reduce((a, b) => (b.numbers.length > a.numbers.length ? b : a));
    if (best.numbers.length === 0) {
      best = { prefix: "RFP", numbers: collect(/REQUEST\s+(?:NO\.?|NUMBER|#)\s*(\d{1,3})/gi) };
    }
    return { ok: true as const, prefix: best.prefix, numbers: best.numbers, note: best.numbers.length === 0 ? "Couldn't identify request numbers automatically — enter them below." : undefined };
  } catch (err) {
    console.error("[discovery-reviewer] parseDiscoveryRequestDoc failed:", err);
    return { ok: true as const, prefix: "RFP", numbers: [] as number[], note: "Couldn't read the document — enter the request numbers below." };
  }
}

export type ClientRequestInput = {
  mode: "rfp" | "general";
  clientEmail: string;
  clientName?: string;
  /** Hard discovery-response deadline and the earlier client-return deadline (YYYY-MM-DD). */
  responseDue?: string;
  clientDue?: string;
  /** rfp mode: the served requests document (already uploaded to storage). */
  requestFile?: { url: string; pathname: string; name?: string; size?: number };
  prefix?: string;
  numbers?: number[];
};

/**
 * "Request documents from client": creates the secure client drop folder for
 * this case and the private upload link. In rfp mode, one sub-folder per
 * request (RFP 15 … RFP 22) plus the attached requests document the client
 * reviews side-by-side while filing.
 */
export async function createClientDocRequest(setId: number, input: ClientRequestInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const email = (input.clientEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Enter the client's email address." };
  try {
    const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
    if (!set) return { ok: false as const, error: "Case not found." };

    const rfp = input.mode === "rfp";
    const prefix = (input.prefix ?? "RFP").trim().slice(0, 8).toUpperCase() || "RFP";
    const numbers = rfp
      ? [...new Set((input.numbers ?? []).map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 1 && n <= 999))].sort((a, b) => a - b)
      : [];
    if (rfp && numbers.length === 0) return { ok: false as const, error: "Enter at least one request number." };
    if (rfp && !input.requestFile?.url) return { ok: false as const, error: "Upload the discovery requests document first." };

    // Caption details from the central case record, when it has real names.
    let plaintiff = "", defendant = "", county = "";
    if (set.matter) {
      try {
        const [hubRow] = await db.select().from(caseHub).where(eq(caseHub.matter, set.matter));
        if (hubRow) {
          county = hubRow.county;
          const parties = ((hubRow.parties as CaseParty[]) ?? []).filter((party) => party?.name && party.name !== party.role);
          plaintiff = parties.filter((party) => party.role === "Plaintiff").map((party) => party.name).join("; ");
          defendant = parties.filter((party) => party.role === "Defendant").map((party) => party.name).join("; ");
        }
      } catch { /* hub optional */ }
    }

    const range = numbers.length ? (numbers.length === 1 ? `${prefix} ${numbers[0]}` : `${prefix} ${numbers[0]}\u2013${numbers[numbers.length - 1]}`) : "";
    const folderName = rfp
      ? `${set.name} \u2014 Discovery Responses (${range})`
      : `${set.name} \u2014 Documents from Client`;

    const [folder] = await db.insert(shareFolders).values({
      caseNumber: set.causeNumber,
      name: folderName.slice(0, 191),
      matter: set.matter,
      court: set.court,
      county,
      plaintiff,
      defendant,
      type: "client",
      requireAuth: true,
      createdBy: session.email,
      discoveryRequestUrl: rfp ? input.requestFile!.url : null,
      discoveryRequestPathname: rfp ? input.requestFile!.pathname : null,
      discoveryRequestName: rfp ? (input.requestFile!.name ?? "Discovery requests").slice(0, 255) : null,
      discoveryPrefix: rfp ? prefix : "",
      discoveryNumbers: numbers,
      responseDue: isoDay(input.responseDue),
      clientDue: isoDay(input.clientDue),
    }).returning({ id: shareFolders.id });

    if (rfp) {
      for (const n of numbers) {
        await db.insert(shareDirs).values({ folderId: folder.id, path: `${prefix} ${n}`, createdBy: session.email });
      }
    }

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + expiryDaysForType("client") * 86_400_000);
    await db.insert(shareRecipients).values({
      folderId: folder.id, email, name: (input.clientName ?? "").trim().slice(0, 191),
      token, permission: "upload", kind: "client", invitedBy: session.email, expiresAt,
    });

    await audit(session.email, "create", "share-folder", String(folder.id), `Client document request (${rfp ? range : "general"}) for "${set.name}"`);
    revalidatePath("/admin/share-folders");
    revalidatePath(`/admin/discovery-reviewer/${setId}`);
    return { ok: true as const, folderId: folder.id, shareUrl: `/share/${token}`, folderUrl: `/admin/share-folders/${folder.id}`, folders: numbers.map((n) => `${prefix} ${n}`) };
  } catch (err) {
    console.error("[discovery-reviewer] createClientDocRequest failed:", err);
    return { ok: false as const, error: "Couldn't create the request. Run Settings \u2192 Database updates once, then try again." };
  }
}

/** Edit a document request's deadlines from the tracker list. */
export async function updateRequestDeadlines(folderId: number, responseDue: string, clientDue: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(shareFolders).set({ responseDue: isoDay(responseDue), clientDue: isoDay(clientDue), updatedAt: new Date() }).where(eq(shareFolders.id, folderId));
    await audit(session.email, "update", "share-folder", String(folderId), "Updated document-request deadlines");
    revalidatePath("/admin/share-folders");
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] updateRequestDeadlines failed:", err);
    return { ok: false as const, error: "Couldn't save the deadlines." };
  }
}

/* ------------------------ review annotations ---------------------------- */

export type AnnotationKind = "highlight" | "redact" | "note";
export type FileAnnotation = {
  id: number;
  page: number;
  kind: AnnotationKind;
  rect: { x: number; y: number; w: number; h: number };
  note: string;
};

const ANNOTATION_KINDS = new Set<AnnotationKind>(["highlight", "redact", "note"]);
const clamp01 = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));
const validFileKey = (k: string) => /^(doc|share):\d{1,10}$/.test(k);

function shapeAnnotation(a: typeof discoveryAnnotations.$inferSelect): FileAnnotation {
  const r = (a.rect ?? {}) as { x?: number; y?: number; w?: number; h?: number };
  return { id: a.id, page: a.page, kind: a.kind as AnnotationKind, rect: { x: r.x ?? 0, y: r.y ?? 0, w: r.w ?? 0, h: r.h ?? 0 }, note: a.note };
}

/** All marks on one client document, for the reader overlay. */
export async function listFileAnnotations(setId: number, fileKey: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!validFileKey(fileKey)) return { ok: false as const, error: "Bad file key." };
  try {
    const rows = await db.select().from(discoveryAnnotations)
      .where(and(eq(discoveryAnnotations.setId, setId), eq(discoveryAnnotations.fileKey, fileKey)))
      .orderBy(asc(discoveryAnnotations.id));
    return { ok: true as const, annotations: rows.map(shapeAnnotation) };
  } catch (err) {
    console.error("[discovery-reviewer] listFileAnnotations failed:", err);
    return { ok: false as const, error: "Couldn't load the marks." };
  }
}

/**
 * Drop one mark on a page. Rects are normalized 0–1 from the page's top-left,
 * so they survive any zoom level. Highlights and notes stay internal work
 * product; redactions burn into the copy that goes out when the pages are
 * staged for production.
 */
export async function addDiscoveryAnnotation(
  setId: number,
  fileKey: string,
  page: number,
  kind: AnnotationKind,
  rect: { x: number; y: number; w: number; h: number },
  note?: string,
) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!validFileKey(fileKey)) return { ok: false as const, error: "Bad file key." };
  if (!ANNOTATION_KINDS.has(kind)) return { ok: false as const, error: "Unknown tool." };
  const p = Math.floor(Number(page));
  if (!Number.isFinite(p) || p < 1) return { ok: false as const, error: "Bad page number." };
  const x = clamp01(rect?.x), y = clamp01(rect?.y);
  const w = Math.min(clamp01(rect?.w), 1 - x), h = Math.min(clamp01(rect?.h), 1 - y);
  if (kind !== "note" && (w < 0.005 || h < 0.005)) return { ok: false as const, error: "Drag out a box first." };
  try {
    const [row] = await db.insert(discoveryAnnotations)
      .values({ setId, fileKey, page: p, kind, rect: { x, y, w, h }, note: str(note, 2000), createdBy: session.email })
      .returning();
    if (kind === "redact") await audit(session.email, "create", "discovery-annotation", String(row.id), `Redaction marked on ${fileKey} p.${p}`);
    return { ok: true as const, annotation: shapeAnnotation(row) };
  } catch (err) {
    console.error("[discovery-reviewer] addDiscoveryAnnotation failed:", err);
    return { ok: false as const, error: "Couldn't save the mark." };
  }
}

/** Eraser: remove one mark. */
export async function deleteDiscoveryAnnotation(setId: number, id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [gone] = await db.delete(discoveryAnnotations)
      .where(and(eq(discoveryAnnotations.id, id), eq(discoveryAnnotations.setId, setId)))
      .returning({ id: discoveryAnnotations.id, kind: discoveryAnnotations.kind });
    if (!gone) return { ok: false as const, error: "That mark is already gone." };
    if (gone.kind === "redact") await audit(session.email, "delete", "discovery-annotation", String(id), "Redaction mark removed");
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] deleteDiscoveryAnnotation failed:", err);
    return { ok: false as const, error: "Couldn't remove the mark." };
  }
}

/* ----------------------- production pipeline ---------------------------- */

/** Combined source budget per staging batch, so stamping can't OOM. */
const MAX_STAGE_BYTES = 150 * 1024 * 1024;

/**
 * "Intend to produce": Bates-stamp the selected client documents and move
 * them to the staged (pale yellow) column. Numbers run per page, continuing
 * wherever the case's numbering left off.
 */
export type StageSelection = { key: string; pages?: number[] };

export async function stageForProduction(setId: number, selectionsIn: (string | StageSelection)[], opts: { bates: boolean; prefix?: string; start?: number; stamp?: StampStyle }) {
  // Normalize: plain keys mean "the whole document".
  const selections: StageSelection[] = (selectionsIn ?? []).map((x) => (typeof x === "string" ? { key: x } : x)).filter((x) => x && typeof x.key === "string");
  const pagesByKey = new Map(selections.map((x) => [x.key, x.pages && x.pages.length ? [...new Set(x.pages.map((p) => Math.floor(p)))].sort((a, b) => a - b) : null]));
  const sourceKeys = selections.map((x) => x.key);
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
    if (!set) return { ok: false as const, error: "Case not found." };
    const bates = opts.bates !== false;
    const prefix = bates ? (opts.prefix ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) : "";
    if (bates && !prefix) return { ok: false as const, error: "Enter the Bates prefix (e.g. the client's last name)." };

    const shareIds = [...new Set(sourceKeys.filter((k) => k.startsWith("share:")).map((k) => Math.floor(Number(k.slice(6)))).filter((n) => Number.isFinite(n)))];
    const docIds = [...new Set(sourceKeys.filter((k) => k.startsWith("doc:")).map((k) => Math.floor(Number(k.slice(4)))).filter((n) => Number.isFinite(n)))];
    if (shareIds.length + docIds.length === 0) return { ok: false as const, error: "Select at least one document." };
    if (shareIds.length + docIds.length > 300) return { ok: false as const, error: "Stage at most 300 documents per batch." };

    // Only files from this matter's client folders are eligible.
    const folders = set.matter
      ? await db.select({ id: shareFolders.id, prefix: shareFolders.discoveryPrefix }).from(shareFolders)
          .where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")))
      : [];
    const folderIds = new Set(folders.map((f) => f.id));
    type Source = { key: string; filename: string; url: string | null; contentType: string | null; sizeBytes: number | null };
    const sources: Source[] = [];
    if (shareIds.length) {
      for (const f of (await db.select().from(shareFiles).where(inArray(shareFiles.id, shareIds))).filter((f) => folderIds.has(f.folderId))) {
        sources.push({ key: `share:${f.id}`, filename: f.filename, url: f.url, contentType: f.contentType, sizeBytes: f.sizeBytes });
      }
    }
    if (docIds.length) {
      // Documents moved into the client bucket from the opposing pile.
      for (const d of (await db.select().from(discoveryDocs).where(inArray(discoveryDocs.id, docIds))).filter((d) => d.setId === setId && d.bucket === "client")) {
        sources.push({ key: `doc:${d.id}`, filename: d.name, url: d.url, contentType: d.contentType, sizeBytes: d.sizeBytes });
      }
    }
    if (sources.length === 0) return { ok: false as const, error: "Those documents aren't in this case's client pile." };
    // Page-aware coverage: a document can go over in slices, so "already
    // staged" is judged per page, not per file.
    const prior = await db.select({ k: productionDocs.sourceKey, pages: productionDocs.sourcePages }).from(productionDocs).where(eq(productionDocs.setId, setId));
    const covered = new Map<string, { all: boolean; pages: Set<number> }>();
    for (const r of prior) {
      const entry = covered.get(r.k) ?? { all: false, pages: new Set<number>() };
      const pp = Array.isArray(r.pages) ? (r.pages as number[]) : [];
      if (pp.length === 0) entry.all = true;
      else pp.forEach((p) => entry.pages.add(p));
      covered.set(r.k, entry);
    }
    // Review-stage redactions burn permanently into every staged copy.
    const annos = await db.select().from(discoveryAnnotations)
      .where(and(eq(discoveryAnnotations.setId, setId), eq(discoveryAnnotations.kind, "redact"), inArray(discoveryAnnotations.fileKey, sourceKeys)));
    const redsByKey = new Map<string, RedactionMark[]>();
    for (const a of annos) {
      const list = redsByKey.get(a.fileKey) ?? [];
      const rc = a.rect as { x?: number; y?: number; w?: number; h?: number };
      list.push({ page: a.page, rect: { x: rc.x ?? 0, y: rc.y ?? 0, w: rc.w ?? 0, h: rc.h ?? 0 } });
      redsByKey.set(a.fileKey, list);
    }
    const todo = sources.filter((f) => !covered.get(f.key)?.all);
    if (todo.length === 0) return { ok: false as const, error: "All of those documents are already staged or produced." };
    const totalBytes = todo.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0);
    if (totalBytes > MAX_STAGE_BYTES) return { ok: false as const, error: "That batch is too large to stamp at once — stage it in smaller batches." };

    // Continue the case's numbering unless the user typed a start.
    let next = Math.floor(Number(opts.start));
    if (!Number.isFinite(next) || next < 1) {
      const [{ maxEnd }] = await db.select({ maxEnd: sql<number>`coalesce(max(${productionDocs.batesEnd}), 0)` })
        .from(productionDocs).where(eq(productionDocs.setId, setId));
      next = Number(maxEnd) + 1;
    }

    // Stable order: request folder, then filename.
    todo.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    const skipped: string[] = [];
    let staged = 0;
    for (const f of todo) {
      if (!f.url) { skipped.push(`${f.filename} (no file)`); continue; }
      const cov = covered.get(f.key) ?? { all: false, pages: new Set<number>() };
      const isPdfSrc = f.contentType === "application/pdf" || /\.pdf$/i.test(f.filename);
      const requested = pagesByKey.get(f.key) ?? null;
      if (!isPdfSrc && cov.pages.size > 0) { skipped.push(`${f.filename} (already staged)`); continue; }
      const res = await fetch(f.url);
      if (!res.ok) { skipped.push(`${f.filename} (couldn't fetch)`); continue; }
      let bytes: Uint8Array = new Uint8Array(await res.arrayBuffer());
      let sourcePages: number[] = [];
      let nameSuffix = "";
      if (isPdfSrc) {
        const built = await buildStagedPdf(bytes, requested, [...cov.pages], redsByKey.get(f.key) ?? []).catch(() => null);
        if (!built) { skipped.push(`${f.filename} (those pages are already staged, or the PDF couldn't be read)`); continue; }
        bytes = built.bytes instanceof Uint8Array ? built.bytes : new Uint8Array(built.bytes);
        const isWholeFresh = built.includedPages.length === built.totalPages && cov.pages.size === 0;
        sourcePages = isWholeFresh ? [] : built.includedPages;
        if (!isWholeFresh) nameSuffix = ` (pp. ${compressPageRanges(built.includedPages)})`;
      }
      const stamped = await stampToPdf(bytes, f.contentType, f.filename, prefix, next, bates, opts.stamp);
      if (!stamped) { skipped.push(`${f.filename} (type can't be Bates-stamped yet)`); continue; }
      const blob = await put(`production/${setId}/${bates ? batesLabel(prefix, next) : f.filename.split("/").pop() || "doc"}.pdf`, Buffer.from(stamped.bytes), {
        access: "public", contentType: "application/pdf", addRandomSuffix: true,
      });
      const parts = f.filename.split("/");
      await db.insert(productionDocs).values({
        setId,
        sourceKey: f.key,
        name: (parts[parts.length - 1] || f.filename) + nameSuffix,
        requestLabel: parts.length > 1 ? parts[0] : "",
        url: blob.url, pathname: blob.pathname, contentType: "application/pdf", sizeBytes: stamped.bytes.byteLength,
        batesPrefix: prefix, batesStart: bates ? next : 0, batesEnd: bates ? next + stamped.pages - 1 : 0, pageCount: stamped.pages,
        sourcePages,
        status: "staged",
      });
      if (bates) next += stamped.pages;
      staged++;
    }
    await audit(session.email, "create", "production-docs", String(setId), `Staged ${staged} document(s) for production (${bates ? prefix : "no Bates labeling \u2014 pre-labeled"})`);
    revalidatePath(`/admin/discovery-reviewer/${setId}`);
    if (staged === 0) return { ok: false as const, error: `Nothing could be staged. ${skipped.join("; ")}` };
    return { ok: true as const, staged, skipped };
  } catch (err) {
    console.error("[discovery-reviewer] stageForProduction failed:", err);
    return { ok: false as const, error: "Couldn't stage the documents." };
  }
}

/** Take a staged document back out (before it's produced). */
export async function unstageProductionDoc(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [doc] = await db.select().from(productionDocs).where(eq(productionDocs.id, id));
    if (!doc || doc.status !== "staged") return { ok: false as const, error: "Only staged documents can be removed." };
    if (doc.pathname) { try { await del(doc.pathname); } catch { /* best-effort */ } }
    await db.delete(productionDocs).where(eq(productionDocs.id, id));
    await audit(session.email, "delete", "production-doc", String(id), `Unstaged ${batesLabel(doc.batesPrefix, doc.batesStart)}`);
    revalidatePath(`/admin/discovery-reviewer/${doc.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] unstageProductionDoc failed:", err);
    return { ok: false as const };
  }
}

/**
 * "Prepare production": assemble everything staged into the Nth production —
 * the merged Bates PDF, the cover letter, and the opposing-counsel link —
 * as a DRAFT the firm reviews before marking it produced.
 */
export async function prepareProduction(setId: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
    if (!set) return { ok: false as const, error: "Case not found." };
    const staged = (await db.select().from(productionDocs)
      .where(and(eq(productionDocs.setId, setId), eq(productionDocs.status, "staged"))))
      .sort((a, b) => a.batesStart - b.batesStart);
    if (staged.length === 0) return { ok: false as const, error: "Nothing is staged for production." };
    const totalBytes = staged.reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0);
    if (totalBytes > 200 * 1024 * 1024) return { ok: false as const, error: "This production is too large to merge into one PDF — split it into two productions." };

    const prior = await db.select({ seq: productions.seq }).from(productions).where(eq(productions.setId, setId));
    const seq = Math.max(0, ...prior.map((r) => r.seq)) + 1;
    const labeled = staged.filter((d) => d.batesPrefix && d.batesStart > 0);
    const prefix = labeled[0]?.batesPrefix ?? "";
    const from = labeled.length ? batesLabel(prefix, Math.min(...labeled.map((d) => d.batesStart))) : "";
    const to = labeled.length ? batesLabel(prefix, Math.max(...labeled.map((d) => d.batesEnd))) : "";

    // Merge in Bates order.
    const parts: Uint8Array[] = [];
    for (const d of staged) {
      if (!d.url) continue;
      const res = await fetch(d.url);
      if (!res.ok) return { ok: false as const, error: `Couldn't fetch ${batesLabel(d.batesPrefix, d.batesStart)}.` };
      parts.push(new Uint8Array(await res.arrayBuffer()));
    }
    const merged = await mergeProductionPdf(parts);

    // "1st Bates - <Client Last Name> - <date sent>"
    const lastName = (set.matter.includes("-") ? set.matter.slice(set.matter.indexOf("-") + 1) : set.name.split(/\s+/)[0] || "Client").trim();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const fileName = `${ordinal(seq)} Bates - ${lastName} - ${dateStr}.pdf`;

    const token = randomBytes(24).toString("base64url");
    const origin = process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`;
    const publicUrl = `${origin.replace(/\/$/, "")}/production/${token}`;

    const fileBlob = await put(`production/${setId}/final/${fileName}`, Buffer.from(merged), {
      access: "public", contentType: "application/pdf", addRandomSuffix: true,
    });
    const letterBytes = await buildProductionLetter({
      caseName: set.name, causeNumber: set.causeNumber, court: set.court,
      seq, batesFrom: from, batesTo: to, link: publicUrl, date: now,
    });
    const letterBlob = await put(`production/${setId}/final/${ordinal(seq)} Production Letter - ${lastName} - ${dateStr}.pdf`, Buffer.from(letterBytes), {
      access: "public", contentType: "application/pdf", addRandomSuffix: true,
    });

    const [row] = await db.insert(productions).values({
      setId, seq, label: `${ordinal(seq)} Production`,
      batesPrefix: prefix,
      batesStart: labeled.length ? Math.min(...labeled.map((d) => d.batesStart)) : 0,
      batesEnd: labeled.length ? Math.max(...labeled.map((d) => d.batesEnd)) : 0,
      letterUrl: letterBlob.url, letterPathname: letterBlob.pathname,
      fileUrl: fileBlob.url, filePathname: fileBlob.pathname, fileName,
      token, createdBy: session.email,
    }).returning({ id: productions.id });
    await db.update(productionDocs).set({ productionId: row.id })
      .where(and(eq(productionDocs.setId, setId), eq(productionDocs.status, "staged")));

    await audit(session.email, "create", "production", String(row.id), `Prepared ${ordinal(seq)} Production ${from ? `(${from}\u2013${to}) ` : ""}for "${set.name}"`);
    revalidatePath(`/admin/discovery-reviewer/${setId}`);
    return { ok: true as const, id: row.id, label: `${ordinal(seq)} Production`, from, to, letterUrl: letterBlob.url, fileUrl: fileBlob.url, fileName, publicUrl };
  } catch (err) {
    console.error("[discovery-reviewer] prepareProduction failed:", err);
    return { ok: false as const, error: "Couldn't prepare the production." };
  }
}

/** After review: the draft becomes the real Nth production (pale green). */
export async function finalizeProduction(productionId: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [row] = await db.select().from(productions).where(eq(productions.id, productionId));
    if (!row) return { ok: false as const, error: "Production not found." };
    if (row.producedAt) return { ok: true as const };
    await db.update(productions).set({ producedAt: new Date() }).where(eq(productions.id, productionId));
    await db.update(productionDocs).set({ status: "produced" }).where(eq(productionDocs.productionId, productionId));
    await audit(session.email, "update", "production", String(productionId), `Marked ${row.label} as produced`);
    revalidatePath(`/admin/discovery-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] finalizeProduction failed:", err);
    return { ok: false as const };
  }
}

/** Throw a draft production away (documents drop back to staged). */
export async function discardProductionDraft(productionId: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [row] = await db.select().from(productions).where(eq(productions.id, productionId));
    if (!row) return { ok: false as const };
    if (row.producedAt) return { ok: false as const, error: "This production was already marked produced." };
    if (row.letterPathname) { try { await del(row.letterPathname); } catch { /* best-effort */ } }
    if (row.filePathname) { try { await del(row.filePathname); } catch { /* best-effort */ } }
    await db.update(productionDocs).set({ productionId: null }).where(eq(productionDocs.productionId, productionId));
    await db.delete(productions).where(eq(productions.id, productionId));
    await audit(session.email, "delete", "production", String(productionId), `Discarded draft ${row.label}`);
    revalidatePath(`/admin/discovery-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[discovery-reviewer] discardProductionDraft failed:", err);
    return { ok: false as const };
  }
}

/** Save the pipeline's shared "Contents & notes": the table of contents that
 *  follows the client documents from received to produced, the free notes
 *  under it, and which file the page numbers refer to. */
export async function saveProductionContents(setId: number, input: { toc: string; notes: string; tocFile: string }) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    await db.update(discoverySets).set({
      prodToc: String(input.toc ?? "").slice(0, 20000),
      prodNotes: String(input.notes ?? "").slice(0, 20000),
      prodTocFile: String(input.tocFile ?? "").slice(0, 512),
      updatedAt: new Date(),
    }).where(eq(discoverySets.id, setId));
    await audit(session.email, "update", "discovery-set", String(setId), "Updated production contents/notes");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}
