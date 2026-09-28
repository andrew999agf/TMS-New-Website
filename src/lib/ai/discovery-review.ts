import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discoveryDocs, discoverySets, shareFiles, shareFolders, productionDocs } from "@/db/schema";
import { aiConfig } from "@/lib/ai/config";
import { activeModel } from "@/lib/ai/vision";
import { touchAiLastUsed } from "@/lib/ai/concierge";
import { setAiNotice, clearAiNotice } from "@/lib/ai/notice";
import { renderPdfPages } from "@/lib/documents/pdf-pages";
import { resolvedAiBaseUrl } from "@/lib/ai/runpod";
import { indexTextChunk, indexStatusFor } from "@/lib/documents/text-index";

/**
 * The discovery sweep: AI.fred reads every document connected to a discovery
 * case — the opposing production, the client pile, portal uploads, and the
 * staged/produced Bates copies — and writes a short label + description into
 * the case record, permanently. The labels are INTERNAL work product: they
 * render in the admin only, never on shared links or the opposing-counsel
 * production page, and staff can edit them.
 *
 * Order of operations, per the firm's playbook: the TEXT pass goes first —
 * any document whose text is (or can be) extracted is labeled by whatever
 * model is loaded. Documents that need eyes (photos, scans) wait for the
 * vision model's turn; the UI swaps once, labels them all, and swaps back.
 * Before any labeling, un-indexed documents get their text pulled (the
 * chunked indexer), so nothing lands in the vision pile just because its
 * text hadn't been read yet.
 *
 * Sweeps run in CHUNKS (~40s each, resumable via ai_label_status on the
 * rows); the UI keeps calling until nothing is left.
 */

const TIME_BUDGET_MS = 40_000;
const MAX_DOC_BYTES = 25_000_000;
const PAGES_TO_SHOW = [1, 2, 3];
const TEXT_EXCERPT_CHARS = 12_000;

export type SweepResult = {
  total: number;
  labeled: number;      // labeled or flagged illegible — i.e. finished
  remaining: number;
  errors: number;
  /** Image/scan documents skipped because the vision model isn't loaded. */
  needsVision: number;
  done: boolean;
  /** Progress line for the dialog when the chunk did prep work. */
  stage?: string;
  /** Case-wide page-note progress — the number people actually watch. */
  pagesDone: number;
  pagesTotal: number;
  /** Documents carrying ANY label status — moves even mid-document, so the
   *  stall watchdog can tell real work from a frozen loop. */
  statusDone: number;
};

/** Sum of readable pages vs. pages already annotated, across the case. */
function pageProgress(targets: ReviewRow[]): { pagesDone: number; pagesTotal: number } {
  let pagesDone = 0, pagesTotal = 0;
  for (const t of targets) {
    const total = t.pageText.length;
    if (!total) continue;
    pagesTotal += total;
    pagesDone += Math.min(t.pageNotes.length, total);
  }
  return { pagesDone, pagesTotal };
}

type ReviewKind = "doc" | "share" | "production";
type ReviewRow = {
  kind: ReviewKind;
  id: number;
  name: string;
  url: string | null;
  contentType: string | null;
  pageText: string[];
  pageNotes: string[];
  pageCount: number | null;
  aiLabelStatus: string;
  aiDescription: string;
  /** For produced copies: lets the description carry the Bates range. */
  bates?: string;
};

/** A labeled text document still needs work until every page has its note. */
const notesIncomplete = (t: ReviewRow) =>
  t.aiLabelStatus === "labeled" && t.pageText.length > 0 && t.pageNotes.length < t.pageText.length;
const needsWork = (t: ReviewRow) => !t.aiLabelStatus || notesIncomplete(t);

const isImage = (ct: string | null, name: string) => (!!ct && ct.startsWith("image/")) || /\.(jpe?g|png)$/i.test(name);
const isPdf = (ct: string | null, name: string) => (!!ct && ct.includes("pdf")) || name.toLowerCase().endsWith(".pdf");
const asPages = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map((p) => (typeof p === "string" ? p : "")) : []);

/**
 * Build the excerpt the model reads: pages tagged with their numbers, sampled
 * ACROSS the whole document (front, middle, back) rather than just the first
 * pages — so a 700-page combined PDF gets notes like "pp. 300–450: medical
 * bills" instead of a summary of its cover sheet.
 */
