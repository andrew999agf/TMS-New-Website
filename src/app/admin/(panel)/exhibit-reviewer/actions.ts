"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, max } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, exhibitWitnesses, exhibitClaims, exhibitElements } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { extractPdfText } from "@/lib/exhibit-review/text";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) throw new Error("Not allowed.");
  return session;
}

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const SIDES = new Set(["plaintiff", "defendant", "joint"]);
const side = (v: unknown) => (SIDES.has(String(v)) ? String(v) : "plaintiff");
const PRIORITIES = new Set(["none", "green", "yellow", "red"]);
const priority = (v: unknown) => (PRIORITIES.has(String(v)) ? String(v) : "none");
const STATUSES = new Set(["none", "admitted", "pending", "excluded"]);
const trialStatus = (v: unknown) => (STATUSES.has(String(v)) ? String(v) : "none");
const FOUNDATIONS = new Set(["business-records-affidavit", "certified-record", "self-authenticating", "stipulated"]);
const ids = (v: unknown): number[] => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isFinite(n)))] : []);
const foundations = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(String).filter((s) => FOUNDATIONS.has(s)))] : []);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

/* ------------------------------- sets ---------------------------------- */

export type SetInput = { name: string; matter?: string; causeNumber?: string; court?: string; notes?: string };

export async function createExhibitSet(input: SetInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a case name." };
  try {
    const [row] = await db
      .insert(exhibitSets)
      .values({
        name,
        matter: str(input.matter, 500),
        causeNumber: str(input.causeNumber, 128),
        court: str(input.court),
        notes: str(input.notes, 4000),
        createdBy: session.email,
      })
      .returning({ id: exhibitSets.id });
    await audit(session.email, "create", "exhibit-set", String(row.id), `Created exhibit set "${name}"`);
    revalidatePath("/admin/exhibit-reviewer");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[exhibit-reviewer] createExhibitSet failed:", err);
    return { ok: false as const, error: "Couldn't create the set. Run Settings → Database updates, then try again." };
  }
}

