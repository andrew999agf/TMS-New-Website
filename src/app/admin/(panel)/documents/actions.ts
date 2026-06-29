"use server";

import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { intakeSubmissions, settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";
import { getDocSpec } from "@/lib/documents/legal-specs";
import { renderDoc, wrapForWeb, wrapForWord } from "@/lib/documents/legal";

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
 * Render a polished legal document for an intake submission. Returns the
 * formatted HTML (for on-screen preview and browser print → PDF), a
 * Word-compatible (.doc) HTML version, and the list of fields still blank.
 * `optionals` carries the user's optional-provision choices: an edited string
 * to include with that text, or false to exclude.
 */
export async function generateLegalDoc(
  submissionId: number,
  docId: string,
  optionals: Record<string, string | false>,
) {
  await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };

  const spec = getDocSpec(docId);
  if (!spec) return { ok: false as const, error: "Unknown document type." };

  const [row] = await db.select().from(intakeSubmissions).where(eq(intakeSubmissions.id, submissionId));
  if (!row) return { ok: false as const, error: "Submission not found." };

  const answers = (row.answers as Record<string, unknown>) ?? {};
  const { body, missing } = renderDoc(spec, answers, optionals ?? {});
  return {
    ok: true as const,
    label: spec.label,
    footerName: spec.footerName,
    html: wrapForWeb(spec, body),
    wordHtml: wrapForWord(spec, body),
    missing,
  };
}
