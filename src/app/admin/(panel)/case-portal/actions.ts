"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { portalGroups, portalCompanies, portalMatters, portalTasks, portalMessages, portalDocs, portalMembers, portalRequests, exhibitSets, exhibitDocs } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { requestStatus, type RequestStatus } from "@/lib/portal";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { partyToReviewerSide } from "@/lib/portal";
import { resolveMatterKey } from "@/lib/cases";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";
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

export async function createPortalGroup(name: string, profile?: { kind?: "single" | "family"; parentName?: string; parentContact?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await ensureDiscoveryTables().catch(() => {});
  const clean = name.trim().slice(0, 191);
  if (!clean) return { ok: false as const, error: "Give the client file a name." };
  const kind = profile?.kind === "family" ? "family" : "single";
  const [row] = await db.insert(portalGroups).values({ name: clean, kind, parentName: (profile?.parentName ?? "").trim().slice(0, 191), parentContact: (profile?.parentContact ?? "").trim().slice(0, 4000) }).returning({ id: portalGroups.id });
  await audit(session.email, "create", "portal-group", String(row.id), `${kind === "family" ? "Multi-entity" : "Single"} client file: ${clean}`);
  reval();
  return { ok: true as const, id: row.id };
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

export async function addPortalCompany(groupId: number, name: string, kind = "company") {
  await guard();
  if (!db) return { ok: false as const };
  const clean = name.trim().slice(0, 191);
  if (!clean) return { ok: false as const };
  const existing = await db.select({ id: portalCompanies.id }).from(portalCompanies).where(eq(portalCompanies.groupId, groupId));
  await db.insert(portalCompanies).values({ groupId, name: clean, kind: ["company", "partnership", "trust", "estate", "other"].includes(kind) ? kind : "company", sort: existing.length });
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
    .values({ groupId, companyId: input.companyId, title, clioMatter: await resolveMatterKey(input.clioMatter), posture })
    .returning({ id: portalMatters.id });
  await audit(session.email, "create", "portal-matter", String(row.id), title);
  reval(groupId);
  return { ok: true as const, id: row.id };
}

export async function updatePortalMatter(id: number, patch: {
  title?: string; companyId?: number | null; clioMatter?: string; posture?: string; status?: string; notes?: string; shareFolderId?: number | null; driveFolder?: string;
}) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [cur] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, id));
  if (!cur) return { ok: false as const, error: "Matter not found." };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 255);
  if (patch.companyId !== undefined) set.companyId = patch.companyId;
  if (patch.clioMatter !== undefined) set.clioMatter = await resolveMatterKey(patch.clioMatter);
  if (patch.posture !== undefined && ["transactional", "pre-litigation", "litigation"].includes(patch.posture)) set.posture = patch.posture;
  if (patch.status !== undefined && ["open", "closed"].includes(patch.status)) set.status = patch.status;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.shareFolderId !== undefined) set.shareFolderId = patch.shareFolderId;
  if (patch.driveFolder !== undefined) set.driveFolder = patch.driveFolder.trim().slice(0, 255);
  await db.update(portalMatters).set(set).where(eq(portalMatters.id, id));
  reval(cur.groupId, id);
  return { ok: true as const };
}

/** Tuck a matter out of sight in the firm's list (or bring it back). Firm-side
 *  only — the client portal is unaffected. */
export async function setMatterHidden(id: number, hidden: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [cur] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, id));
  if (!cur) return { ok: false as const, error: "Matter not found." };
  await db.update(portalMatters).set({ hidden, updatedAt: new Date() }).where(eq(portalMatters.id, id));
  await audit(session.email, "update", "portal-matter", String(id), hidden ? "Hidden from list" : "Unhidden");
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
  await db.insert(portalMessages).values({ matterId, author: session.email, fromClient: false, body: clean, readByFirm: true });
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

/* ---------------------------- client portal access ------------------------ */

