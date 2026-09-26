"use server";

import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { intakeSubmissions, settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { isBlobConfigured } from "@/lib/blob";
import { getDocSpec } from "@/lib/documents/legal-specs";
import { renderDoc, wrapForWeb, wrapForPreview, wrapForWord } from "@/lib/documents/legal";

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
  const footerSub = String(answers.testatorFullName ?? "").trim();
  const { body, missing, footnotes } = renderDoc(spec, answers, optionals ?? {});
  return {
    ok: true as const,
    label: spec.label,
    footerName: spec.footerName,
    html: wrapForWeb(spec, body, footnotes, footerSub),
    previewHtml: wrapForPreview(spec, body, footnotes, footerSub),
    wordHtml: wrapForWord(spec, body, footnotes, footerSub),
    missing,
  };
}

/* ============================ Template bank ============================== */

import { and, asc as ascOrder, desc as descOrder } from "drizzle-orm";
import { docTemplates, generatedDocs } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { extractDocxText, detectFields } from "@/lib/documents/merge";
import { caseFieldValues, STANDARD_FIELDS } from "@/lib/documents/case-fields";
import { generateFromTemplate, type GenerateOutput } from "@/lib/documents/generate";
import { aiConfig } from "@/lib/ai/config";
import { activeModel } from "@/lib/ai/vision";

export type BankTemplate = {
  id: number; name: string; folder: string; description: string; docType: string;
  url: string | null; fields: string[]; sizeBytes: number | null; isDocx: boolean; createdAt: string;
};

const DEFAULT_FOLDERS = [
  "Personal Injury", "Civil Litigation", "Debt Defense", "Debt Collection",
  "Family Law", "Criminal Defense", "Estate & Probate", "Engagement Letters",
  "General Correspondence",
];

const DOC_TYPES = ["letter", "engagement-letter", "discovery-requests", "motion", "pleading", "notice", "agreement", "other"];

function rowToBank(t: typeof docTemplates.$inferSelect): BankTemplate {
  return {
    id: t.id, name: t.name, folder: t.folder, description: t.description, docType: t.docType,
    url: t.url, fields: Array.isArray(t.fields) ? (t.fields as string[]) : [],
    sizeBytes: t.sizeBytes, isDocx: /\.docx$/i.test(t.pathname ?? t.name),
    createdAt: t.createdAt.toISOString(),
  };
}

/** The whole bank + folder list. Also migrates the old template shelf
 *  (settings "documents.templates") into the bank's Inbox, once. */
export async function listTemplateBank(): Promise<{ templates: BankTemplate[]; folders: string[]; standardFields: { name: string; label: string }[] }> {
  await requireAdmin();
  if (!db) return { templates: [], folders: DEFAULT_FOLDERS, standardFields: STANDARD_FIELDS };
  await ensureDiscoveryTables();

  // One-time migration of the legacy shelf.
  try {
    const legacy = await readTemplates();
    if (legacy.length) {
      for (const l of legacy) {
        await db.insert(docTemplates).values({ name: l.name, folder: "", url: l.url, pathname: l.pathname, createdBy: "migration" });
      }
      await writeTemplates([]);
    }
  } catch { /* best-effort */ }

  const rows = await db.select().from(docTemplates).where(eq(docTemplates.archived, false)).orderBy(ascOrder(docTemplates.folder), ascOrder(docTemplates.name));
  const folders = [...new Set([...DEFAULT_FOLDERS, ...rows.map((r) => r.folder).filter(Boolean)])];
  return { templates: rows.map(rowToBank), folders, standardFields: STANDARD_FIELDS };
}

/** Upload one or many Word templates into the Inbox (the drop bucket). */
export async function uploadBankTemplates(formData: FormData) {
  const session = await requireAdmin();
  if (!isBlobConfigured()) return { ok: false as const, error: "File storage isn't configured yet." };
  if (!db) return { ok: false as const, error: "Database not configured." };
  await ensureDiscoveryTables();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false as const, error: "Choose at least one file." };
  const added: BankTemplate[] = [];
  const skipped: string[] = [];
  for (const file of files.slice(0, 60)) {
    const okType = /\.(docx?|rtf|odt)$/i.test(file.name);
    if (!okType || file.size > 8 * 1024 * 1024) { skipped.push(file.name); continue; }
    const blob = await put(`doc-templates/${file.name}`, file, { access: "public", addRandomSuffix: true });
    let docText = "";
    let fields: string[] = [];
    if (/\.docx$/i.test(file.name)) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        docText = await extractDocxText(bytes, 80000);
        fields = detectFields(docText);
      } catch { /* keep file even if unreadable */ }
    }
    const [row] = await db
      .insert(docTemplates)
      .values({
        name: file.name.replace(/\.(docx?|rtf|odt)$/i, ""), folder: "", url: blob.url, pathname: blob.pathname,
        contentType: file.type || null, sizeBytes: file.size, fields, docText, createdBy: session.email,
      })
      .returning();
    added.push(rowToBank(row));
  }
  await audit(session.email, "upload", "doc-template", String(added.length), `Uploaded ${added.length} template(s) to the Inbox`);
  return { ok: true as const, added, skipped };
}

