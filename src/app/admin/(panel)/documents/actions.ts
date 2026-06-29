"use server";

import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { intakeSubmissions, settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";
import { getTemplate, fillTemplate } from "@/lib/documents/templates";

const TEMPLATES_KEY = "documents.templates";
type TemplateFile = { id: string; name: string; url: string; pathname: string; uploadedAt: string };

async function readTemplates(): Promise<TemplateFile[]> {
  if (!db) return [];
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, TEMPLATES_KEY));
    return Array.isArray(row?.value) ? (row!.value as TemplateFile[]) : [];
  } catch {
    return [];
  }
}

async function writeTemplates(list: TemplateFile[]) {
  if (!db) return;
  await db
    .insert(settings)
    .values({ key: TEMPLATES_KEY, value: list, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: list, updatedAt: new Date() } });
}

/** Upload a firm Word template (.doc/.docx) for staff to use when drafting. */
export async function uploadTemplate(formData: FormData) {
  const session = await requireAdmin();
  if (!isBlobConfigured()) return { ok: false as const, error: "File storage isn't configured yet." };
  if (!db) return { ok: false as const, error: "Database not configured." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Choose a file to upload." };

  const okType =
    /\.(docx?|rtf|odt)$/i.test(file.name) ||
    ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type);
  if (!okType) return { ok: false as const, error: "Upload a Word document (.doc or .docx)." };
  if (file.size > 4.4 * 1024 * 1024) return { ok: false as const, error: "File is too large (max ~4 MB)." };

  const blob = await put(`doc-templates/${file.name}`, file, { access: "public", addRandomSuffix: true });
  const entry: TemplateFile = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    url: blob.url,
    pathname: blob.pathname,
    uploadedAt: new Date().toISOString(),
  };
  await writeTemplates([entry, ...(await readTemplates())]);
  await audit(session.email, "upload", "doc-template", entry.id, `Uploaded template ${file.name}`);
  return { ok: true as const, template: entry };
}

/** Remove an uploaded template from the list. */
export async function removeTemplate(id: string) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  await writeTemplates((await readTemplates()).filter((t) => t.id !== id));
  await audit(session.email, "delete", "doc-template", id, "Removed a document template");
  return { ok: true as const };
}

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