function textOf(pages: string[]): string {
  const withText = pages.map((p, i) => ({ n: i + 1, t: p.trim() })).filter((x) => x.t);
  if (!withText.length) return "";
  let out = "";
  // Even sampling: take every page while it fits; on big documents this
  // naturally becomes a spread of front/middle/back pages.
  const step = Math.max(1, Math.ceil(withText.length / 60));
  for (let i = 0; i < withText.length; i += step) {
    const x = withText[i];
    const chunk = `[p.${x.n}] ${x.t.slice(0, 900)}\n`;
    if (out.length + chunk.length > TEXT_EXCERPT_CHARS) break;
    out += chunk;
  }
  return out;
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
    "You label documents produced in discovery for a Texas trial law firm. These notes become the firm's PERMANENT case memory: the AI assistant answers attorneys' questions from them WITHOUT re-reading the documents, so be specific and factual. Reply with ONLY a JSON object, no prose: " +
    '{"label": string, "description": string, "legible": boolean}. ' +
    "label: at most 12 words naming what the document IS (e.g. \"Photo — rear bumper damage, plaintiff's vehicle\", \"Repair estimate, Caliber Collision, $4,850\"). " +
    "description: 3–8 sentences of the facts that matter — every party name, date, dollar amount, account/claim/policy number, and key admission or statement you can see. For multi-page documents whose excerpt shows page markers like [p.312], say what lives WHERE (e.g. \"pp. 1–40 bank statements (Frost #4412, Jan–Jun 2025); pp. 300–450 medical bills, Baylor Scott & White\"). Specific enough to answer questions from, never padded, never invented. " +
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

/** Every reviewable document connected to the case, across all three tabs. */
async function reviewTargets(setId: number, matter: string): Promise<ReviewRow[]> {
  const out: ReviewRow[] = [];
  const docs = await db!.select().from(discoveryDocs).where(eq(discoveryDocs.setId, setId));
  for (const d of docs) out.push({ kind: "doc", id: d.id, name: d.name, url: d.url, contentType: d.contentType, pageText: asPages(d.pageText), pageNotes: asPages(d.pageNotes), pageCount: d.pageCount, aiLabelStatus: d.aiLabelStatus, aiDescription: d.aiDescription });
  if (matter) {
    const folders = await db!.select({ id: shareFolders.id }).from(shareFolders).where(and(eq(shareFolders.matter, matter), eq(shareFolders.type, "client")));
    if (folders.length) {
      const files = await db!.select().from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
      for (const f of files) out.push({ kind: "share", id: f.id, name: f.filename, url: f.url, contentType: f.contentType, pageText: asPages(f.pageText), pageNotes: asPages(f.pageNotes), pageCount: f.pageCount, aiLabelStatus: f.aiLabelStatus, aiDescription: f.aiDescription });
    }
  }
  const pdocs = await db!.select().from(productionDocs).where(eq(productionDocs.setId, setId));
  for (const p of pdocs) {
    out.push({
      kind: "production", id: p.id, name: p.name, url: p.url, contentType: p.contentType,
      pageText: asPages(p.pageText), pageNotes: asPages(p.pageNotes), pageCount: p.pageCount, aiLabelStatus: p.aiLabelStatus, aiDescription: p.aiDescription,
      bates: p.batesPrefix ? `${p.batesPrefix}${String(p.batesStart).padStart(6, "0")}–${String(p.batesEnd).padStart(6, "0")}` : undefined,
    });
  }
  return out;
}

async function saveReview(row: ReviewRow, patch: { aiLabel?: string; aiDescription?: string; aiLabelStatus: string }) {
  const set = { ...patch, aiLabeledAt: new Date() };
  if (row.kind === "doc") await db!.update(discoveryDocs).set(set).where(eq(discoveryDocs.id, row.id));
  else if (row.kind === "share") await db!.update(shareFiles).set(set).where(eq(shareFiles.id, row.id));
  else await db!.update(productionDocs).set(set).where(eq(productionDocs.id, row.id));
}

async function savePageNotes(row: ReviewRow, notes: string[]) {
  if (row.kind === "doc") await db!.update(discoveryDocs).set({ pageNotes: notes }).where(eq(discoveryDocs.id, row.id));
  else if (row.kind === "share") await db!.update(shareFiles).set({ pageNotes: notes }).where(eq(shareFiles.id, row.id));
  else await db!.update(productionDocs).set({ pageNotes: notes }).where(eq(productionDocs.id, row.id));
}

const NOTE_BATCH = 8;
const NOTE_MIN_TEXT = 15;

/**
 * One short note per page, written WITH the surrounding document context, so
 * a middle page reads "Page 5 of the 20-page lease re 115 W. River St —
 * sets rent at $2,500/mo" rather than a context-free fragment.
 */
async function askPageNotes(model: string, caseLine: string, doc: ReviewRow, from: number): Promise<Record<number, string> | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const base = (await resolvedAiBaseUrl()) ?? cfg.baseUrl;
  const total = doc.pageText.length;
  const batch: { n: number; t: string }[] = [];
  for (let n = from; n <= total && batch.length < NOTE_BATCH; n++) {
    const t = (doc.pageText[n - 1] ?? "").trim();
    if (t.length >= NOTE_MIN_TEXT) batch.push({ n, t: t.slice(0, 1400) });
  }
  if (!batch.length) return {};
  const system =
    "You annotate discovery documents page by page for a Texas trial law firm. These page notes are permanent case memory the firm's assistant answers from without re-reading the document. Reply with ONLY a JSON object, no prose: " +
    '{"notes": {"<pageNumber>": string, ...}} with one entry for EVERY page number given. ' +
    `Each note: 1–2 sentences, ≤ 280 characters. Anchor it in the document\'s context — if the page belongs to a larger instrument, say so ("Page 5 of the 20-page lease re …") — then state what THIS page says: names, dates, dollar amounts, terms, admissions. Never pad, never invent.`;
  const user =
    `PAGE_NOTES_REQUEST\nCase: ${caseLine}\nDocument: ${doc.name} (${total} pages)${doc.bates ? `, Bates ${doc.bates}` : ""}\n` +
    `Document summary: ${(doc.aiDescription || "").slice(0, 700)}\n` +
    "Pages to annotate:\n" + batch.map((b) => `[p.${b.n}] ${b.t}`).join("\n");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model, stream: false, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = String(j?.choices?.[0]?.message?.content ?? "");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { notes?: Record<string, unknown> };
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed.notes ?? {})) {
      const n = Math.floor(Number(k));
      if (Number.isFinite(n) && n >= 1 && typeof v === "string") out[n] = v.trim().slice(0, 400);
    }
    return out;
  } catch {
    return null;
  }
}

