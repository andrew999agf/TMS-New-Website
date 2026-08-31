"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters, portalTasks, portalMessages, portalDocs, exhibitSets, exhibitDocs } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { partyToReviewerSide } from "@/lib/portal";
import { cleanMatterCode } from "@/lib/time-entry";
import { extractPdfText } from "@/lib/exhibit-review/text";
import { isVideoFile } from "@/lib/exhibit-review/media";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/case-portal", session.role, session.permissions)) throw new Error("Not allowed");
  return session;
}

const reval = (groupId?: number, matterId?: number) => {
  revalidatePath("/admin/case-portal");
  if (groupId) revalidatePath(`/admin/case-portal/${groupId}`);
  if (groupId && matterId) revalidatePath(`/admin/case-portal/${groupId}/matter/${matterId}`);
};

/* -------------------------------- groups -------------------------------- */

export async function createPortalGroup(name: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = name.trim().slice(0, 191);
  if (!clean) return { ok: false as const, error: "Enter a name for the group." };
  try {
    const [row] = await db.insert(portalGroups).values({ name: clean }).returning({ id: portalGroups.id });
    await audit(session.email, "create", "portal-group", String(row.id), clean);
    reval();
    return { ok: true as const, id: row.id };
  } catch {
    return { ok: false as const, error: "Couldn't create the group. Run Settings → Database updates once, then retry." };
  }
}

export async function renamePortalGroup(id: number, name: string) {
  await guard();
  if (!db) return { ok: false as const };
  const clean = name.trim().slice(0, 191);
  if (!clean) return { ok: false as const };
  await db.update(portalGroups).set({ name: clean }).where(eq(portalGroups.id, id));
  reval(id);
  return { ok: true as const };
}

export async function archivePortalGroup(id: number, archived: boolean) {
  await guard();
  if (!db) return { ok: false as const };
  await db.update(portalGroups).set({ archived }).where(eq(portalGroups.id, id));
  reval(id);
  return { ok: true as const };
}

/* ------------------------------- companies ------------------------------- */

export async function addPortalCompany(groupId: number, name: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = name.trim().slice(0, 191);
  if (!clean) return { ok: false as const, error: "Enter the company name." };
  await db.insert(portalCompanies).values({ groupId, name: clean });
  reval(groupId);
  return { ok: true as const };
}

export async function removePortalCompany(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [c] = await db.select().from(portalCompanies).where(eq(portalCompanies.id, id));
  if (!c) return { ok: false as const, error: "Not found." };
  // Matters keep their history — they just detach from the removed company.
  await db.update(portalMatters).set({ companyId: null }).where(eq(portalMatters.companyId, id));
  await db.delete(portalCompanies).where(eq(portalCompanies.id, id));
  reval(c.groupId);
  return { ok: true as const };
}

/* -------------------------------- matters -------------------------------- */

export async function createPortalMatter(groupId: number, input: { title: string; companyId: number | null; clioMatter: string; posture: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const title = input.title.trim().slice(0, 255);
  if (!title) return { ok: false as const, error: "Enter the matter name." };
  const posture = ["transactional", "pre-litigation", "litigation"].includes(input.posture) ? input.posture : "transactional";
  const [row] = await db
    .insert(portalMatters)
    .values({ groupId, companyId: input.companyId, title, clioMatter: cleanMatterCode(input.clioMatter), posture })
    .returning({ id: portalMatters.id });
  await audit(session.email, "create", "portal-matter", String(row.id), title);
  reval(groupId);
  return { ok: true as const, id: row.id };
}

export async function updatePortalMatter(id: number, patch: {
  title?: string; companyId?: number | null; clioMatter?: string; posture?: string; status?: string; notes?: string; shareFolderId?: number | null;
}) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [cur] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, id));
  if (!cur) return { ok: false as const, error: "Matter not found." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 255);
  if (patch.companyId !== undefined) set.companyId = patch.companyId;
  if (patch.clioMatter !== undefined) set.clioMatter = cleanMatterCode(patch.clioMatter);
  if (patch.posture !== undefined && ["transactional", "pre-litigation", "litigation"].includes(patch.posture)) set.posture = patch.posture;
  if (patch.status !== undefined && ["open", "closed"].includes(patch.status)) set.status = patch.status;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.shareFolderId !== undefined) set.shareFolderId = patch.shareFolderId;
  await db.update(portalMatters).set(set).where(eq(portalMatters.id, id));
  reval(cur.groupId, id);
  return { ok: true as const };
}

/* --------------------------------- tasks --------------------------------- */

export async function addPortalTask(matterId: number, kind: "client" | "firm", title: string) {
  await guard();
  if (!db) return { ok: false as const };
  const clean = title.trim().slice(0, 2000);
  if (!clean) return { ok: false as const };
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m) return { ok: false as const };
  await db.insert(portalTasks).values({ matterId, kind: kind === "client" ? "client" : "firm", title: clean });
  reval(m.groupId, matterId);
  return { ok: true as const };
}

export async function togglePortalTask(id: number, done: boolean) {
  await guard();
  if (!db) return { ok: false as const };
  const [t] = await db.update(portalTasks).set({ done, doneAt: done ? new Date() : null }).where(eq(portalTasks.id, id)).returning({ matterId: portalTasks.matterId });
  if (t) { const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, t.matterId)); reval(m?.groupId, t.matterId); }
  return { ok: true as const };
}