export async function updateExhibitSet(id: number, input: SetInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a case name." };
  try {
    await db
      .update(exhibitSets)
      .set({
        name,
        matter: str(input.matter, 500),
        causeNumber: str(input.causeNumber, 128),
        court: str(input.court),
        notes: str(input.notes, 4000),
        updatedAt: new Date(),
      })
      .where(eq(exhibitSets.id, id));
    await audit(session.email, "update", "exhibit-set", String(id), `Updated exhibit set "${name}"`);
    revalidatePath("/admin/exhibit-reviewer");
    revalidatePath(`/admin/exhibit-reviewer/${id}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the set." };
  }
}

export async function setExhibitSetArchived(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(exhibitSets).set({ archived, updatedAt: new Date() }).where(eq(exhibitSets.id, id));
    await audit(session.email, "update", "exhibit-set", String(id), archived ? "Archived set" : "Restored set");
    revalidatePath("/admin/exhibit-reviewer");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't update the set." };
  }
}

export async function deleteExhibitSet(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const docs = await db.select({ pathname: exhibitDocs.pathname }).from(exhibitDocs).where(eq(exhibitDocs.setId, id));
    for (const d of docs) if (d.pathname) { try { await del(d.pathname); } catch { /* best-effort */ } }
    await db.delete(exhibitDocs).where(eq(exhibitDocs.setId, id));
    await db.delete(exhibitSets).where(eq(exhibitSets.id, id));
    await audit(session.email, "delete", "exhibit-set", String(id), "Deleted set and its exhibits");
    revalidatePath("/admin/exhibit-reviewer");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't delete the set." };
  }
}

/* ------------------------------- docs ---------------------------------- */

export type DocInput = {
  side?: string;
  number?: number | null;
  label?: string;
  title?: string;
  description?: string;
  priority?: string;
  trialStatus?: string;
  bates?: string;
  file?: { url: string; pathname: string; contentType?: string; size?: number };
};

/**
 * Add one exhibit PDF to a set. Text is pulled out of the file here (server
 * side) so cross-set and in-document search work on the real content. `sort` is
 * seeded from the exhibit number so the list falls into numeric order by
 * default, with unnumbered items after.
 */
export async function addExhibitDoc(setId: number, input: DocInput) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const n = input.number ?? null;
    let pageCount: number | null = null;
    let pageText: string[] = [];
    if (input.file?.url) {
      const extracted = await extractPdfText(input.file.url);
      pageCount = extracted.pageCount || null;
      pageText = extracted.pages;
    }
    const [row] = await db
      .insert(exhibitDocs)
      .values({
        setId,
        side: side(input.side),
        number: n,
        label: str(input.label, 64),
        title: str(input.title, 255),
        description: str(input.description, 2000),
        priority: priority(input.priority),
        trialStatus: trialStatus(input.trialStatus),
        bates: str(input.bates, 128),
        url: input.file?.url ?? null,
        pathname: input.file?.pathname ?? null,
        contentType: input.file?.contentType ?? null,
        sizeBytes: input.file?.size ?? null,
        pageCount,
        pageText,
        // Numeric order first (nulls large so they trail), stable across a batch.
        sort: n ?? 100000,
      })
      .returning({ id: exhibitDocs.id });
    revalidatePath(`/admin/exhibit-reviewer/${setId}`);
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[exhibit-reviewer] addExhibitDoc failed:", err);
    return { ok: false as const, error: "Couldn't save the exhibit." };
  }
}

export async function updateExhibitDoc(id: number, patch: { side?: string; number?: number | null; label?: string; title?: string; description?: string; priority?: string; trialStatus?: string; bates?: string; witnessIds?: number[]; foundation?: string[]; elementIds?: number[]; notes?: string }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const set: Record<string, unknown> = {};
    if (patch.side !== undefined) set.side = side(patch.side);
    if (patch.number !== undefined) { set.number = patch.number === null ? null : num(patch.number); set.sort = (patch.number === null ? null : num(patch.number)) ?? 100000; }
    if (patch.label !== undefined) set.label = str(patch.label, 64);
    if (patch.title !== undefined) set.title = str(patch.title, 255);
    if (patch.description !== undefined) set.description = str(patch.description, 2000);
    if (patch.priority !== undefined) set.priority = priority(patch.priority);
    if (patch.trialStatus !== undefined) set.trialStatus = trialStatus(patch.trialStatus);
    if (patch.bates !== undefined) set.bates = str(patch.bates, 128);
    if (patch.witnessIds !== undefined) set.witnessIds = ids(patch.witnessIds);
    if (patch.foundation !== undefined) set.foundation = foundations(patch.foundation);
    if (patch.elementIds !== undefined) set.elementIds = ids(patch.elementIds);
    if (patch.notes !== undefined) set.notes = str(patch.notes, 4000);
    if (Object.keys(set).length === 0) return { ok: true as const };
    const [row] = await db.update(exhibitDocs).set(set).where(eq(exhibitDocs.id, id)).returning({ setId: exhibitDocs.setId });
    if (row) revalidatePath(`/admin/exhibit-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the exhibit." };
  }
}

export async function deleteExhibitDoc(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.select({ setId: exhibitDocs.setId, pathname: exhibitDocs.pathname }).from(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (row?.pathname) { try { await del(row.pathname); } catch { /* best-effort */ } }
    await db.delete(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (row) revalidatePath(`/admin/exhibit-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the exhibit." };
  }
}

/* ------------------------------ search --------------------------------- */

export type SetSearchHit = {
  docId: number;
  side: string;
  label: string;
  title: string;
  /** 1-based page numbers where the term appears in the document body. */
  pages: number[];
  /** A short context snippet around the first match. */
  snippet: string;
  /** True when the match was on the number/title/bates rather than body text. */
  metaOnly: boolean;
};

const snippetAround = (text: string, term: string): string => {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return "";
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + term.length + 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
};

/** Search an entire set: matches the exhibit number/label/title/Bates AND the
 *  words inside every PDF, returning which exhibits (and pages) hit. */
export async function searchExhibitSet(setId: number, query: string): Promise<SetSearchHit[]> {
  await guard();
  if (!db) return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  try {
    const docs = await db.select().from(exhibitDocs).where(eq(exhibitDocs.setId, setId)).orderBy(asc(exhibitDocs.sort));
    const hits: SetSearchHit[] = [];
    for (const d of docs) {
      const meta = `${d.label} ${d.title} ${d.description} ${d.bates}`.toLowerCase();
      const metaHit = meta.includes(q);
      const pages: number[] = [];
      let snippet = "";
      const text = Array.isArray(d.pageText) ? (d.pageText as string[]) : [];
      for (let i = 0; i < text.length; i++) {
        if ((text[i] ?? "").toLowerCase().includes(q)) {
          pages.push(i + 1);
          if (!snippet) snippet = snippetAround(text[i], q);
        }
      }
      if (metaHit || pages.length) {
        hits.push({ docId: d.id, side: d.side, label: d.label, title: d.title, pages, snippet, metaOnly: pages.length === 0 });
      }
    }
    return hits;
  } catch {
    return [];
  }
}

/** The per-page text of one document, for in-document search. */
export async function getDocPages(docId: number): Promise<string[]> {
  await guard();
  if (!db) return [];
  try {
    const [row] = await db.select({ pageText: exhibitDocs.pageText, setId: exhibitDocs.setId }).from(exhibitDocs).where(eq(exhibitDocs.id, docId));
    return Array.isArray(row?.pageText) ? (row!.pageText as string[]) : [];
  } catch {
    return [];
  }
}

/* -------------------- witness & element catalogs ----------------------- */
// The set's reusable pick-lists: witnesses an exhibit can be sponsored through,
// and the causes of action with their elements. Built up as you go, then chosen
// per exhibit from a dropdown.

const revalSet = (setId: number) => revalidatePath(`/admin/exhibit-reviewer/${setId}`);

export async function addExhibitWitness(setId: number, name: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = str(name, 191);
  if (!clean) return { ok: false as const, error: "Enter a name." };
  try {
    const [{ n } = { n: 0 }] = await db.select({ n: max(exhibitWitnesses.sort) }).from(exhibitWitnesses).where(eq(exhibitWitnesses.setId, setId));
    const [row] = await db.insert(exhibitWitnesses).values({ setId, name: clean, sort: (n ?? 0) + 1 }).returning({ id: exhibitWitnesses.id });
    revalSet(setId);
    return { ok: true as const, id: row.id };
  } catch {
    return { ok: false as const, error: "Couldn't add the witness." };
  }
}

export async function deleteExhibitWitness(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.delete(exhibitWitnesses).where(eq(exhibitWitnesses.id, id)).returning({ setId: exhibitWitnesses.setId });
    if (row) revalSet(row.setId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the witness." };
  }
}

export async function addExhibitClaim(setId: number, name: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = str(name, 255);
  if (!clean) return { ok: false as const, error: "Enter a cause of action." };
  try {
    const [{ n } = { n: 0 }] = await db.select({ n: max(exhibitClaims.sort) }).from(exhibitClaims).where(eq(exhibitClaims.setId, setId));
    const [row] = await db.insert(exhibitClaims).values({ setId, name: clean, sort: (n ?? 0) + 1 }).returning({ id: exhibitClaims.id });
    revalSet(setId);
    return { ok: true as const, id: row.id };
  } catch {
    return { ok: false as const, error: "Couldn't add the cause of action." };
  }
}

export async function deleteExhibitClaim(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.delete(exhibitElements).where(eq(exhibitElements.claimId, id));
    const [row] = await db.delete(exhibitClaims).where(eq(exhibitClaims.id, id)).returning({ setId: exhibitClaims.setId });
    if (row) revalSet(row.setId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the cause of action." };
  }
}

export async function addExhibitElement(setId: number, claimId: number, text: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = str(text, 500);
  if (!clean) return { ok: false as const, error: "Enter an element." };
  try {
    const [{ n } = { n: 0 }] = await db.select({ n: max(exhibitElements.sort) }).from(exhibitElements).where(eq(exhibitElements.claimId, claimId));
    const [row] = await db.insert(exhibitElements).values({ setId, claimId, text: clean, sort: (n ?? 0) + 1 }).returning({ id: exhibitElements.id });
    revalSet(setId);
    return { ok: true as const, id: row.id };
  } catch {
    return { ok: false as const, error: "Couldn't add the element." };
  }
}

export async function deleteExhibitElement(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.delete(exhibitElements).where(eq(exhibitElements.id, id)).returning({ setId: exhibitElements.setId });
    if (row) revalSet(row.setId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the element." };
  }
}
