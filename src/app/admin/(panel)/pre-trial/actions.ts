"use server";

import { revalidatePath } from "next/cache";
import { eq, max } from "drizzle-orm";
import { db } from "@/db";
import { trialCases, trialDeadlines } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { getTemplate, shiftISO } from "@/lib/pretrial/template";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/pre-trial", session.role, session.permissions)) throw new Error("Not allowed.");
  return session;
}

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Accept only a well-formed YYYY-MM-DD, otherwise null (no date set). */
const isoDate = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export type CaseInput = {
  name: string;
  matter?: string;
  causeNumber?: string;
  court?: string;
  trialDate?: string;
  notes?: string;
  /** Template to seed the checklist with when creating. */
  templateId?: string;
};

/** Create a case and, when a trial date and template are given, seed its checklist. */
export async function createTrialCase(input: CaseInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a case name." };
  try {
    const trialDate = isoDate(input.trialDate);
    const [row] = await db
      .insert(trialCases)
      .values({
        name,
        matter: str(input.matter, 500),
        causeNumber: str(input.causeNumber, 128),
        court: str(input.court),
        trialDate,
        notes: str(input.notes, 4000),
        createdBy: session.email,
      })
      .returning({ id: trialCases.id });

    let seeded = 0;
    const tpl = getTemplate(str(input.templateId, 64));
    if (tpl && tpl.items.length) {
      // Without a trial date the items still go in, just undated — the admin can
      // set the trial date later and re-run setup to fill the dates in.
      const values = tpl.items.map((it, i) => ({
        caseId: row.id,
        title: it.title.slice(0, 255),
        dueDate: trialDate ? shiftISO(trialDate, -it.daysBefore) : null,
        notes: it.notes ?? "",
        sort: i,
      }));
      await db.insert(trialDeadlines).values(values);
      seeded = values.length;
    }

    await audit(session.email, "create", "trial-case", String(row.id), `Created case "${name}"${seeded ? ` with ${seeded} deadlines` : ""}`);
    revalidatePath("/admin/pre-trial");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[pre-trial] createTrialCase failed:", err);
    return { ok: false as const, error: "Couldn't create the case. Run Settings → Database updates, then try again." };
  }
}

export async function updateTrialCase(id: number, input: CaseInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a case name." };
  try {
    await db
      .update(trialCases)
      .set({
        name,
        matter: str(input.matter, 500),
        causeNumber: str(input.causeNumber, 128),
        court: str(input.court),
        trialDate: isoDate(input.trialDate),
        notes: str(input.notes, 4000),
        updatedAt: new Date(),
      })
      .where(eq(trialCases.id, id));
    await audit(session.email, "update", "trial-case", String(id), `Updated case "${name}"`);
    revalidatePath("/admin/pre-trial");
    revalidatePath(`/admin/pre-trial/${id}`);
    return { ok: true as const };
  } catch (err) {
    console.error("[pre-trial] updateTrialCase failed:", err);
    return { ok: false as const, error: "Couldn't save the case." };
  }
}

export async function setTrialCaseArchived(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(trialCases).set({ archived, updatedAt: new Date() }).where(eq(trialCases.id, id));
    await audit(session.email, "update", "trial-case", String(id), archived ? "Archived case" : "Restored case");
    revalidatePath("/admin/pre-trial");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't update the case." };
  }
}

export async function deleteTrialCase(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.delete(trialDeadlines).where(eq(trialDeadlines.caseId, id));
    await db.delete(trialCases).where(eq(trialCases.id, id));
    await audit(session.email, "delete", "trial-case", String(id), "Deleted case and its deadlines");
    revalidatePath("/admin/pre-trial");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't delete the case." };
  }
}

/**
 * Apply a template to an existing case. Existing deadlines are kept — template
 * items whose title already exists on the case are skipped — so running setup
 * again after adding a trial date tops the list up instead of duplicating it.
 */
export async function applyTemplate(caseId: number, templateId: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const tpl = getTemplate(str(templateId, 64));
  if (!tpl) return { ok: false as const, error: "Unknown template." };
  if (!tpl.items.length) return { ok: true as const, added: 0 };
  try {
    const [c] = await db.select().from(trialCases).where(eq(trialCases.id, caseId));
    if (!c) return { ok: false as const, error: "Case not found." };

    const existing = await db.select({ title: trialDeadlines.title }).from(trialDeadlines).where(eq(trialDeadlines.caseId, caseId));
    const have = new Set(existing.map((r) => r.title.trim().toLowerCase()));
    const [{ n } = { n: 0 }] = await db.select({ n: max(trialDeadlines.sort) }).from(trialDeadlines).where(eq(trialDeadlines.caseId, caseId));
    let sort = (n ?? 0) + 1;

    const values = tpl.items
      .filter((it) => !have.has(it.title.trim().toLowerCase()))
      .map((it) => ({
        caseId,
        title: it.title.slice(0, 255),
        dueDate: c.trialDate ? shiftISO(c.trialDate, -it.daysBefore) : null,
        notes: it.notes ?? "",
        sort: sort++,
      }));
    if (values.length) await db.insert(trialDeadlines).values(values);

    await audit(session.email, "update", "trial-case", String(caseId), `Applied template "${tpl.label}" (+${values.length})`);
    revalidatePath(`/admin/pre-trial/${caseId}`);
    return { ok: true as const, added: values.length };
  } catch (err) {
    console.error("[pre-trial] applyTemplate failed:", err);
    return { ok: false as const, error: "Couldn't apply the template." };
  }
}

