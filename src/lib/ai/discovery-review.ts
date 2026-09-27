import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs, discoverySets } from "@/db/schema";
import { aiConfig } from "@/lib/ai/config";
import { activeModel } from "@/lib/ai/vision";
import { touchAiLastUsed } from "@/lib/ai/concierge";
import { setAiNotice, clearAiNotice } from "@/lib/ai/notice";
import { renderPdfPages } from "@/lib/documents/pdf-pages";
import { resolvedAiBaseUrl } from "@/lib/ai/runpod";

/**
 * The discovery sweep: AI.fred reads every document in a discovery set and
 * writes a short label + description into the case record, permanently.
 * Photos and scanned PDFs go to the vision model as images; documents with
 * extracted text are labeled from the text (any loaded model can do those).
 *
 * Sweeps run in CHUNKS — each call labels documents for up to ~40 seconds
 * and reports progress, because serverless requests can't run for an hour.
 * The UI keeps calling until nothing is left. Every chunk is independently
 * resumable: state lives on the rows (ai_label_status), so a dropped
 * connection or redeploy mid-sweep loses nothing.
 */

const TIME_BUDGET_MS = 40_000;
const MAX_DOC_BYTES = 25_000_000;
const PAGES_TO_SHOW = [1, 2, 3];
const TEXT_EXCERPT_CHARS = 9_000;

export type SweepResult = {
  total: number;
  labeled: number;      // labeled or flagged illegible — i.e. finished
  remaining: number;
  errors: number;
  /** Image/scan documents skipped because the vision model isn't loaded. */
  needsVision: number;
  done: boolean;
};

const isImage = (ct: string | null) => !!ct && ct.startsWith("image/");
const isPdf = (ct: string | null, name: string) => (!!ct && ct.includes("pdf")) || name.toLowerCase().endsWith(".pdf");

function textOf(pageText: unknown): string {
  const pages = Array.isArray(pageText) ? (pageText as string[]) : [];
  return pages.filter((p) => typeof p === "string" && p.trim()).join("\n").slice(0, TEXT_EXCERPT_CHARS);
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > MAX_DOC_BYTES ? null : buf;
  } catch {
    return null;
  }
}

type Verdict = { label: string; description: string; legible: boolean };

async function askModel(model: string, docName: string, caseLine: string, text: string, images: string[]): Promise<Verdict | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const base = (await resolvedAiBaseUrl()) ?? cfg.baseUrl;
  const system =
    "You label documents produced in discovery for a Texas trial law firm. Reply with ONLY a JSON object, no prose: " +
    '{"label": string, "description": string, "legible": boolean}. ' +
    "label: at most 12 words naming what the document IS (e.g. \"Photo — rear bumper damage, plaintiff's vehicle\", \"Repair estimate, Caliber Collision, $4,850\"). " +
    "description: 2–4 sentences covering the key contents — parties, dates, amounts, what is depicted. " +
    "legible: false ONLY if the document cannot actually be read (blurry scan, handwriting you cannot make out, blank pages) — then say what little can be told and never guess at the rest.";
  const userText =
    `REVIEW_DOC_REQUEST\nCase: ${caseLine}\nFilename: ${docName}\n` +
    (images.length
      ? `The document's ${images.length > 1 ? "first pages are" : "content is"} attached as image(s).`
      : `Extracted text (may be partial):\n${text}`);
  const content = images.length
    ? [{ type: "text", text: userText }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))]
    : userText;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model, stream: false, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = String(j?.choices?.[0]?.message?.content ?? "");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Partial<Verdict>;
    const label = String(parsed.label ?? "").trim().slice(0, 300);
    if (!label) return null;
    return { label, description: String(parsed.description ?? "").trim().slice(0, 4000), legible: parsed.legible !== false };
  } catch {
    return null;
  }
}

async function counts(setId: number): Promise<{ total: number; remaining: number }> {
  const rows = await db!.select({ status: discoveryDocs.aiLabelStatus }).from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
  return { total: rows.length, remaining: rows.filter((r) => !r.status).length };
}