/** Label documents in this case for up to ~40s; call again until done. */
export async function reviewDiscoveryChunk(setId: number, opts: { retryErrors?: boolean } = {}): Promise<SweepResult | { error: string }> {
  if (!db) return { error: "Database not configured." };
  const active = await activeModel();
  if (!active) return { error: "The AI isn't configured yet." };
  const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) return { error: `No discovery set #${setId}.` };
  const caseLine = [set.name, set.matter, set.causeNumber].filter(Boolean).join(" · ");

  if (opts.retryErrors) {
    await db.update(discoveryDocs).set({ aiLabelStatus: "" }).where(and(eq(discoveryDocs.setId, setId), inArray(discoveryDocs.aiLabelStatus, ["error"])));
    await db.update(productionDocs).set({ aiLabelStatus: "" }).where(and(eq(productionDocs.setId, setId), inArray(productionDocs.aiLabelStatus, ["error"])));
    if (set.matter) {
      const folders = await db.select({ id: shareFolders.id }).from(shareFolders).where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client")));
      if (folders.length) await db.update(shareFiles).set({ aiLabelStatus: "" }).where(and(inArray(shareFiles.folderId, folders.map((f) => f.id)), inArray(shareFiles.aiLabelStatus, ["error"])));
    }
  }

  // TEXT FIRST: pull any un-indexed text before deciding what needs eyes.
  // A run started with retryErrors also revives previously-FAILED documents
  // — the streaming reader gets its shot at files the old indexer gave up
  // on, and any new failure records its actual reason.
  const idx = await indexStatusFor(setId);
  if (idx.remaining > 0 || (opts.retryErrors && idx.failed > 0)) {
    const prog = await indexTextChunk(setId, { retryFailed: !!opts.retryErrors });
    const targetsNow = await reviewTargets(setId, set.matter);
    const finished = targetsNow.filter((t) => !needsWork(t)).length;
    return {
      total: targetsNow.length, labeled: finished, remaining: targetsNow.length - finished,
      errors: 0, needsVision: 0, done: false, ...pageProgress(targetsNow),
      statusDone: targetsNow.filter((t) => t.aiLabelStatus).length,
      stage: `Reading document text first… ${prog.indexed} of ${prog.total} documents${prog.current ? ` — ${prog.current}` : ""}`,
    };
  }

  const targets = await reviewTargets(setId, set.matter);
  const pending = targets.filter(needsWork).slice(0, 25);

  const started = Date.now();
  let errors = 0;
  let needsVision = 0;
  let progressed = 0;
  let stage: string | undefined;
  const visionLoaded = active.desired === "vision";
  void touchAiLastUsed();

  for (const doc of pending) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    // Already labeled — what's left is its per-page notes. Batches of pages
    // go to the text model with the document's own summary as context;
    // progress saves after every batch, so any interruption resumes cleanly.
    if (doc.aiLabelStatus) {
      const notes = [...doc.pageNotes];
      let advanced = false;
      let stuck = false;
      while (Date.now() - started < TIME_BUDGET_MS && notes.length < doc.pageText.length) {
        while (notes.length < doc.pageText.length && (doc.pageText[notes.length] ?? "").trim().length < NOTE_MIN_TEXT) {
          notes.push(""); // image/blank pages: nothing to say from text — the gap gets filled later
          advanced = true;
        }
        if (notes.length >= doc.pageText.length) break;
        const from = notes.length + 1;
        const res = await askPageNotes(active.model, caseLine, doc, from);
        if (!res) { errors++; stuck = true; break; }
        let n = from;
        let filledAny = false;
        while (n <= doc.pageText.length) {
          const t = (doc.pageText[n - 1] ?? "").trim();
          if (t.length < NOTE_MIN_TEXT) { notes.push(""); n++; advanced = true; continue; }
          const note = res[n];
          if (note === undefined) break; // past this batch's window
          notes.push(note); n++; advanced = true; filledAny = true;
        }
        if (!filledAny) { errors++; stuck = true; break; }
        await savePageNotes(doc, notes);
      }
      if (advanced) {
        await savePageNotes(doc, notes);
        doc.pageNotes = notes;
        progressed++;
      }
      stage = `Writing page notes — "${doc.name}" (${Math.min(notes.length, doc.pageText.length)} of ${doc.pageText.length} pages)`;
      if (stuck) continue;
      continue;
    }

    const text = textOf(doc.pageText);
    let images: string[] = [];
    let flagNote = "";

    if (text.length >= 80) {
      // Enough extracted text to label without looking at pixels.
    } else if (isImage(doc.contentType, doc.name)) {
      if (!visionLoaded) { needsVision++; continue; }
      const bytes = doc.url ? await fetchBytes(doc.url) : null;
      if (bytes) images = [`data:${doc.contentType || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`];
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
      await saveReview(doc, { aiLabel: "Needs human review", aiDescription: flagNote, aiLabelStatus: "illegible" });
      progressed++;
      continue;
    }

    const verdict = await askModel(active.model, doc.name, caseLine, text, images);
    if (!verdict) {
      errors++;
      progressed++;
      await saveReview(doc, { aiLabelStatus: "error" });
      continue;
    }
    progressed++;
    const extras: string[] = [];
    if (doc.bates) extras.push(`Bates ${doc.bates}.`);
    if (doc.pageCount && doc.pageCount > PAGES_TO_SHOW.length && images.length) extras.push(`(Labeled from the first ${images.length} of ${doc.pageCount} pages.)`);
    await saveReview(doc, {
      aiLabel: verdict.label,
      aiDescription: [verdict.description, ...extras].filter(Boolean).join(" "),
      aiLabelStatus: verdict.legible ? "labeled" : "illegible",
    });
  }

  const after = await reviewTargets(setId, set.matter);
  const remaining = after.filter(needsWork).length;
  const total = after.length;
  const pp = pageProgress(after);
  // Done when everything has a status — or when a chunk can make no progress
  // at all (every pending document needs the vision model, which isn't
  // loaded). The caller sees needsVision > 0 and can offer the swap.
  const done = remaining === 0 || (progressed === 0 && pending.length > 0);
  try {
    if (!done) {
      await setAiNotice(`AI.fred is reading "${set.name}" — ${pp.pagesDone} of ${pp.pagesTotal} pages annotated (${total - remaining}/${total} documents).`, { chatBlocked: false, minutes: 15, kind: "review" });
    } else {
      await clearAiNotice();
    }
  } catch { /* notices are a nicety */ }

  return { total, labeled: total - remaining, remaining, errors, needsVision, done, ...pp, statusDone: after.filter((t) => t.aiLabelStatus).length, ...(done ? {} : stage ? { stage } : {}) };
}

/** Progress for the UI without doing any work. */
export async function reviewStatus(setId: number): Promise<{ total: number; remaining: number; errors: number; pagesDone: number; pagesTotal: number; statusDone: number } | { error: string }> {
  if (!db) return { error: "Database not configured." };
  const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) return { error: `No discovery set #${setId}.` };
  const targets = await reviewTargets(setId, set.matter);
  return { total: targets.length, remaining: targets.filter(needsWork).length, errors: targets.filter((t) => t.aiLabelStatus === "error").length, ...pageProgress(targets), statusDone: targets.filter((t) => t.aiLabelStatus).length };
}