/**
 * Recompute every dated deadline from a new trial date, preserving each item's
 * original offset. Used when a trial gets reset — the whole schedule slides.
 */
export async function shiftAllDeadlines(caseId: number, newTrialDate: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const next = isoDate(newTrialDate);
  if (!next) return { ok: false as const, error: "Enter a valid trial date." };
  try {
    const [c] = await db.select().from(trialCases).where(eq(trialCases.id, caseId));
    if (!c) return { ok: false as const, error: "Case not found." };
    if (!c.trialDate) {
      await db.update(trialCases).set({ trialDate: next, updatedAt: new Date() }).where(eq(trialCases.id, caseId));
      revalidatePath(`/admin/pre-trial/${caseId}`);
      return { ok: true as const, moved: 0 };
    }
    const delta = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${c.trialDate}T00:00:00Z`)) / 86_400_000);
    let moved = 0;
    if (delta !== 0) {
      const rows = await db.select().from(trialDeadlines).where(eq(trialDeadlines.caseId, caseId));
      for (const d of rows) {
        if (!d.dueDate) continue;
        await db.update(trialDeadlines).set({ dueDate: shiftISO(d.dueDate, delta) }).where(eq(trialDeadlines.id, d.id));
        moved++;
      }
    }
    await db.update(trialCases).set({ trialDate: next, updatedAt: new Date() }).where(eq(trialCases.id, caseId));
    await audit(session.email, "update", "trial-case", String(caseId), `Trial date → ${next}; shifted ${moved} deadlines by ${delta} days`);
    revalidatePath("/admin/pre-trial");
    revalidatePath(`/admin/pre-trial/${caseId}`);
    return { ok: true as const, moved, delta };
  } catch (err) {
    console.error("[pre-trial] shiftAllDeadlines failed:", err);
    return { ok: false as const, error: "Couldn't move the schedule." };
  }
}

export async function addDeadline(caseId: number, title: string, dueDate?: string, notes?: string) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = str(title, 255);
  if (!clean) return { ok: false as const, error: "Enter a deadline." };
  try {
    const [{ n } = { n: 0 }] = await db.select({ n: max(trialDeadlines.sort) }).from(trialDeadlines).where(eq(trialDeadlines.caseId, caseId));
    await db.insert(trialDeadlines).values({ caseId, title: clean, dueDate: isoDate(dueDate), notes: str(notes, 2000), sort: (n ?? 0) + 1 });
    await audit(session.email, "create", "trial-deadline", String(caseId), `Added "${clean}"`);
    revalidatePath(`/admin/pre-trial/${caseId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't add the deadline." };
  }
}

export async function updateDeadline(id: number, patch: { title?: string; dueDate?: string | null; notes?: string }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      const t = str(patch.title, 255);
      if (!t) return { ok: false as const, error: "Enter a deadline." };
      set.title = t;
    }
    if (patch.dueDate !== undefined) set.dueDate = isoDate(patch.dueDate);
    if (patch.notes !== undefined) set.notes = str(patch.notes, 2000);
    if (Object.keys(set).length === 0) return { ok: true as const };
    const [row] = await db.update(trialDeadlines).set(set).where(eq(trialDeadlines.id, id)).returning({ caseId: trialDeadlines.caseId });
    if (row) revalidatePath(`/admin/pre-trial/${row.caseId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the deadline." };
  }
}

/** Check an item off (stamping who and when) or reopen it. */
export async function toggleDeadline(id: number, done: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db
      .update(trialDeadlines)
      .set({ done, doneAt: done ? new Date() : null, doneBy: done ? (session.name || session.email) : null })
      .where(eq(trialDeadlines.id, id))
      .returning({ caseId: trialDeadlines.caseId });
    if (row) revalidatePath(`/admin/pre-trial/${row.caseId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't update the item." };
  }
}

export async function deleteDeadline(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.delete(trialDeadlines).where(eq(trialDeadlines.id, id)).returning({ caseId: trialDeadlines.caseId });
    if (row) revalidatePath(`/admin/pre-trial/${row.caseId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the item." };
  }
}