/** Label documents in this set for up to ~40s; call again until done. */
export async function reviewDiscoveryChunk(setId: number, opts: { retryErrors?: boolean } = {}): Promise<SweepResult | { error: string }> {
  if (!db) return { error: "Database not configured." };
  const active = await activeModel();
  if (!active) return { error: "The AI isn't configured yet." };
  const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) return { error: `No discovery set #${setId}.` };
  const caseLine = [set.name, set.matter, set.causeNumber].filter(Boolean).join(" · ");

  if (opts.retryErrors) {
    await db.update(discoveryDocs).set({ aiLabelStatus: "" }).where(and(eq(discoveryDocs.setId, setId), inArray(discoveryDocs.aiLabelStatus, ["error"])));
  }

  const pending = await db
    .select({ id: discoveryDocs.id, name: discoveryDocs.name, url: discoveryDocs.url, contentType: discoveryDocs.contentType, pageText: discoveryDocs.pageText, pageCount: discoveryDocs.pageCount })
    .from(discoveryDocs)
    .where(and(eq(discoveryDocs.setId, setId), eq(discoveryDocs.aiLabelStatus, "")))
    .orderBy(discoveryDocs.id)
    .limit(25);

  const started = Date.now();
  let errors = 0;
  let needsVision = 0;
  let progressed = 0; // rows whose status changed this chunk
  const visionLoaded = active.desired === "vision";
  void touchAiLastUsed();

  for (const doc of pending) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    const text = textOf(doc.pageText);
    let images: string[] = [];
    let flagNote = "";

    if (text.length >= 80) {
      // Enough extracted text to label without looking at pixels.
    } else if (isImage(doc.contentType)) {
      if (!visionLoaded) { needsVision++; continue; }
      const bytes = doc.url ? await fetchBytes(doc.url) : null;
      if (bytes) images = [`data:${doc.contentType};base64,${Buffer.from(bytes).toString("base64")}`];
      else flagNote = "File couldn't be fetched for review.";
    } else if (isPdf(doc.contentType, doc.name)) {
      if (!visionLoaded) { needsVision++; continue; }
      const bytes = doc.url ? await fetchBytes(doc.url) : null;
      images = bytes ? await renderPdfPages(bytes, PAGES_TO_SHOW) : [];
      if (!images.length) flagNote = "Scanned PDF whose pages couldn't be rendered for review.";
    } else if (text.length > 0) {
      // A little text is better than nothing.
    } else {
      flagNote = `Unsupported file type (${doc.contentType || "unknown"}) — needs human review.`;
    }

    if (flagNote) {
      await db.update(discoveryDocs).set({ aiLabel: "Needs human review", aiDescription: flagNote, aiLabelStatus: "illegible", aiLabeledAt: new Date() }).where(eq(discoveryDocs.id, doc.id));
      progressed++;
      continue;
    }

    const verdict = await askModel(active.model, doc.name, caseLine, text, images);
    if (!verdict) {
      errors++;
      progressed++;
      await db.update(discoveryDocs).set({ aiLabelStatus: "error", aiLabeledAt: new Date() }).where(eq(discoveryDocs.id, doc.id));
      continue;
    }
    progressed++;
    await db
      .update(discoveryDocs)
      .set({
        aiLabel: verdict.label,
        aiDescription: verdict.description + (doc.pageCount && doc.pageCount > PAGES_TO_SHOW.length && images.length ? ` (Labeled from the first ${images.length} of ${doc.pageCount} pages.)` : ""),
        aiLabelStatus: verdict.legible ? "labeled" : "illegible",
        aiLabeledAt: new Date(),
      })
      .where(eq(discoveryDocs.id, doc.id));
  }

  const { total, remaining } = await counts(setId);
  // Done when everything has a status — or when a chunk can make no progress
  // at all (every pending document needs the vision model, which isn't
  // loaded). The caller sees needsVision > 0 and can offer the swap.
  const done = remaining === 0 || (progressed === 0 && pending.length > 0);
  try {
    if (!done) {
      await setAiNotice(`AI.fred is reviewing "${set.name}" — ${total - remaining} of ${total} documents labeled.`, { chatBlocked: false, minutes: 15, kind: "review" });
    } else {
      await clearAiNotice();
    }
  } catch { /* notices are a nicety */ }

  return { total, labeled: total - remaining, remaining, errors, needsVision, done };
}

/** Progress for the UI without doing any work. */
export async function reviewStatus(setId: number): Promise<{ total: number; remaining: number; errors: number } | { error: string }> {
  if (!db) return { error: "Database not configured." };
  const rows = await db.select({ status: discoveryDocs.aiLabelStatus }).from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
  return { total: rows.length, remaining: rows.filter((r) => !r.status).length, errors: rows.filter((r) => r.status === "error").length };
}
