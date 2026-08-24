"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, max } from "drizzle-orm";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { del, put } from "@vercel/blob";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, exhibitWitnesses, exhibitClaims, exhibitElements, exhibitRecipients } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { extractPdfText } from "@/lib/exhibit-review/text";
import { isVideoFile } from "@/lib/exhibit-review/media";
import { buildPrintOptimized, type ColorOverrides } from "@/lib/exhibit-review/printcopy";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";

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

async function baseUrl(): Promise<string> {
  const host = ((await headers()).get("host") ?? "").trim();
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS = new Set(["off", "restricted", "public"]);

/**
 * Set how a set is shared:
 *   off        — firm only, nothing resolves
 *   restricted — named people who each verify a one-time code sent to their email
 *   public     — anyone with the link
 * We mint the set's token on first share so links stay stable, and keep is_public
 * in step with "public" so the open public routes work unchanged.
 */
export async function setSetAccess(id: number, access: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const mode = ACCESS.has(access) ? access : "off";
  try {
    const [cur] = await db.select({ token: exhibitSets.publicToken }).from(exhibitSets).where(eq(exhibitSets.id, id));
    const token = cur?.token || randomBytes(18).toString("base64url");
    await db.update(exhibitSets).set({ access: mode, isPublic: mode === "public", publicToken: token, updatedAt: new Date() }).where(eq(exhibitSets.id, id));
    await audit(session.email, "update", "exhibit-set", String(id), `Sharing → ${mode}`);
    revalidatePath(`/admin/exhibit-reviewer/${id}`);
    return { ok: true as const, access: mode, token };
  } catch {
    return { ok: false as const, error: "Couldn't update sharing." };
  }
}

/**
 * Turn the opposing-counsel link on or off. It has its own token, separate from
 * the public/link-tree token, so it can never be edited into the fuller view —
 * opposing counsel only ever gets the exhibit names and the files.
 */
export async function setOcShare(id: number, enabled: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [cur] = await db.select({ token: exhibitSets.ocToken }).from(exhibitSets).where(eq(exhibitSets.id, id));
    const token = cur?.token || randomBytes(18).toString("base64url");
    await db.update(exhibitSets).set({ ocEnabled: enabled, ocToken: token, updatedAt: new Date() }).where(eq(exhibitSets.id, id));
    await audit(session.email, "update", "exhibit-set", String(id), enabled ? "Enabled opposing-counsel link" : "Disabled opposing-counsel link");
    revalidatePath(`/admin/exhibit-reviewer/${id}`);
    return { ok: true as const, enabled, token };
  } catch {
    return { ok: false as const, error: "Couldn't update the opposing-counsel link." };
  }
}

async function sendExhibitInvite(rec: { email: string; name: string; token: string }, setName: string) {
  const link = `${await baseUrl()}/exhibits/r/${rec.token}`;
  const who = rec.name?.trim() ? esc(rec.name.trim()) : "there";
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:520px;line-height:1.6">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${esc(FIRM.name)}</p>
      <p style="margin:0 0 12px">Hello ${who},</p>
      <p style="margin:0 0 12px">${esc(FIRM.name)} has shared the exhibits for <strong>${esc(setName)}</strong> with you.</p>
      <p style="margin:0 0 18px"><a href="${link}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">View the exhibits</a></p>
      <p style="margin:0;font-size:13px;color:#777">This access is specific to you. Opening it asks for a one-time code emailed to <strong>${esc(rec.email)}</strong>, so a forwarded link won't let anyone else in.</p>
    </div>`;
  return sendEmail({ to: rec.email, fromName: `${FIRM.name} — Secure Share`, subject: `${FIRM.shortName} shared exhibits for "${setName}" with you`, html, headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") } });
}

export async function addExhibitRecipient(setId: number, email: string, name: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false as const, error: "Enter a valid email address." };
  try {
    const [set] = await db.select({ name: exhibitSets.name }).from(exhibitSets).where(eq(exhibitSets.id, setId));
    if (!set) return { ok: false as const, error: "Set not found." };
    const token = randomBytes(18).toString("base64url");
    await db.insert(exhibitRecipients).values({ setId, email: cleanEmail, name: str(name, 191), token });
    const res = await sendExhibitInvite({ email: cleanEmail, name: str(name, 191), token }, set.name);
    await audit(session.email, "create", "exhibit-recipient", String(setId), `Invited ${cleanEmail}`);
    revalidatePath(`/admin/exhibit-reviewer/${setId}`);
    return { ok: true as const, error: res.sent ? undefined : "Added, but the invite email didn't send (check email settings)." };
  } catch {
    return { ok: false as const, error: "Couldn't add the person." };
  }
}

export async function resendExhibitInvite(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [rec] = await db.select().from(exhibitRecipients).where(eq(exhibitRecipients.id, id));
    if (!rec) return { ok: false as const, error: "Not found." };
    const [set] = await db.select({ name: exhibitSets.name }).from(exhibitSets).where(eq(exhibitSets.id, rec.setId));
    const res = await sendExhibitInvite(rec, set?.name ?? "exhibits");
    return res.sent ? { ok: true as const } : { ok: false as const, error: "Couldn't send the email." };
  } catch {
    return { ok: false as const, error: "Couldn't resend." };
  }
}

export async function setExhibitRecipientRevoked(id: number, revoked: boolean) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.update(exhibitRecipients).set({ revoked }).where(eq(exhibitRecipients.id, id)).returning({ setId: exhibitRecipients.setId });
    if (row) revalidatePath(`/admin/exhibit-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't update." };
  }
}