export async function deletePortalTask(id: number) {
  await guard();
  if (!db) return { ok: false as const };
  const [t] = await db.delete(portalTasks).where(eq(portalTasks.id, id)).returning({ matterId: portalTasks.matterId });
  if (t) { const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, t.matterId)); reval(m?.groupId, t.matterId); }
  return { ok: true as const };
}

/* ----------------------------- correspondence ---------------------------- */

export async function addPortalMessage(matterId: number, body: string) {
  const session = await guard();
  if (!db) return { ok: false as const };
  const clean = body.trim().slice(0, 20000);
  if (!clean) return { ok: false as const };
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m) return { ok: false as const };
  await db.insert(portalMessages).values({ matterId, author: session.email, fromClient: false, body: clean });
  reval(m.groupId, matterId);
  return { ok: true as const };
}

/* ------------------------------- documents ------------------------------- */

/**
 * Record an uploaded document on a matter tab. For the Exhibits tab this also
 * pushes the file into the Exhibit Reviewer: the matter's linked exhibit set is
 * created on first use (named after the matter, carrying the Clio number), and
 * the document lands there on the side mapped from its party role. Returns the
 * reviewer set/doc ids so the UI can announce it and link straight over.
 */
export async function registerPortalDoc(matterId: number, input: {
  tab: string; party?: string; name: string;
  file: { url: string; pathname: string; contentType?: string; size?: number };
}) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [m] = await db.select().from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m) return { ok: false as const, error: "Matter not found." };
  const tab = ["client", "pleading", "discovery", "exhibit"].includes(input.tab) ? input.tab : "client";
  const name = input.name.trim().slice(0, 255) || "Document";
  const party = (input.party ?? "").trim();

  let exhibitSetId: number | null = null;
  let exhibitDocId: number | null = null;
  try {
    if (tab === "exhibit") {
      // Ensure the matter's exhibit-reviewer set exists.
      exhibitSetId = m.exhibitSetId;
      if (exhibitSetId) {
        const [s] = await db.select({ id: exhibitSets.id }).from(exhibitSets).where(eq(exhibitSets.id, exhibitSetId));
        if (!s) exhibitSetId = null; // was deleted in the reviewer — recreate
      }
      if (!exhibitSetId) {
        const [s] = await db
          .insert(exhibitSets)
          .values({ name: m.title, matter: m.clioMatter, causeNumber: "", court: "", notes: "Created from the Case Portal." })
          .returning({ id: exhibitSets.id });
        exhibitSetId = s.id;
        await db.update(portalMatters).set({ exhibitSetId, updatedAt: new Date() }).where(eq(portalMatters.id, matterId));
      }
      // Text extraction mirrors the reviewer's own upload path (skips videos
      // and oversized files safely).
      let pageCount: number | null = null;
      let pageText: string[] = [];
      if (!isVideoFile(input.file.pathname, input.file.contentType)) {
        const extracted = await extractPdfText(input.file.url, input.file.size);
        pageCount = extracted.pageCount || null;
        pageText = extracted.pages;
      }
      const title = name.replace(/\.[a-z0-9]{2,5}$/i, "");
      const [d] = await db
        .insert(exhibitDocs)
        .values({
          setId: exhibitSetId,
          side: partyToReviewerSide(party),
          number: null,
          label: "",
          title,
          url: input.file.url,
          pathname: input.file.pathname,
          contentType: input.file.contentType ?? null,
          sizeBytes: input.file.size ?? null,
          pageCount,
          pageText,
          sort: 100000,
        })
        .returning({ id: exhibitDocs.id });
      exhibitDocId = d.id;
      revalidatePath(`/admin/exhibit-reviewer/${exhibitSetId}`);
    }

    await db.insert(portalDocs).values({
      matterId, tab, party, name,
      url: input.file.url, pathname: input.file.pathname,
      contentType: input.file.contentType ?? null, sizeBytes: input.file.size ?? null,
      exhibitDocId, uploadedBy: session.email,
    });
    reval(m.groupId, matterId);
    return { ok: true as const, exhibitSetId, exhibitDocId };
  } catch (err) {
    console.error("[case-portal] registerPortalDoc failed:", err);
    return { ok: false as const, error: "Couldn't save the document." };
  }
}

export async function deletePortalDoc(id: number) {
  await guard();
  if (!db) return { ok: false as const };
  const [d] = await db.select().from(portalDocs).where(eq(portalDocs.id, id));
  if (!d) return { ok: false as const };
  // If this exhibit was pushed to the reviewer, the reviewer's copy is left
  // alone (it may carry numbering, notes, and rulings) — only when the reviewer
  // doc still points at the very same blob do we skip deleting the file.
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, d.matterId));
  let blobShared = false;
  if (d.exhibitDocId) {
    const [ed] = await db.select({ id: exhibitDocs.id }).from(exhibitDocs).where(and(eq(exhibitDocs.id, d.exhibitDocId), eq(exhibitDocs.url, d.url)));
    blobShared = Boolean(ed);
  }
  await db.delete(portalDocs).where(eq(portalDocs.id, id));
  if (!blobShared && d.pathname) { try { await del(d.pathname); } catch { /* best-effort */ } }
  reval(m?.groupId, d.matterId);
  return { ok: true as const };
}
