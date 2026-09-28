import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs, discoveryMarks, exhibitDocs } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

/**
 * Carrying the AI record onto exhibits.
 *
 * When pages are designated as an exhibit in the Discovery Reviewer, the
 * assembled PDF is a fresh file — but the firm's work on those pages (AI page
 * notes, the document's section map, its label/description) shouldn't be left
 * behind. buildCarry() remaps that record onto the exhibit's own page numbers;
 * backfillExhibitAi() applies the same mapping to exhibits assembled before
 * the record existed, using the designation's stored page list.
 *
 * Everything carried here is INTERNAL work product: it lands in columns the
 * exhibit share links never read.
 */

export type CarrySection = { from: number; to: number; title: string };

export type CarrySource = {
  name: string;
  pageNotes: string[];
  aiSections: CarrySection[];
  aiLabel: string;
  aiDescription: string;
  /** Source per-page text, for filling gaps the fresh extraction missed. */
  pageText?: string[];
};

export const carryPages = (v: unknown): string[] =>
  Array.isArray(v) ? (v as unknown[]).map((x) => (typeof x === "string" ? x : "")) : [];

export const carrySectionList = (v: unknown): CarrySection[] => {
  if (!Array.isArray(v)) return [];
  const out: CarrySection[] = [];
  for (const s of v as Array<Record<string, unknown>>) {
    const from = Math.floor(Number(s?.from)), to = Math.floor(Number(s?.to));
    const title = typeof s?.title === "string" ? s.title.trim() : "";
    if (Number.isFinite(from) && Number.isFinite(to) && from >= 1 && to >= from && title) out.push({ from, to, title });
  }
  return out;
};

export type CarryResult = {
  /** One entry per assembled exhibit page, aligned to the page order given. */
  notes: string[];
  /** Section map remapped to the exhibit's own page numbers. */
  sections: CarrySection[];
  /** Source document's AI label/description — only when the exhibit comes from a single document. */
  aiLabel: string;
  aiDescription: string;
  /** Freshly extracted text with per-page fallback to the source index (a page
   *  the new extraction couldn't read may still be indexed at the source). */
  textFor: (extractedPages: string[]) => string[];
};

export function buildCarry(pages: { docId: number; page: number }[], byId: Map<number, CarrySource>): CarryResult {
  const notes = pages.map((p) => byId.get(p.docId)?.pageNotes[p.page - 1] ?? "");

  // Title each assembled page from the source section containing it; when the
  // exhibit mixes documents, prefix with the document name so runs from
  // different files never blur together.
  const multi = new Set(pages.map((p) => p.docId)).size > 1;
  const titles = pages.map((p) => {
    const src = byId.get(p.docId);
    if (!src) return "";
    const sec = src.aiSections.find((s) => s.from <= p.page && p.page <= s.to);
    if (!sec) return "";
    return (multi && src.name ? `${src.name} — ${sec.title}` : sec.title).slice(0, 200);
  });
  const sections: CarrySection[] = [];
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    if (!t) continue;
    const last = sections[sections.length - 1];
    if (last && last.title === t && last.to === i) last.to = i + 1;
    else if (sections.length < 80) sections.push({ from: i + 1, to: i + 1, title: t });
  }

  const ids = [...new Set(pages.map((p) => p.docId))];
  const single = ids.length === 1 ? byId.get(ids[0]) : undefined;

  return {
    notes,
    sections,
    aiLabel: single?.aiLabel ?? "",
    aiDescription: single?.aiDescription ?? "",
    textFor: (extractedPages) =>
      pages.map((p, i) => {
        const fresh = extractedPages[i] ?? "";
        return fresh.trim() ? fresh : byId.get(p.docId)?.pageText?.[p.page - 1] ?? "";
      }),
  };
}

/**
 * One-time catch-up for exhibits assembled before the carry existed: rebuild
 * their AI record from the designation's stored page list and the source
 * documents' current notes. Only rows whose record is still empty are touched,
 * so after the first pass this is a cheap no-op. Never throws — a failed
 * backfill must not break the Exhibit Reviewer page.
 */
export async function backfillExhibitAi(exhibitSetId: number): Promise<void> {
  if (!db) return;
  try {
    await ensureDiscoveryTables(); // the AI columns may predate this deploy's first action
    const marks = await db
      .select({ setId: discoveryMarks.setId, pages: discoveryMarks.pages, exhibitDocId: discoveryMarks.exhibitDocId })
      .from(discoveryMarks)
      .where(and(eq(discoveryMarks.exhibitSetId, exhibitSetId), isNotNull(discoveryMarks.exhibitDocId)));
    if (!marks.length) return;

    const targets = await db
      .select({ id: exhibitDocs.id, pageNotes: exhibitDocs.pageNotes, aiSections: exhibitDocs.aiSections, aiLabel: exhibitDocs.aiLabel, aiDescription: exhibitDocs.aiDescription })
      .from(exhibitDocs)
      .where(inArray(exhibitDocs.id, marks.map((m) => m.exhibitDocId!)));
    const empty = new Set(
      targets
        .filter((d) => !d.aiLabel && !d.aiDescription && carrySectionList(d.aiSections).length === 0 && carryPages(d.pageNotes).every((n) => !n))
        .map((d) => d.id),
    );
    const todo = marks.filter((m) => m.exhibitDocId != null && empty.has(m.exhibitDocId));
    if (!todo.length) return;

    // Source documents, without their (large) page text — the backfill leaves
    // the exhibit's already-extracted text alone.
    const setIds = [...new Set(todo.map((m) => m.setId))];
    const docs = await db
      .select({ id: discoveryDocs.id, name: discoveryDocs.name, pageNotes: discoveryDocs.pageNotes, aiSections: discoveryDocs.aiSections, aiLabel: discoveryDocs.aiLabel, aiDescription: discoveryDocs.aiDescription })
      .from(discoveryDocs)
      .where(inArray(discoveryDocs.setId, setIds));
    const byId = new Map<number, CarrySource>(
      docs.map((d) => [d.id, { name: d.name, pageNotes: carryPages(d.pageNotes), aiSections: carrySectionList(d.aiSections), aiLabel: d.aiLabel, aiDescription: d.aiDescription }]),
    );

    for (const m of todo) {
      const pages = (Array.isArray(m.pages) ? (m.pages as Array<{ docId: number; page: number }>) : [])
        .filter((p) => Number.isFinite(Number(p?.docId)) && Number.isFinite(Number(p?.page)) && Number(p.page) >= 1);
      if (!pages.length) continue;
      const carry = buildCarry(pages, byId);
      if (!carry.aiLabel && !carry.aiDescription && carry.sections.length === 0 && carry.notes.every((n) => !n)) continue;
      await db
        .update(exhibitDocs)
        .set({ pageNotes: carry.notes, aiSections: carry.sections, aiLabel: carry.aiLabel, aiDescription: carry.aiDescription })
        .where(eq(exhibitDocs.id, m.exhibitDocId!));
    }
  } catch (err) {
    console.error("[exhibit-review] backfillExhibitAi failed:", err);
  }
}
