"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getTemplate, fillTemplate } from "@/lib/documents/templates";

/**
 * Render a draft document for an intake submission. The template body is kept
 * server-side; this returns the filled text plus the list of fields still
 * blank (so the UI can show how complete the draft is).
 */
export async function renderDocument(submissionId: number, templateId: string) {
  await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };

  const tpl = getTemplate(templateId);
  if (!tpl) return { ok: false as const, error: "Unknown document type." };

  const [row] = await db.select().from(intakeSubmissions).where(eq(intakeSubmissions.id, submissionId));
  if (!row) return { ok: false as const, error: "Submission not found." };

  const answers = (row.answers as Record<string, unknown>) ?? {};
  const { text, missing } = fillTemplate(tpl.body, answers);
  return { ok: true as const, label: tpl.label, text, missing };
}
