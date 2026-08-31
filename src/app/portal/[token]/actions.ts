"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { portalMatters, portalTasks, portalMessages, portalDocs, portalMembers } from "@/db/schema";
import { verifiedPortalCtx } from "@/lib/portal-access";

type Result = { ok: boolean; error?: string };

/** A matter the member may touch: belongs to their group and is open. */
async function memberMatter(token: string, matterId: number) {
  const ctx = await verifiedPortalCtx(token);
  if (!ctx || !db) return null;
  const [m] = await db.select().from(portalMatters).where(and(eq(portalMatters.id, matterId), eq(portalMatters.groupId, ctx.group.id)));
  if (!m || m.status !== "open") return null;
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
  reval(token, matterId);
  return { ok: true };
}