async function portalBaseUrl(): Promise<string> {
  const host = ((await headers()).get("host") ?? "").trim();
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendPortalInviteEmail(member: { email: string; name: string; token: string }, groupName: string) {
  const link = `${await portalBaseUrl()}/portal/${member.token}`;
  const who = member.name.trim() ? escHtml(member.name.trim()) : "there";
  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.6">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${escHtml(FIRM.name)}</p>
      <p style="margin:0 0 12px">Hi ${who},</p>
      <p style="margin:0 0 12px">${escHtml(FIRM.name)} has set up a private client portal for <strong>${escHtml(groupName)}</strong>. In it you can see your active matters, upload documents the office needs, check off requested items, and message the team on each matter.</p>
      <p style="margin:18px 0">
        <a href="${link}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Open your client portal</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#555">The first time you open it (and periodically after), we'll email a one-time sign-in code to this address — no password to remember. The link is personal to you (${escHtml(member.email)}); please don't forward it.</p>
      <p style="margin:0;font-size:12px;color:#888">If the button doesn't work, copy this address into your browser:<br/>${link}</p>
    </div>`;
  return sendEmail({ to: member.email, fromName: `${FIRM.name} — Client Portal`, subject: `Your client portal with ${FIRM.name}`, html, headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") } });
}

/** Let (or stop letting) this group's portal members open new matters themselves. */
export async function setClientCanCreateMatters(groupId: number, on: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await db.update(portalGroups).set({ clientCanCreateMatters: on }).where(eq(portalGroups.id, groupId));
  await audit(session.email, "update", "portal-group", String(groupId), on ? "Clients may create matters" : "Client matter creation off");
  reval(groupId);
  return { ok: true as const };
}

/**
 * Email every active portal member that the firm added documents or posted a
 * message on a matter — each gets their own personal link straight to it.
 * Called only after the admin confirms the "email the client?" prompt.
 */
export async function notifyClientOfUpdate(matterId: number, kind: "docs" | "message") {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured.", sent: 0 };
  const [m] = await db.select().from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m) return { ok: false as const, error: "Matter not found.", sent: 0 };
  const members = await db.select().from(portalMembers).where(and(eq(portalMembers.groupId, m.groupId), eq(portalMembers.revoked, false)));
  if (!members.length) return { ok: true as const, sent: 0 };

  const base = await portalBaseUrl();
  const what = kind === "docs" ? "New documents are ready for you" : "You have a new message";
  let sent = 0;
  for (const mem of members) {
    const link = `${base}/portal/${mem.token}/m/${m.id}`;
    const who = mem.name.trim() ? escHtml(mem.name.trim()) : "there";
    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.6">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${escHtml(FIRM.name)}</p>
        <p style="margin:0 0 12px">Hi ${who},</p>
        <p style="margin:0 0 12px">${kind === "docs" ? "The office added new documents" : "The office posted a new message"} on your matter <strong>${escHtml(m.title)}</strong>.</p>
        <p style="margin:18px 0">
          <a href="${link}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Review it in your portal</a>
        </p>
        <p style="margin:0;font-size:12px;color:#888">If the button doesn't work, copy this address into your browser:<br/>${link}</p>
      </div>`;
    const r = await sendEmail({ to: mem.email, fromName: `${FIRM.name} — Client Portal`, subject: `${what} — ${m.title}`, html, headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") } });
    if (r.sent) sent++;
  }
  await audit(session.email, "update", "portal-matter", String(matterId), `Emailed ${sent} member(s): ${kind}`);
  return { ok: true as const, sent };
}

/** Invite someone into a group's client portal: creates their personal link and
 *  emails it. Safe to call for an email already invited — it resends instead. */
export async function addPortalMember(groupId: number, input: { email: string; name: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Enter a valid email address." };
  const [group] = await db.select().from(portalGroups).where(eq(portalGroups.id, groupId));
  if (!group) return { ok: false as const, error: "Group not found." };
  try {
    const [existing] = await db.select().from(portalMembers).where(and(eq(portalMembers.groupId, groupId), eq(portalMembers.email, email)));
    if (existing) {
      if (existing.revoked) await db.update(portalMembers).set({ revoked: false }).where(eq(portalMembers.id, existing.id));
      const sent = await sendPortalInviteEmail({ email, name: existing.name || input.name.trim(), token: existing.token }, group.name);
      reval(groupId);
      return sent.sent ? { ok: true as const, resent: true } : { ok: false as const, error: "Couldn't send the invite email." };
    }
    const token = randomBytes(18).toString("base64url");
    await db.insert(portalMembers).values({ groupId, email, name: input.name.trim().slice(0, 191), token });
    const sent = await sendPortalInviteEmail({ email, name: input.name.trim(), token }, group.name);
    await audit(session.email, "create", "portal-member", email, `Invited to ${group.name}`);
    reval(groupId);
    return sent.sent ? { ok: true as const, resent: false } : { ok: true as const, resent: false, warning: "Invite saved, but the email couldn't be sent — use Copy link." };
  } catch {
    return { ok: false as const, error: "Couldn't invite them. Run Settings → Database updates once, then retry." };
  }
}

export async function resendPortalInvite(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [mem] = await db.select().from(portalMembers).where(eq(portalMembers.id, id));
  if (!mem || mem.revoked) return { ok: false as const, error: "Not found (or revoked)." };
  const [group] = await db.select().from(portalGroups).where(eq(portalGroups.id, mem.groupId));
  if (!group) return { ok: false as const, error: "Group not found." };
  const sent = await sendPortalInviteEmail({ email: mem.email, name: mem.name, token: mem.token }, group.name);
  return sent.sent ? { ok: true as const } : { ok: false as const, error: "Couldn't send the email." };
}

export async function setPortalMemberRevoked(id: number, revoked: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const };
  const [mem] = await db.update(portalMembers).set({ revoked }).where(eq(portalMembers.id, id)).returning();
  if (mem) { await audit(session.email, "update", "portal-member", mem.email, revoked ? "Portal access revoked" : "Portal access restored"); reval(mem.groupId); }
  return { ok: true as const };
}

export async function deletePortalMember(id: number) {
  await guard();
  if (!db) return { ok: false as const };
  const [mem] = await db.delete(portalMembers).where(eq(portalMembers.id, id)).returning();
  if (mem) reval(mem.groupId);
  return { ok: true as const };
}

/* ------------------------- group & company notes ------------------------- */

export async function updatePortalGroupNotes(id: number, notes: string) {
  await guard();
  if (!db) return { ok: false as const };
  await db.update(portalGroups).set({ notes: notes.slice(0, 20000) }).where(eq(portalGroups.id, id));
  reval(id);
  return { ok: true as const };
}

export async function updatePortalCompany(id: number, patch: { name?: string; aka?: string; notes?: string; kind?: string }) {
  await guard();
  if (!db) return { ok: false as const };
  const [c] = await db.select({ groupId: portalCompanies.groupId }).from(portalCompanies).where(eq(portalCompanies.id, id));
  if (!c) return { ok: false as const };
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim().slice(0, 191);
  if (patch.aka !== undefined) set.aka = patch.aka.trim().slice(0, 255);
  if (patch.notes !== undefined) set.notes = patch.notes.slice(0, 20000);
  if (patch.kind !== undefined && ["company", "partnership", "trust", "estate", "other"].includes(patch.kind)) set.kind = patch.kind;
  if (Object.keys(set).length) await db.update(portalCompanies).set(set).where(eq(portalCompanies.id, id));
  reval(c.groupId);
  return { ok: true as const };
}

/* ------------------------------ bulk import ------------------------------ */

/**
 * Paste an outline of matters, one per line:
 *   Clio | Title | Company | Status | Drive folder | Notes
 * Only Clio and Title are required (either order works if the first cell is
 * numeric). Company names that don't exist yet are created. Existing matters
 * (same Clio number in the group) are skipped, so re-pasting is safe.
 */
export async function importPortalMatters(groupId: number, text: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const companies = await db.select().from(portalCompanies).where(eq(portalCompanies.groupId, groupId));
  const existing = await db.select({ clioMatter: portalMatters.clioMatter, title: portalMatters.title }).from(portalMatters).where(eq(portalMatters.groupId, groupId));
  const seen = new Set(existing.map((m) => m.clioMatter.split("-")[0].trim()).filter(Boolean));
  let created = 0, skipped = 0;
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^clio\b/i.test(line)) continue;
    const cells = line.split(/\s*[|\t]\s*/).map((c) => c.trim());
    if (cells.length < 2) { errors.push(`Needs at least "Clio | Title": ${line.slice(0, 60)}`); continue; }
    const [c0, c1, company = "", status = "open", drive = "", notes = ""] = cells;
    let clio = c0, title = c1;
    if (!/^\d{3,}/.test(clio) && /^\d{3,}/.test(title)) [clio, title] = [title, clio];
    const code = clio.split("-")[0].trim();
    if (!title) { errors.push(`No title for ${clio}`); continue; }
    if (seen.has(code)) { skipped++; continue; }
    let companyId: number | null = null;
    if (company) {
      const found = companies.find((c) => c.name.toLowerCase() === company.toLowerCase());
      if (found) companyId = found.id;
      else {
        const [row] = await db.insert(portalCompanies).values({ groupId, name: company.slice(0, 191), sort: companies.length }).returning();
        companies.push(row); companyId = row.id;
      }
    }
    const posture = /\bv\.|cause no|district court|county court|lawsuit|litigation/i.test(title) ? "litigation" : /claim|demand|subrogation|pre-lit|dispute|twc/i.test(title) ? "pre-litigation" : "transactional";
    await db.insert(portalMatters).values({
      groupId, companyId, title: title.slice(0, 255), clioMatter: await resolveMatterKey(clio), posture,
      status: /closed|done|resolved/i.test(status) ? "closed" : "open", driveFolder: drive.slice(0, 255), notes: notes.slice(0, 20000),
    });
    seen.add(code); created++;
  }
  await audit(session.email, "create", "portal-matter", String(groupId), `Imported ${created} matters (${skipped} already present)`);
  reval(groupId);
  return { ok: true as const, created, skipped, errors };
}