/** Rename / move / describe / retype a template. */
export async function updateBankTemplate(id: number, patch: { name?: string; folder?: string; description?: string; docType?: string }) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.name === "string" && patch.name.trim()) set.name = patch.name.trim().slice(0, 255);
  if (typeof patch.folder === "string") set.folder = patch.folder.trim().slice(0, 120);
  if (typeof patch.description === "string") set.description = patch.description.trim().slice(0, 2000);
  if (typeof patch.docType === "string" && DOC_TYPES.includes(patch.docType)) set.docType = patch.docType;
  await db.update(docTemplates).set(set).where(eq(docTemplates.id, id));
  await audit(session.email, "update", "doc-template", String(id), "Updated template details");
  return { ok: true as const };
}

export async function deleteBankTemplate(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false as const };
  await db.update(docTemplates).set({ archived: true, updatedAt: new Date() }).where(eq(docTemplates.id, id));
  await audit(session.email, "delete", "doc-template", String(id), "Archived a template");
  return { ok: true as const };
}

/**
 * "Let AI.fred sort these": classify every Inbox template into a folder,
 * type, clean name, and a "use this when…" description — via the firm's own
 * AI server. Templates without readable text are left for a human.
 */
export async function aiSortInbox() {
  const session = await requireAdmin();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const cfg = aiConfig();
  if (!cfg) return { ok: false as const, error: "The AI isn't configured yet." };
  await ensureDiscoveryTables();
  // Whichever model is loaded right now does the filing (vision or text).
  const sortModel = (await activeModel())?.model ?? cfg.model;

  const inbox = await db.select().from(docTemplates).where(and(eq(docTemplates.folder, ""), eq(docTemplates.archived, false))).limit(50);
  const rows = await db.select({ folder: docTemplates.folder }).from(docTemplates).where(eq(docTemplates.archived, false));
  const folders = [...new Set([...DEFAULT_FOLDERS, ...rows.map((r) => r.folder).filter(Boolean)])];

  let sorted = 0;
  const left: string[] = [];
  for (const t of inbox) {
    if (!t.docText.trim()) { left.push(`${t.name} (no readable text — is it a .docx?)`); continue; }
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: sortModel, stream: false, temperature: 0.1,
          messages: [
            { role: "system", content: "You are filing a law firm's Word templates. Reply with ONLY a JSON object, no prose: {\"folder\": string, \"doc_type\": string, \"name\": string, \"description\": string}. folder MUST be one of the provided folders (pick \"Engagement Letters\" for engagement/fee agreements regardless of practice area). doc_type MUST be one of: letter, engagement-letter, discovery-requests, motion, pleading, notice, agreement, other. name: a clean human title. description: one sentence starting \"Use this when\"." },
            { role: "user", content: `SORT_TEMPLATE_REQUEST\nFolders: ${folders.join(" | ")}\nFilename: ${t.name}\n\nDocument text (excerpt):\n${t.docText.slice(0, 3000)}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content ?? "");
      const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      const parsed = JSON.parse(jsonText) as { folder?: string; doc_type?: string; name?: string; description?: string };
      const folder = folders.find((f) => f.toLowerCase() === String(parsed.folder ?? "").toLowerCase()) ?? "General Correspondence";
      const docType = DOC_TYPES.includes(String(parsed.doc_type)) ? String(parsed.doc_type) : "other";
      await db.update(docTemplates).set({
        folder,
        docType,
        name: String(parsed.name ?? t.name).trim().slice(0, 255) || t.name,
        description: String(parsed.description ?? "").trim().slice(0, 2000),
        updatedAt: new Date(),
      }).where(eq(docTemplates.id, t.id));
      sorted++;
    } catch (e) {
      left.push(`${t.name} (${(e as Error).message.slice(0, 60)})`);
    }
  }
  await audit(session.email, "update", "doc-template", "inbox", `AI.fred sorted ${sorted} template(s)`);
  return { ok: true as const, sorted, left };
}

/** Auto-fill values for the form builder, given a matter number. */
export async function getCaseFieldDefaults(matter: string): Promise<Record<string, string>> {
  await requireAdmin();
  return caseFieldValues(matter);
}

/** The form-builder generate path (AI.fred has its own via chat tools). */
export async function generateBankDocument(input: { templateId: number; matter?: string; fields?: Record<string, string>; nameHint?: string }): Promise<GenerateOutput> {
  const session = await requireAdmin();
  return generateFromTemplate({ templateId: Number(input.templateId), matter: input.matter, fields: input.fields, nameHint: input.nameHint, byEmail: session.email });
}

/** Recent generated documents (the paper trail), newest first. */
export async function listGeneratedDocs(matter?: string) {
  await requireAdmin();
  if (!db) return [];
  try {
    const rows = matter?.trim()
      ? await db.select().from(generatedDocs).where(eq(generatedDocs.matter, matter.trim())).orderBy(descOrder(generatedDocs.id)).limit(50)
      : await db.select().from(generatedDocs).orderBy(descOrder(generatedDocs.id)).limit(50);
    return rows.map((r) => ({ id: r.id, name: r.name, matter: r.matter, byEmail: r.byEmail, createdAt: r.createdAt.toISOString(), downloadPath: `/api/admin/documents/generated/${r.id}` }));
  } catch {
    return [];
  }
}
