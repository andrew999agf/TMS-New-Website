"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { discoverySets, discoveryDocs, discoveryMarks, exhibitSets, exhibitDocs, shareFolders, shareDirs, shareRecipients, shareFiles, caseHub, productionDocs, productions, type CaseParty } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { extractPdfText } from "@/lib/exhibit-review/text";
import { getOrCreateCaseForMatter } from "@/lib/cases";
import { expiryDaysForType } from "@/lib/share/types";
import { stampToPdf, mergeProductionPdf, buildProductionLetter, batesLabel, ordinal } from "@/lib/production/build";
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

/* ----------------------- production pipeline ---------------------------- */

/** Combined source budget per staging batch, so stamping can't OOM. */
const MAX_STAGE_BYTES = 150 * 1024 * 1024;

/**
 * "Intend to produce": Bates-stamp the selected client documents and move
 * them to the staged (pale yellow) column. Numbers run per page, continuing
 * wherever the case's numbering left off.
 */
export async function stageForProduction(setId: number, shareFileIds: number[], prefixIn: string, startIn?: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
    if (!set) return { ok: false as const, error: "Case not found." };
    const prefix = (prefixIn ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
    if (!prefix) return { ok: false as const, error: "Enter the Bates prefix (e.g. the client's last name)." };

    const ids = [...new Set(shareFileIds.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n)))];
    if (ids.length === 0) return { ok: false as const, error: "Select at least one document." };
    if (ids.length > 300) return { ok: false as const, error: "Stage at most 300 documents per batch." };

    // Only files from this matter's client folders are eligible.
    const folders = set.matter
      ? await db.select({ id: shareFolders.id, prefix: shareFolders.discoveryPrefix }).from(shareFolders)
          .where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")))
      : [];
    const folderIds = new Set(folders.map((f) => f.id));
    const files = (await db.select().from(shareFiles).where(inArray(shareFiles.id, ids)))
      .filter((f) => folderIds.has(f.folderId));
    if (files.length === 0) return { ok: false as const, error: "Those documents aren't in this case's client folders." };
    const already = new Set((await db.select({ k: productionDocs.sourceKey }).from(productionDocs).where(eq(productionDocs.setId, setId))).map((r) => r.k));
    const todo = files.filter((f) => !already.has(`share:${f.id}`));
    if (todo.length === 0) return { ok: false as const, error: "All of those documents are already staged or produced." };
    const totalBytes = todo.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0);
    if (totalBytes > MAX_STAGE_BYTES) return { ok: false as const, error: "That batch is too large to stamp at once — stage it in smaller batches." };

    // Continue the case's numbering unless the user typed a start.
    let next = Math.floor(Number(startIn));
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
      const res = await fetch(f.url);
      if (!res.ok) { skipped.push(`${f.filename} (couldn't fetch)`); continue; }
      const stamped = await stampToPdf(new Uint8Array(await res.arrayBuffer()), f.contentType, f.filename, prefix, next);
      if (!stamped) { skipped.push(`${f.filename} (type can't be Bates-stamped yet)`); continue; }
      const blob = await put(`production/${setId}/${batesLabel(prefix, next)}.pdf`, Buffer.from(stamped.bytes), {
        access: "public", contentType: "application/pdf", addRandomSuffix: true,
      });
      const parts = f.filename.split("/");
      await db.insert(productionDocs).values({
        setId,
        sourceKey: `share:${f.id}`,
        name: parts[parts.length - 1] || f.filename,
        requestLabel: parts.length > 1 ? parts[0] : "",
        url: blob.url, pathname: blob.pathname, contentType: "application/pdf", sizeBytes: stamped.bytes.byteLength,
        batesPrefix: prefix, batesStart: next, batesEnd: next + stamped.pages - 1, pageCount: stamped.pages,
        status: "staged",
      });
      next += stamped.pages;
      staged++;
    }
    await audit(session.email, "create", "production-docs", String(setId), `Staged ${staged} document(s) for production (${prefix})`);
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
    const prefix = staged[0].batesPrefix;
    const from = batesLabel(prefix, Math.min(...staged.map((d) => d.batesStart)));
    const to = batesLabel(prefix, Math.max(...staged.map((d) => d.batesEnd)));

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
      batesPrefix: prefix, batesStart: Math.min(...staged.map((d) => d.batesStart)), batesEnd: Math.max(...staged.map((d) => d.batesEnd)),
      letterUrl: letterBlob.url, letterPathname: letterBlob.pathname,
      fileUrl: fileBlob.url, filePathname: fileBlob.pathname, fileName,
      token, createdBy: session.email,
    }).returning({ id: productions.id });
    await db.update(productionDocs).set({ productionId: row.id })
      .where(and(eq(productionDocs.setId, setId), eq(productionDocs.status, "staged")));

    await audit(session.email, "create", "production", String(row.id), `Prepared ${ordinal(seq)} Production (${from}\u2013${to}) for "${set.name}"`);
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