/* --------------------------- document requests --------------------------- */

const REQ_STATUSES: RequestStatus[] = ["open", "received", "accepted", "waived"];

export async function addPortalRequest(matterId: number, input: { title: string; details?: string; dueOn?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await ensureDiscoveryTables().catch(() => {});
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m) return { ok: false as const, error: "Matter not found." };
  const title = input.title.trim().slice(0, 255);
  if (!title) return { ok: false as const, error: "Say what you need." };
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(input.dueOn ?? "") ? input.dueOn! : "";
  const [row] = await db.insert(portalRequests).values({ matterId, title, details: (input.details ?? "").trim().slice(0, 4000), dueOn, createdBy: session.email }).returning({ id: portalRequests.id });
  reval(m.groupId, matterId);
  return { ok: true as const, id: row.id };
}

export async function updatePortalRequest(id: number, patch: { title?: string; details?: string; dueOn?: string; status?: string; firmNote?: string }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const [r] = await db.select().from(portalRequests).where(eq(portalRequests.id, id));
  if (!r) return { ok: false as const, error: "Request not found." };
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, r.matterId));
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined && patch.title.trim()) set.title = patch.title.trim().slice(0, 255);
  if (patch.details !== undefined) set.details = patch.details.trim().slice(0, 4000);
  if (patch.dueOn !== undefined) set.dueOn = /^\d{4}-\d{2}-\d{2}$/.test(patch.dueOn) ? patch.dueOn : "";
  if (patch.firmNote !== undefined) set.firmNote = patch.firmNote.slice(0, 4000);
  if (patch.status !== undefined && REQ_STATUSES.includes(patch.status as RequestStatus)) {
    set.status = patch.status;
    if (patch.status === "open") set.respondedAt = null;
  }
  await db.update(portalRequests).set(set).where(eq(portalRequests.id, id));
  reval(m?.groupId, r.matterId);
  return { ok: true as const };
}

