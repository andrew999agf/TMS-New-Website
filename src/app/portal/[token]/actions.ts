"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { portalMatters, portalTasks, portalMessages, portalDocs, portalMembers } from "@/db/schema";
import { verifiedPortalCtx, type PortalCtx } from "@/lib/portal-access";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { SHARE_LEAD_TEAM_KEY, SHARE_LEAD_TEAM_DEFAULT } from "@/lib/share/settings";
import { FIRM } from "@/lib/firm";

type Result = { ok: boolean; error?: string };

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Best-effort heads-up to the firm when a client acts in the portal — a new
 * matter, an upload, or a message. Goes to the lead team (the same list the
 * share-folder upload alerts use), with a button straight to the matter in
 * the admin Case Portal. Never blocks or fails the client's action.
 */
async function notifyFirm(ctx: PortalCtx, matterId: number, matterTitle: string, what: string, detail: string) {
  try {
    const team = await getSetting<string[]>(SHARE_LEAD_TEAM_KEY, SHARE_LEAD_TEAM_DEFAULT);
    const list = (Array.isArray(team) && team.length ? team : SHARE_LEAD_TEAM_DEFAULT).filter(Boolean);
    if (!list.length) return;
    const host = ((await headers()).get("host") ?? "").trim();
    const base = host ? `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`);
    const link = `${base}/admin/case-portal/${ctx.group.id}/matter/${matterId}`;
    const who = ctx.member.name.trim() || ctx.member.email;
    const html = `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:560px;line-height:1.6">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">${escHtml(FIRM.name)} — Client Portal</p>
        <p style="margin:0 0 12px"><strong>${escHtml(who)}</strong> (${escHtml(ctx.group.name)}) ${escHtml(what)} on <strong>${escHtml(matterTitle)}</strong>.</p>
        ${detail ? `<p style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #7a1f2b;background:#faf7f2;font-size:14px;white-space:pre-wrap">${escHtml(detail)}</p>` : ""}
        <p style="margin:18px 0">
          <a href="${link}" style="background:#7a1f2b;color:#fbf7f0;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Open in the Case Portal</a>
        </p>
      </div>`;
    await sendEmail({ to: list[0], cc: list.slice(1), fromName: `${FIRM.name} — Client Portal`, subject: `Portal: ${who} ${what} — ${matterTitle}`, html });
  } catch {
    /* notifications never block the client */
  }
}

/** A matter the member may touch: belongs to their group and is open. */
async function memberMatter(token: string, matterId: number) {
  const ctx = await verifiedPortalCtx(token);
  if (!ctx || !db) return null;
  const [m] = await db.select().from(portalMatters).where(and(eq(portalMatters.id, matterId), eq(portalMatters.groupId, ctx.group.id)));
  if (!m || m.status !== "open" || m.hidden) return null;
  return { ctx, matter: m };
}

const reval = (token: string, matterId: number) => {
  revalidatePath(`/portal/${token}`);
  revalidatePath(`/portal/${token}/m/${matterId}`);
};

/** The client checking off (or unchecking) one of THEIR to-do items. */
export async function clientToggleTask(token: string, taskId: number, done: boolean): Promise<Result> {
  if (!db) return { ok: false };
  const [t] = await db.select().from(portalTasks).where(eq(portalTasks.id, taskId));
  if (!t || t.kind !== "client") return { ok: false, error: "Not found." };
  const mm = await memberMatter(token, t.matterId);
  if (!mm) return { ok: false, error: "Not allowed." };
  await db.update(portalTasks).set({ done, doneAt: done ? new Date() : null }).where(eq(portalTasks.id, taskId));
  reval(token, t.matterId);
  return { ok: true };
}

/** The client posting into the matter's correspondence thread. */
export async function clientPostMessage(token: string, matterId: number, body: string): Promise<Result> {
  const mm = await memberMatter(token, matterId);
  if (!mm || !db) return { ok: false, error: "Not allowed." };
  const clean = body.trim().slice(0, 20000);
  if (!clean) return { ok: false };
  await db.insert(portalMessages).values({
    matterId,
    author: mm.ctx.member.name.trim() || mm.ctx.member.email,
    fromClient: true,
    body: clean,
  });
  await notifyFirm(mm.ctx, matterId, mm.matter.title, "replied in the correspondence", clean.slice(0, 500));
  reval(token, matterId);
  return { ok: true };
}

/** Record a document the client uploaded (always into the Client Documents tab). */
export async function clientRegisterDoc(token: string, matterId: number, input: {
  name: string; file: { url: string; pathname: string; contentType?: string; size?: number };
}): Promise<Result> {
  const mm = await memberMatter(token, matterId);
  if (!mm || !db) return { ok: false, error: "Not allowed." };
  // The blob must have come through the portal authorizer for this group —
  // its pathname prefix proves it. Anything else is refused.
  if (!input.file?.url || !input.file.pathname?.startsWith(`client-portal/${mm.ctx.group.id}/`)) {
    return { ok: false, error: "Upload didn't complete — try again." };
  }
  await db.insert(portalDocs).values({
    matterId,
    tab: "client",
    party: "",
    name: input.name.trim().slice(0, 255) || "Document",
    url: input.file.url,
    pathname: input.file.pathname,
    contentType: input.file.contentType ?? null,
    sizeBytes: input.file.size ?? null,
    uploadedBy: mm.ctx.member.email,
  });
  await db.update(portalMembers).set({ lastAccessAt: new Date() }).where(eq(portalMembers.id, mm.ctx.member.id));
  // One heads-up per batch: skip the email when this member already uploaded
  // to this matter in the last ten minutes (multi-file drops = one email).
  try {
    const recent = await db
      .select({ id: portalDocs.id })
      .from(portalDocs)
      .where(and(
        eq(portalDocs.matterId, matterId),
        eq(portalDocs.uploadedBy, mm.ctx.member.email),
        gt(portalDocs.createdAt, new Date(Date.now() - 10 * 60_000)),
        ne(portalDocs.name, input.name.trim().slice(0, 255) || "Document"),
      ))
      .limit(1);
    if (!recent.length) await notifyFirm(mm.ctx, matterId, mm.matter.title, "uploaded new documents", "");
  } catch { /* best-effort */ }
  reval(token, matterId);
  return { ok: true };
}

/**
 * The client opening a NEW matter — only when the firm has switched that on
 * for this group. Created as an open transactional matter; the firm is
 * emailed so it can be triaged (retitled, repostured, or hidden).
 */
export async function clientCreateMatter(token: string, input: { title: string; details: string }): Promise<Result & { id?: number }> {
  const ctx = await verifiedPortalCtx(token);
  if (!ctx || !db) return { ok: false, error: "Not allowed." };
  if (!ctx.group.clientCanCreateMatters) return { ok: false, error: "Ask the office to open new matters for you." };
  const title = input.title.trim().slice(0, 255);
  if (!title) return { ok: false, error: "Give the matter a short name." };
  const details = input.details.trim().slice(0, 4000);
  const [row] = await db
    .insert(portalMatters)
    .values({ groupId: ctx.group.id, title, posture: "transactional", status: "open", notes: details ? `Opened by ${ctx.member.email} via the portal:\n${details}` : `Opened by ${ctx.member.email} via the portal.` })
    .returning({ id: portalMatters.id });
  if (details) {
    await db.insert(portalMessages).values({ matterId: row.id, author: ctx.member.name.trim() || ctx.member.email, fromClient: true, body: details });
  }
  await notifyFirm(ctx, row.id, title, "opened a new matter", details);
  revalidatePath(`/portal/${token}`);
  return { ok: true, id: row.id };
}
