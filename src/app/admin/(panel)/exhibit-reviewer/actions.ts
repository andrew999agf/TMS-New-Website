"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { exhibitSets, exhibitDocs } from "@/db/schema";
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

export async function updateExhibitDoc(id: number, patch: { side?: string; number?: number | null; label?: string; title?: string; bates?: string }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const set: Record<string, unknown> = {};
    if (patch.side !== undefined) set.side = side(patch.side);
    if (patch.number !== undefined) { set.number = patch.number === null ? null : num(patch.number); set.sort = (patch.number === null ? null : num(patch.number)) ?? 100000; }
    if (patch.label !== undefined) set.label = str(patch.label, 64);
    if (patch.title !== undefined) set.title = str(patch.title, 255);
    if (patch.bates !== undefined) set.bates = str(patch.bates, 128);
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
      const meta = `${d.label} ${d.title} ${d.bates}`.toLowerCase();
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