export async function deleteExhibitRecipient(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.delete(exhibitRecipients).where(eq(exhibitRecipients.id, id)).returning({ setId: exhibitRecipients.setId });
    if (row) revalidatePath(`/admin/exhibit-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove." };
  }
}

/** Attach (or clear) the set's "exhibit list" document — a single file, viewed
 *  like an exhibit. Pass file=null to remove it. */
export async function setExhibitListDoc(id: number, file: { url: string; pathname: string; contentType?: string; size?: number; name?: string } | null) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [cur] = await db.select({ listPathname: exhibitSets.listPathname }).from(exhibitSets).where(eq(exhibitSets.id, id));
    if (!cur) return { ok: false as const, error: "Set not found." };
    await db
      .update(exhibitSets)
      .set({
        listUrl: file?.url ?? null,
        listPathname: file?.pathname ?? null,
        listContentType: file?.contentType ?? null,
        listSizeBytes: file?.size ?? null,
        listName: file?.name ? str(file.name, 255) : null,
        updatedAt: new Date(),
      })
      .where(eq(exhibitSets.id, id));
    if (cur.listPathname && cur.listPathname !== file?.pathname) { try { await del(cur.listPathname); } catch { /* best-effort */ } }
    revalidatePath(`/admin/exhibit-reviewer/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[exhibit-reviewer] setExhibitListDoc failed:", err);
    return { ok: false as const, error: "Couldn't save the exhibit list." };
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
    const docs = await db.select({ pathname: exhibitDocs.pathname, hiResPathname: exhibitDocs.hiResPathname }).from(exhibitDocs).where(eq(exhibitDocs.setId, id));
    for (const d of docs) { if (d.pathname) { try { await del(d.pathname); } catch { /* best-effort */ } } if (d.hiResPathname) { try { await del(d.hiResPathname); } catch { /* best-effort */ } } }
    const [s] = await db.select({ listPathname: exhibitSets.listPathname }).from(exhibitSets).where(eq(exhibitSets.id, id));
    if (s?.listPathname) { try { await del(s.listPathname); } catch { /* best-effort */ } }
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
  batesEnd?: string;
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
    if (input.file?.url && !isVideoFile(input.file.pathname, input.file.contentType)) {
      // Pass the known size so a large file skips extraction entirely — no fetch,
      // no parse, no risk of the function being killed and losing this record.
      // Videos are stored as-is: no pages, no text.
      const extracted = await extractPdfText(input.file.url, input.file.size);
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
        batesEnd: str(input.batesEnd, 128),
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

export async function updateExhibitDoc(id: number, patch: { side?: string; number?: number | null; label?: string; title?: string; description?: string; priority?: string; trialStatus?: string; bates?: string; batesEnd?: string; witnessIds?: number[]; foundation?: string[]; elementIds?: number[]; notes?: string }) {
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
    if (patch.batesEnd !== undefined) set.batesEnd = str(patch.batesEnd, 128);
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

/**
 * Toggle whether an exhibit is "on the list" or "omitted". Omitted exhibits are
 * kept (never deleted) but drop out of the hidden view / downloads and every
 * external share link. Purely a flag flip — nothing else changes.
 */
export async function setExhibitOmitted(id: number, omitted: boolean) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.update(exhibitDocs).set({ omitted }).where(eq(exhibitDocs.id, id)).returning({ setId: exhibitDocs.setId });
    if (row) revalidatePath(`/admin/exhibit-reviewer/${row.setId}`);
    return { ok: true as const, omitted };
  } catch {
    return { ok: false as const, error: "Couldn't update the exhibit." };
  }
}

/**
 * Swap the PDF behind an exhibit, keeping its number, label, title, notes, and
 * every other field. Re-extracts text for search and deletes the old file.
 */
export async function replaceExhibitFile(id: number, file: { url: string; pathname: string; contentType?: string; size?: number }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!file?.url) return { ok: false as const, error: "No file to use." };
  try {
    const [cur] = await db.select({ setId: exhibitDocs.setId, pathname: exhibitDocs.pathname, printPathname: exhibitDocs.printPathname }).from(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (!cur) return { ok: false as const, error: "Exhibit not found." };
    const extracted = isVideoFile(file.pathname, file.contentType) ? { pageCount: 0, pages: [] as string[] } : await extractPdfText(file.url, file.size);
    await db
      .update(exhibitDocs)
      .set({
        url: file.url,
        pathname: file.pathname,
        contentType: file.contentType ?? null,
        sizeBytes: file.size ?? null,
        pageCount: extracted.pageCount || null,
        pageText: extracted.pages,
        // The new file invalidates any existing print-optimized copy.
        printUrl: null, printPathname: null, printContentType: null, printSizeBytes: null,
        colorStatus: null, colorPages: [], reviewPages: [], colorOverrides: {},
      })
      .where(eq(exhibitDocs.id, id));
    // Remove the old blobs now that nothing points at them.
    if (cur.pathname && cur.pathname !== file.pathname) { try { await del(cur.pathname); } catch { /* best-effort */ } }
    if (cur.printPathname) { try { await del(cur.printPathname); } catch { /* best-effort */ } }
    revalidatePath(`/admin/exhibit-reviewer/${cur.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[exhibit-reviewer] replaceExhibitFile failed:", err);
    return { ok: false as const, error: "Couldn't replace the file." };
  }
}

/**
 * Attach (or replace) an exhibit's optional high-resolution version — a separate
 * file viewed on demand, leaving the working PDF and its search text untouched.
 * Pass file=null to remove it.
 */
export async function setExhibitHiRes(id: number, file: { url: string; pathname: string; contentType?: string; size?: number } | null) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [cur] = await db.select({ setId: exhibitDocs.setId, hiResPathname: exhibitDocs.hiResPathname }).from(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (!cur) return { ok: false as const, error: "Exhibit not found." };
    await db
      .update(exhibitDocs)
      .set({
        hiResUrl: file?.url ?? null,
        hiResPathname: file?.pathname ?? null,
        hiResContentType: file?.contentType ?? null,
        hiResSizeBytes: file?.size ?? null,
      })
      .where(eq(exhibitDocs.id, id));
    if (cur.hiResPathname && cur.hiResPathname !== file?.pathname) { try { await del(cur.hiResPathname); } catch { /* best-effort */ } }
    revalidatePath(`/admin/exhibit-reviewer/${cur.setId}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[exhibit-reviewer] setExhibitHiRes failed:", err);
    return { ok: false as const, error: "Couldn't save the high-res version." };
  }
}

export async function deleteExhibitDoc(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.select({ setId: exhibitDocs.setId, pathname: exhibitDocs.pathname, hiResPathname: exhibitDocs.hiResPathname, printPathname: exhibitDocs.printPathname }).from(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (row?.pathname) { try { await del(row.pathname); } catch { /* best-effort */ } }
    if (row?.hiResPathname) { try { await del(row.hiResPathname); } catch { /* best-effort */ } }
    if (row?.printPathname) { try { await del(row.printPathname); } catch { /* best-effort */ } }
    await db.delete(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (row) revalidatePath(`/admin/exhibit-reviewer/${row.setId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the exhibit." };
  }
}

/**
 * Build (or rebuild) the print-optimized copy of one exhibit: black-and-white
 * pages re-saved as true grayscale so a printer bills them as mono, genuine
 * color pages kept in color. Done one exhibit at a time so the client can show
 * progress and never trips a serverless timeout. Non-destructive — the original
 * file is untouched.
 */
export async function buildPrintCopy(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [doc] = await db
      .select({ setId: exhibitDocs.setId, url: exhibitDocs.url, pathname: exhibitDocs.pathname, contentType: exhibitDocs.contentType, sizeBytes: exhibitDocs.sizeBytes, printPathname: exhibitDocs.printPathname, colorOverrides: exhibitDocs.colorOverrides })
      .from(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (!doc) return { ok: false as const, error: "Exhibit not found." };
    if (!doc.url) return { ok: false as const, error: "This exhibit has no file yet." };

    // Videos have no print copy — mark skipped WITHOUT downloading the file.
    if (isVideoFile(doc.pathname ?? doc.url, doc.contentType)) {
      await db.update(exhibitDocs).set({ colorStatus: "skipped", colorPages: [], reviewPages: [] }).where(eq(exhibitDocs.id, id));
      revalidatePath(`/admin/exhibit-reviewer/${doc.setId}`);
      return { ok: true as const, status: "skipped" as const, colorStatus: "skipped" as const, colorPages: [] as number[], reviewPages: [] as number[], converted: 0, pageCount: 0 };
    }

    // Guard the download itself for very large files.
    if (doc.sizeBytes && doc.sizeBytes > 300 * 1024 * 1024) {
      await db.update(exhibitDocs).set({ colorStatus: "skipped", colorPages: [], reviewPages: [] }).where(eq(exhibitDocs.id, id));
      revalidatePath(`/admin/exhibit-reviewer/${doc.setId}`);
      return { ok: true as const, status: "skipped" as const, colorStatus: "skipped" as const, colorPages: [] as number[], reviewPages: [] as number[], converted: 0, pageCount: 0 };
    }

    const res = await fetch(doc.url);
    if (!res.ok) return { ok: false as const, error: "Couldn't fetch the exhibit file." };
    const bytes = new Uint8Array(await res.arrayBuffer());

    const overrides = (doc.colorOverrides ?? {}) as ColorOverrides;
    const built = await buildPrintOptimized(bytes, overrides);
    if (built.status !== "ok" || !built.bytes) {
      if (built.status === "skipped") {
        await db.update(exhibitDocs).set({ colorStatus: "skipped", colorPages: [], reviewPages: [] }).where(eq(exhibitDocs.id, id));
        revalidatePath(`/admin/exhibit-reviewer/${doc.setId}`);
        return { ok: true as const, status: "skipped" as const, colorStatus: "skipped" as const, colorPages: [] as number[], reviewPages: [] as number[], converted: 0, pageCount: built.pageCount };
      }
      return { ok: false as const, error: built.reason || "Couldn't prepare a print copy." };
    }

    const blob = await put(`exhibit-print/${doc.setId}/${id}.pdf`, Buffer.from(built.bytes), {
      access: "public", contentType: "application/pdf", addRandomSuffix: true,
    });

    const colorStatus = built.colorPages.length === 0 ? "bw" : built.colorPages.length >= built.pageCount ? "color" : "mixed";
    // Remove any previous print blob before pointing at the new one.
    if (doc.printPathname && doc.printPathname !== blob.pathname) { try { await del(doc.printPathname); } catch { /* best-effort */ } }
    await db
      .update(exhibitDocs)
      .set({
        printUrl: blob.url, printPathname: blob.pathname, printContentType: "application/pdf", printSizeBytes: built.bytes.byteLength,
        colorStatus, colorPages: built.colorPages, reviewPages: built.reviewPages,
      })
      .where(eq(exhibitDocs.id, id));
    revalidatePath(`/admin/exhibit-reviewer/${doc.setId}`);
    return { ok: true as const, status: "ok" as const, colorStatus, colorPages: built.colorPages, reviewPages: built.reviewPages, converted: built.converted, pageCount: built.pageCount };
  } catch (err) {
    console.error("[exhibit-reviewer] buildPrintCopy failed:", err);
    return { ok: false as const, error: "Couldn't prepare a print copy." };
  }
}

/**
 * Record the user's color-vs-grayscale decision for a flagged (borderline) page
 * and rebuild that exhibit's print copy so the choice takes effect. The decision
 * is stored so it survives future rebuilds and the page is never re-flagged.
 */
export async function decideColorPage(id: number, page: number, choice: "gray" | "color") {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  if (!Number.isInteger(page) || page < 1) return { ok: false as const, error: "Bad page." };
  try {
    const [doc] = await db.select({ colorOverrides: exhibitDocs.colorOverrides }).from(exhibitDocs).where(eq(exhibitDocs.id, id));
    if (!doc) return { ok: false as const, error: "Exhibit not found." };
    const overrides = { ...((doc.colorOverrides ?? {}) as ColorOverrides), [String(page)]: choice };
    await db.update(exhibitDocs).set({ colorOverrides: overrides }).where(eq(exhibitDocs.id, id));
    // Rebuild applies the decision and clears the page from the review list.
    return await buildPrintCopy(id);
  } catch (err) {
    console.error("[exhibit-reviewer] decideColorPage failed:", err);
    return { ok: false as const, error: "Couldn't save that choice." };
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
  /** True when the query is a Bates number that falls in this exhibit's range. */
  batesHit: boolean;
};

const snippetAround = (text: string, term: string): string => {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return "";
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + term.length + 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
};

/** The last run of digits in a Bates token, as a number (leading zeros dropped). */
function batesNum(s: string): number | null {
  const groups = (s || "").match(/\d+/g);
  if (!groups?.length) return null;
  const n = Number(groups[groups.length - 1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * If the query reads like a Bates reference — optional letter prefix and
 * separators, then digits ("263", "RES_000263", "RES 263") — return its number.
 * A phrase with words ("exhibit 3 notes") returns null so it isn't misread.
 */
function batesQueryNum(q: string): number | null {
  const m = q.trim().match(/^[A-Za-z]{0,8}[\s._-]*0*(\d{1,9})$/);
  return m ? Number(m[1]) : null;
}

/** Search an entire set: matches the exhibit number/label/title/Bates and the
 *  words inside every PDF — and recognises a Bates number that falls inside an
 *  exhibit's Bates range, even when the letters are left off. */
export async function searchExhibitSet(setId: number, query: string): Promise<SetSearchHit[]> {
  await guard();
  if (!db) return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const qNum = batesQueryNum(query);
  try {
    const docs = await db.select().from(exhibitDocs).where(eq(exhibitDocs.setId, setId)).orderBy(asc(exhibitDocs.sort));
    const hits: SetSearchHit[] = [];
    for (const d of docs) {
      const meta = `${d.label} ${d.title} ${d.description} ${d.bates} ${d.batesEnd}`.toLowerCase();
      const metaHit = meta.includes(q);

      // Bates range match: the query number falls within [start, end].
      let batesHit = false;
      if (qNum != null) {
        const lo = batesNum(d.bates);
        const hi = batesNum(d.batesEnd) ?? lo;
        if (lo != null && hi != null && qNum >= Math.min(lo, hi) && qNum <= Math.max(lo, hi)) batesHit = true;
      }

      const pages: number[] = [];
      let snippet = "";
      const text = Array.isArray(d.pageText) ? (d.pageText as string[]) : [];
      for (let i = 0; i < text.length; i++) {
        if ((text[i] ?? "").toLowerCase().includes(q)) {
          pages.push(i + 1);
          if (!snippet) snippet = snippetAround(text[i], q);
        }
      }
      if (metaHit || pages.length || batesHit) {
        if (batesHit && !snippet) {
          const range = d.batesEnd ? `${d.bates}–${d.batesEnd}` : d.bates;
          snippet = `Bates ${range}`;
        }
        hits.push({ docId: d.id, side: d.side, label: d.label, title: d.title, pages, snippet, metaOnly: pages.length === 0, batesHit });
      }
    }
    // Bates-range matches first — they're the most precise answer to a number.
    hits.sort((a, b) => Number(b.batesHit) - Number(a.batesHit));
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