export async function deletePortalRequest(id: number) {
  await guard();
  if (!db) return { ok: false as const };
  const [r] = await db.select({ matterId: portalRequests.matterId }).from(portalRequests).where(eq(portalRequests.id, id));
  if (!r) return { ok: false as const };
  const [m] = await db.select({ groupId: portalMatters.groupId }).from(portalMatters).where(eq(portalMatters.id, r.matterId));
  await db.update(portalDocs).set({ requestId: null }).where(eq(portalDocs.requestId, id));
  await db.delete(portalRequests).where(eq(portalRequests.id, id));
  reval(m?.groupId, r.matterId);
  return { ok: true as const };
}

/**
 * Email every active portal member one digest of what is still needed on a
 * matter (every open request, due dates, overdue flagged) with a button to
 * the matter in their portal. One email per person, not per request.
 */
export async function sendRequestReminder(matterId: number, extraNote = "") {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured.", sent: 0 };
  const [m] = await db.select().from(portalMatters).where(eq(portalMatters.id, matterId));
  if (!m) return { ok: false as const, error: "Matter not found.", sent: 0 };
  const open = await db.select().from(portalRequests).where(and(eq(portalRequests.matterId, matterId), eq(portalRequests.status, "open"))).orderBy(asc(portalRequests.dueOn), asc(portalRequests.id));
  if (!open.length) return { ok: false as const, error: "Nothing is outstanding on this matter.", sent: 0 };
  const members = await db.select().from(portalMembers).where(and(eq(portalMembers.groupId, m.groupId), eq(portalMembers.revoked, false)));
  if (!members.length) return { ok: true as const, sent: 0 };
  const base = await portalBaseUrl();
  const today = new Date().toISOString().slice(0, 10);
  const fmtDue = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
  const items = open.map((r) => `<li style="margin:0 0 8px"><strong>${escHtml(r.title)}</strong>${r.dueOn ? ` <span style="color:${r.dueOn < today ? "#b42318" : "#555"}">— ${r.dueOn < today ? "was due" : "due"} ${fmtDue(r.dueOn)}</span>` : ""}${r.details ? `<br/><span style="color:#555;font-size:13px">${escHtml(r.details)}</span>` : ""}</li>`).join("");
  let sent = 0;
  for (const mem of members) {
    const link = `${base}/portal/${mem.token}/m/${m.id}`;
    const who = mem.name.trim() ? escHtml(mem.name.trim()) : "there";
    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.6">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${escHtml(FIRM.name)}</p>
        <p style="margin:0 0 12px">Hi ${who},</p>
        <p style="margin:0 0 12px">On <strong>${escHtml(m.title)}</strong> we are still waiting on the following from you:</p>
        <ul style="margin:0 0 14px 18px;padding:0">${items}</ul>
        ${extraNote.trim() ? `<p style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #7a1f2b;background:#faf7f2;white-space:pre-wrap">${escHtml(extraNote.trim())}</p>` : ""}
        <p style="margin:18px 0"><a href="${link}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Upload in your portal</a></p>
        <p style="margin:0;font-size:12px;color:#888">Each item has its own upload button in the portal, so we can tell what is what. If the button doesn't work, copy this address into your browser:<br/>${link}</p>
      </div>`;
    const r = await sendEmail({ to: mem.email, fromName: `${FIRM.name} — Client Portal`, subject: `Documents still needed — ${m.title}`, html, headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") } });
    if (r.sent) sent++;
  }
  await db.update(portalRequests).set({ remindedAt: new Date() }).where(inArray(portalRequests.id, open.map((r) => r.id)));
  await audit(session.email, "update", "portal-matter", String(matterId), `Reminder for ${open.length} open request(s) emailed to ${sent} member(s)`);
  reval(m.groupId, matterId);
  return { ok: true as const, sent, requests: open.length };
}

/* ------------------------------ read receipts ----------------------------- */

/** The firm opened the matter: every client message there is now read. */
export async function markClientMessagesRead(matterId: number) {
  await guard();
  if (!db) return;
  await db.update(portalMessages).set({ readByFirm: true }).where(and(eq(portalMessages.matterId, matterId), eq(portalMessages.fromClient, true), eq(portalMessages.readByFirm, false))).catch(() => {});
}

/* ------------------------- one-click client set-up ------------------------- */

/**
 * Set up a client group from an outline the firm supplied (companies, matters
 * with Clio numbers, working-folder names, open items and document requests)
 * so the office doesn't have to key it in. Idempotent: a group with this name
 * that already has matters is left alone.
 */
export async function setupClientGroup(key: "manuel") {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await ensureDiscoveryTables().catch(() => {});
  const { CLIENT_SETUPS } = await import("@/lib/portal-setups");
  const setup = CLIENT_SETUPS[key];
  if (!setup) return { ok: false as const, error: "Unknown set-up." };
  const [existing] = await db.select().from(portalGroups).where(eq(portalGroups.name, setup.group));
  if (existing) {
    const [{ n } = { n: 0 }] = await db.select({ n: portalMatters.id }).from(portalMatters).where(eq(portalMatters.groupId, existing.id)).limit(1).then((r) => (r.length ? [{ n: 1 }] : [{ n: 0 }]));
    if (n) return { ok: true as const, groupId: existing.id, created: 0, note: "Already set up." };
  }
  const group = existing ?? (await db.insert(portalGroups).values({ name: setup.group, notes: setup.notes, kind: setup.kind, parentName: setup.parentName, parentContact: setup.parentContact }).returning())[0];
  if (existing) await db.update(portalGroups).set({ notes: existing.notes || setup.notes, kind: setup.kind, parentName: setup.parentName, parentContact: setup.parentContact }).where(eq(portalGroups.id, group.id));
  const companyIds = new Map<string, number>();
  let sort = 0;
  for (const c of setup.companies) {
    const [row] = await db.insert(portalCompanies).values({ groupId: group.id, name: c.name, kind: c.kind ?? "company", aka: c.aka ?? "", notes: c.notes ?? "", sort: sort++ }).returning({ id: portalCompanies.id });
    companyIds.set(c.name, row.id);
  }
  let created = 0;
  for (const m of setup.matters) {
    const [row] = await db.insert(portalMatters).values({
      groupId: group.id, companyId: companyIds.get(m.company) ?? null, title: m.title, clioMatter: await resolveMatterKey(m.clio),
      posture: m.posture, status: "open", driveFolder: m.driveFolder ?? "", notes: m.notes ?? "",
    }).returning({ id: portalMatters.id });
    created++;
    let rs = 0;
    for (const r of m.requests ?? []) await db.insert(portalRequests).values({ matterId: row.id, title: r.title, details: r.details ?? "", dueOn: "", sort: rs++, createdBy: session.email });
    for (const t of m.firmTasks ?? []) await db.insert(portalTasks).values({ matterId: row.id, kind: "firm", title: t });
    for (const t of m.clientTasks ?? []) await db.insert(portalTasks).values({ matterId: row.id, kind: "client", title: t });
  }
  await audit(session.email, "create", "portal-group", String(group.id), `Set up from outline: ${created} matters`);
  reval(group.id);
  return { ok: true as const, groupId: group.id, created };
}

/** The file's profile: single vs multi-entity, the parent person, how to reach them. */
export async function updatePortalGroupProfile(id: number, patch: { kind?: "single" | "family"; parentName?: string; parentContact?: string; name?: string }) {
  await guard();
  if (!db) return { ok: false as const };
  const set: Record<string, unknown> = {};
  if (patch.kind) set.kind = patch.kind === "family" ? "family" : "single";
  if (patch.parentName !== undefined) set.parentName = patch.parentName.trim().slice(0, 191);
  if (patch.parentContact !== undefined) set.parentContact = patch.parentContact.trim().slice(0, 4000);
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim().slice(0, 191);
  if (Object.keys(set).length) await db.update(portalGroups).set(set).where(eq(portalGroups.id, id));
  reval(id);
  return { ok: true as const };
}

/**
 * One email to the client covering the WHOLE file: every open matter, what is
 * still needed on each (document requests), and any open to-dos — so a client
 * with many entities gets one calm summary instead of one email per matter.
 */
export async function sendGroupDigest(groupId: number, extraNote = "") {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured.", sent: 0 };
  const [g] = await db.select().from(portalGroups).where(eq(portalGroups.id, groupId));
  if (!g) return { ok: false as const, error: "Client file not found.", sent: 0 };
  const matters = (await db.select().from(portalMatters).where(eq(portalMatters.groupId, groupId)).orderBy(asc(portalMatters.title))).filter((m) => m.status === "open" && !m.hidden);
  const companies = await db.select().from(portalCompanies).where(eq(portalCompanies.groupId, groupId));
  const ids = matters.map((m) => m.id);
  const [reqs, tasks] = ids.length ? await Promise.all([
    db.select().from(portalRequests).where(and(inArray(portalRequests.matterId, ids), eq(portalRequests.status, "open"))).orderBy(asc(portalRequests.dueOn)),
    db.select().from(portalTasks).where(and(inArray(portalTasks.matterId, ids), eq(portalTasks.kind, "client"), eq(portalTasks.done, false))),
  ]) : [[], []];
  const members = await db.select().from(portalMembers).where(and(eq(portalMembers.groupId, groupId), eq(portalMembers.revoked, false)));
  if (!members.length) return { ok: true as const, sent: 0, items: reqs.length + tasks.length };
  const base = await portalBaseUrl();
  const today = new Date().toISOString().slice(0, 10);
  const fmtDue = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
  const owner = (m: typeof matters[number]) => companies.find((c) => c.id === m.companyId)?.name ?? (g.kind === "family" ? `${g.parentName || "Personal"} (personal)` : "");
  let sent = 0;
  for (const mem of members) {
    const blocks = matters.map((m) => {
      const r = reqs.filter((x) => x.matterId === m.id);
      const t = tasks.filter((x) => x.matterId === m.id);
      const link = `${base}/portal/${mem.token}/m/${m.id}`;
      const need = r.length || t.length;
      return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #e6e0d6;border-radius:8px">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a1f2b">${escHtml(owner(m))}</p>
        <p style="margin:0 0 8px"><strong>${escHtml(m.title)}</strong>${m.clioMatter ? ` <span style="color:#888;font-size:12px">· Matter ${escHtml(m.clioMatter.split("-")[0])}</span>` : ""}</p>
        ${need ? `<ul style="margin:0 0 8px 18px;padding:0">${r.map((x) => `<li style="margin:0 0 4px">${escHtml(x.title)}${x.dueOn ? ` <span style="color:${x.dueOn < today ? "#b42318" : "#555"};font-size:12px">— ${x.dueOn < today ? "was due" : "due"} ${fmtDue(x.dueOn)}</span>` : ""}</li>`).join("")}${t.map((x) => `<li style="margin:0 0 4px">${escHtml(x.title)}</li>`).join("")}</ul>` : `<p style="margin:0 0 8px;color:#555;font-size:13px">Nothing needed from you right now.</p>`}
        <a href="${link}" style="font-size:13px;color:#7a1f2b">Open this matter →</a>
      </div>`;
    }).join("");
    const who = mem.name.trim() ? escHtml(mem.name.trim()) : "there";
    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:600px;line-height:1.6">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${escHtml(FIRM.name)}</p>
        <p style="margin:0 0 12px">Hi ${who},</p>
        <p style="margin:0 0 14px">Here is where everything stands across your ${matters.length} open matter${matters.length === 1 ? "" : "s"}${g.kind === "family" ? ` for ${escHtml(g.name)}` : ""}, and what we still need from you.</p>
        ${extraNote.trim() ? `<p style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #7a1f2b;background:#faf7f2;white-space:pre-wrap">${escHtml(extraNote.trim())}</p>` : ""}
        ${blocks}
        <p style="margin:18px 0"><a href="${base}/portal/${mem.token}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Open your portal</a></p>
        <p style="margin:0;font-size:12px;color:#888">Each requested item has its own upload button in the portal. Reply to anything by writing in that matter's messages.</p>
      </div>`;
    const r = await sendEmail({ to: mem.email, fromName: `${FIRM.name} — Client Portal`, subject: `Where everything stands — ${g.name}`, html, headers: { "X-Entity-Ref-ID": randomBytes(12).toString("hex") } });
    if (r.sent) sent++;
  }
  if (reqs.length) await db.update(portalRequests).set({ remindedAt: new Date() }).where(inArray(portalRequests.id, reqs.map((r) => r.id)));
  await audit(session.email, "update", "portal-group", String(groupId), `Whole-file summary emailed to ${sent} member(s): ${matters.length} matters, ${reqs.length} open requests`);
  reval(groupId);
  return { ok: true as const, sent, items: reqs.length + tasks.length };
}
