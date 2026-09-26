import "server-only";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { docTemplates, generatedDocs } from "@/db/schema";
import { mergeDocx, type Revision } from "@/lib/documents/merge";
import { caseFieldValues } from "@/lib/documents/case-fields";

/**
 * The one path every generated document takes — the form builder and
 * AI.fred both land here: fetch the real template file, auto-fill the
 * standard fields from the case hub, overlay caller-supplied values, apply
 * any paragraph revisions, store the result, and log it to the matter's
 * paper trail. Returns the admin-gated download path.
 */
export type GenerateInput = {
  templateId: number;
  matter?: string;
  fields?: Record<string, string>;
  revisions?: Revision[];
  nameHint?: string;
  byEmail: string;
};

export type GenerateOutput =
  | { ok: true; id: number; name: string; downloadPath: string; filledFields: string[]; missingFields: string[]; appliedRevisions: number; failedRevisions: { find: string }[] }
  | { ok: false; error: string };

export async function generateFromTemplate(input: GenerateInput): Promise<GenerateOutput> {
  if (!db) return { ok: false, error: "Database not configured." };
  const [tpl] = await db.select().from(docTemplates).where(eq(docTemplates.id, input.templateId));
  if (!tpl || tpl.archived) return { ok: false, error: `No template #${input.templateId}.` };
  if (!tpl.url) return { ok: false, error: "That template has no stored file." };
  if (!/\.docx$/i.test(tpl.pathname ?? tpl.name)) {
    return { ok: false, error: "Only .docx templates can be generated from — re-save this one as .docx in Word and re-upload." };
  }

  let bytes: Uint8Array;
  try {
    const res = await fetch(tpl.url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return { ok: false, error: "Couldn't load the template file from storage." };
  }

  const matter = (input.matter ?? "").trim();
  const auto = await caseFieldValues(matter);
  const fields = { ...auto, ...(input.fields ?? {}) };
  const revisions = (input.revisions ?? []).slice(0, 40).map((r) => ({ find: String(r.find ?? "").slice(0, 500), replace: String(r.replace ?? "").slice(0, 4000) }));

  let merged;
  try {
    merged = await mergeDocx(bytes, fields, revisions);
  } catch (e) {
    return { ok: false, error: `Merge failed: ${(e as Error).message.slice(0, 150)}` };
  }

  const base = (input.nameHint?.trim() || tpl.name.replace(/\.docx?$/i, "")).replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "Document";
  const fileName = `${base}${matter ? ` - ${matter.replace(/[^\w\-. ]+/g, "")}` : ""} - ${new Date().toISOString().slice(0, 10)}.docx`;

  let blobUrl: string | null = null;
  let blobPath: string | null = null;
  try {
    const blob = await put(`generated-docs/${fileName}`, Buffer.from(merged.bytes), {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    blobUrl = blob.url;
    blobPath = blob.pathname;
  } catch {
    return { ok: false, error: "File storage isn't configured — couldn't save the generated document." };
  }

  const [row] = await db
    .insert(generatedDocs)
    .values({ templateId: tpl.id, matter, name: fileName, url: blobUrl, pathname: blobPath, byEmail: input.byEmail })
    .returning({ id: generatedDocs.id });

  return {
    ok: true,
    id: row.id,
    name: fileName,
    downloadPath: `/api/admin/documents/generated/${row.id}`,
    filledFields: merged.filledFields,
    missingFields: merged.missingFields,
    appliedRevisions: merged.appliedRevisions.length,
    failedRevisions: merged.failedRevisions.map((i) => ({ find: revisions[i]?.find ?? "" })),
  };
}
