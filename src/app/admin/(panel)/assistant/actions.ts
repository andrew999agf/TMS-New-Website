"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { assistantThreads, assistantMessages } from "@/db/schema";

export type ThreadRow = { id: number; mode: string; title: string; updatedAt: string };
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
      .select({ id: assistantThreads.id, mode: assistantThreads.mode, title: assistantThreads.title, updatedAt: assistantThreads.updatedAt })
      .from(assistantThreads)
      .where(eq(assistantThreads.userEmail, session.email))
      .orderBy(desc(assistantThreads.updatedAt))
      .limit(100);
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
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
