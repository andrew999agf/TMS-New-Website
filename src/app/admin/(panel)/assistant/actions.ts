"use server";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath, isFullAdminRole } from "@/lib/admin-sections";
import { db } from "@/db";
import { admins, assistantThreads, assistantMessages, assistantPrefs, assistantMemories } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

export type ThreadRow = { id: number; mode: string; title: string; updatedAt: string; sharedFrom?: string };
export type ThreadMsg = { role: "user" | "assistant"; content: string };

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) throw new Error("Not allowed");
  return session;
}

/** The caller's saved conversations, newest first. */
export async function listAssistantThreads(): Promise<ThreadRow[]> {
  const session = await guard();
  if (!db) return [];
  try {
    const rows = await db
      .select({ id: assistantThreads.id, mode: assistantThreads.mode, title: assistantThreads.title, updatedAt: assistantThreads.updatedAt, sharedFrom: assistantThreads.sharedFrom })
      .from(assistantThreads)
      .where(eq(assistantThreads.userEmail, session.email))
      .orderBy(desc(assistantThreads.updatedAt))
      .limit(100);
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString(), sharedFrom: r.sharedFrom || undefined }));
  } catch {
    return [];
  }
}

/** Full message history of one of the caller's threads. */
export async function getAssistantThread(id: number): Promise<{ ok: boolean; messages: ThreadMsg[] }> {
  const session = await guard();
  if (!db) return { ok: false, messages: [] };
  try {
    const [t] = await db
      .select({ id: assistantThreads.id })
      .from(assistantThreads)
      .where(and(eq(assistantThreads.id, id), eq(assistantThreads.userEmail, session.email)));
    if (!t) return { ok: false, messages: [] };
    const rows = await db
      .select({ role: assistantMessages.role, content: assistantMessages.content })
      .from(assistantMessages)
      .where(eq(assistantMessages.threadId, id))
      .orderBy(asc(assistantMessages.id));
    return { ok: true, messages: rows.filter((r): r is ThreadMsg => r.role === "user" || r.role === "assistant") };
  } catch {
    return { ok: false, messages: [] };
  }
}

export async function renameAssistantThread(id: number, title: string) {
  const session = await guard();
  if (!db) return { ok: false as const };
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) return { ok: false as const };
  try {
    await db
      .update(assistantThreads)
      .set({ title: clean })
      .where(and(eq(assistantThreads.id, id), eq(assistantThreads.userEmail, session.email)));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function deleteAssistantThread(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    // Messages cascade with the thread.
    await db.delete(assistantThreads).where(and(eq(assistantThreads.id, id), eq(assistantThreads.userEmail, session.email)));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

/* --------------------------- preferences & memory ------------------------ */

export type AssistantPrefs = { about: string; style: string };
export type MemoryRow = { id: number; scope: "user" | "firm"; content: string; createdAt: string };

/** The caller's custom instructions plus every memory that applies to them. */
export async function getAssistantSettings(): Promise<{ prefs: AssistantPrefs; memories: MemoryRow[]; fullAdmin: boolean }> {
  const session = await guard();
  const empty = { prefs: { about: "", style: "" }, memories: [] as MemoryRow[], fullAdmin: isFullAdminRole(session.role) };
  if (!db) return empty;
  try {
    await ensureDiscoveryTables();
    const [row] = await db.select().from(assistantPrefs).where(eq(assistantPrefs.userEmail, session.email));
    const mems = await db
      .select()
      .from(assistantMemories)
      .where(or(eq(assistantMemories.scope, "firm"), and(eq(assistantMemories.scope, "user"), eq(assistantMemories.userEmail, session.email))))
      .orderBy(desc(assistantMemories.id))
      .limit(300);
    return {
      ...empty,
      prefs: { about: row?.about ?? "", style: row?.style ?? "" },
      memories: mems.map((m) => ({ id: m.id, scope: m.scope === "firm" ? "firm" : "user", content: m.content, createdAt: m.createdAt.toISOString() })),
    };
  } catch {
    return empty;
  }
}

export async function saveAssistantPrefs(input: AssistantPrefs) {
  const session = await guard();
  if (!db) return { ok: false as const };
  const about = String(input.about ?? "").slice(0, 800);
  const style = String(input.style ?? "").slice(0, 800);
  try {
    await ensureDiscoveryTables();
    await db
      .insert(assistantPrefs)
      .values({ userEmail: session.email, about, style, updatedAt: new Date() })
      .onConflictDoUpdate({ target: assistantPrefs.userEmail, set: { about, style, updatedAt: new Date() } });
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

/** Forget one memory: your own personal notes always; firm-wide notes only
 *  for full admins. */
export async function deleteAssistantMemory(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [m] = await db.select().from(assistantMemories).where(eq(assistantMemories.id, id));
    if (!m) return { ok: true as const };
    const allowed = m.scope === "user" ? m.userEmail === session.email : isFullAdminRole(session.role);
    if (!allowed) return { ok: false as const };
    await db.delete(assistantMemories).where(eq(assistantMemories.id, id));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

/* --------------------------------- sharing ------------------------------- */

export type ShareTarget = { name: string; email: string };

/** Staff the caller can share a conversation with (everyone but themselves). */
export async function listShareTargets(): Promise<ShareTarget[]> {
  const session = await guard();
  if (!db) return [];
  try {
    const rows = await db.select({ name: admins.name, email: admins.email }).from(admins).orderBy(asc(admins.name));
    return rows.filter((r) => r.email !== session.email);
  } catch {
    return [];
  }
}

/**
 * Share a conversation: each recipient gets their own snapshot copy, marked
 * with who it came from. Copies are theirs — they can continue the chat, and
 * later edits never leak back to the original.
 */
export async function shareAssistantThread(threadId: number, emails: string[]) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const targets = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  if (!targets.length) return { ok: false as const, error: "Pick at least one person." };
  try {
    await ensureDiscoveryTables();
    const [t] = await db.select().from(assistantThreads).where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.userEmail, session.email)));
    if (!t) return { ok: false as const, error: "That conversation isn't yours to share." };
    const msgs = await db
      .select({ role: assistantMessages.role, content: assistantMessages.content })
      .from(assistantMessages)
      .where(eq(assistantMessages.threadId, threadId))
      .orderBy(asc(assistantMessages.id));
    const valid = await db.select({ email: admins.email }).from(admins).where(inArray(admins.email, targets));
    let shared = 0;
    for (const v of valid) {
      if (v.email === session.email) continue;
      const [nt] = await db
        .insert(assistantThreads)
        .values({ userEmail: v.email, mode: t.mode, title: t.title, sharedFrom: session.name || session.email })
        .returning({ id: assistantThreads.id });
      if (msgs.length) await db.insert(assistantMessages).values(msgs.map((m) => ({ threadId: nt.id, role: m.role, content: m.content })));
      shared++;
    }
    return { ok: true as const, shared };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message.slice(0, 200) };
  }
}
