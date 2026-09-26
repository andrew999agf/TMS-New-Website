import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  caseHub, contacts, discoverySets, discoveryDocs, discoveryMarks,
  docTemplates, exhibitSets, exhibitDocs, intakeSubmissions, productions,
  productionDocs, shareFolders, shareFiles, trialCases, trialDeadlines,
  trialWitnesses, type CaseParty,
} from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";

/**
 * The Assistant's window into the firm's own systems — Matters/Cases,
 * Discovery Reviewer, Exhibit Reviewer, Pre-Trial Checklist, Intake, and
 * Contacts. Every tool here is STRICTLY READ-ONLY: the assistant can look
 * things up and report on them, never change them. All calls run server-side
 * behind the admin session; nothing here is reachable from the public site.
 *
 * This is the integration architecture the tabs plug into: adding a new tool
 * means adding one entry to TOOL_DEFS and one case to runAssistantTool.
 * (The Time Tracker is deliberately absent — it is not to be touched.)
 */

/* ------------------------------ definitions ------------------------------ */

type JsonSchema = Record<string, unknown>;
type ToolDef = { name: string; description: string; parameters: JsonSchema };

const TOOL_DEFS: ToolDef[] = [
  {
    name: "list_cases",
    description:
      "Search the firm's Matters/Cases hub. Returns matching cases with their matter number (the cross-tool case key, e.g. \"00042-Nelson\"), case name, cause number, court, and county. Call with no query to list the most recently updated cases.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to match against matter number, case name, cause number, court, or party names. Omit to list recent cases." },
      },
    },
  },
  {
    name: "get_case",
    description:
      "Full picture of one case by matter number: case info, every party with roles and contact details (including opposing counsel), plus what exists for it across the firm's tools — discovery sets, exhibit sets, pre-trial checklist, client document requests with deadlines, and productions.",
    parameters: {
      type: "object",
      properties: { matter: { type: "string", description: "The matter display number, e.g. \"00042-Nelson\"." } },
      required: ["matter"],
    },
  },
  {
    name: "list_discovery_documents",
    description:
      "Everything in the Discovery Reviewer for a case: opposing-production documents (with service info and page counts), exhibit designations made from them, documents received from the client, and the production pipeline (staged and produced documents with Bates ranges).",
    parameters: {
      type: "object",
      properties: { matter: { type: "string", description: "The matter display number." } },
      required: ["matter"],
    },
  },
  {
    name: "list_exhibits",
    description:
      "The exhibit list for a case from the Exhibit Reviewer: each exhibit's designation (P-1, D-2…), title, description, Bates range, trial status, and offer plan.",
    parameters: {
      type: "object",
      properties: { matter: { type: "string", description: "The matter display number." } },
      required: ["matter"],
    },
  },
  {
    name: "read_document",
    description:
      "Read the extracted text of one discovery or exhibit document, page by page. Use list_discovery_documents or list_exhibits first to find the document id. Large documents come back in page ranges — ask for further pages as needed. Scanned images without a text layer return empty pages; say so rather than guessing at their contents.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["discovery", "exhibit"], description: "Which tool the document lives in." },
        doc_id: { type: "integer", description: "The document id from a listing tool." },
        page_from: { type: "integer", description: "First page to read (1-based). Default 1." },
        page_to: { type: "integer", description: "Last page to read (inclusive). Default: as many as fit." },
      },
      required: ["source", "doc_id"],
    },
  },
  {
    name: "search_documents",
    description:
      "Full-text search across a case's discovery documents and exhibits. Returns each hit with the document, page number, and a snippet — the way to find which documents mention a person, date, account, or topic before reading them.",
    parameters: {
      type: "object",
      properties: {
        matter: { type: "string", description: "The matter display number." },
        query: { type: "string", description: "The word or phrase to look for (case-insensitive)." },
      },
      required: ["matter", "query"],
    },
  },
  {
    name: "get_pretrial",
    description:
      "The Pre-Trial Checklist for a case: trial and pre-trial conference dates, every checklist deadline with assignee and done/undone status, and the witness list.",
    parameters: {
      type: "object",
      properties: { matter: { type: "string", description: "The matter display number." } },
      required: ["matter"],
    },
  },
  {
    name: "list_intake",
    description:
      "Recent website intake submissions (prospective clients): name, practice area, county, urgency, status, and when they came in. Use for intake status reports.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter to one status: new, contacted, scheduled, declined, referred-out, client-declined, letter-sent, converted. Omit for all active." },
        limit: { type: "integer", description: "Max rows (default 25, max 50)." },
      },
    },
  },
  {
    name: "list_deadlines",
    description:
      "Upcoming dated obligations across every case: trial dates, pre-trial conferences, open pre-trial checklist items, and discovery-request deadlines (client return dates and response due dates). The tool for a firm-wide status or staff assignment report.",
    parameters: {
      type: "object",
      properties: { days_ahead: { type: "integer", description: "Horizon in days from today (default 45, max 366)." } },
    },
  },
  {
    name: "list_templates",
    description:
      "Search the firm's Word-template bank (letters, engagement letters, discovery requests, motions…). Returns each template's id, folder (practice area), type, description of when to use it, and its merge fields. ALWAYS check here before drafting any letter or standard document from scratch — the firm's templates carry its letterhead and preferred verbiage.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What kind of document is needed, e.g. \"demand letter\" or \"engagement\". Omit to list everything." },
        folder: { type: "string", description: "Limit to one practice-area folder, e.g. \"Debt Defense\"." },
      },
    },
  },
  {
    name: "read_template",
    description: "Read one template's full text and merge fields, to confirm it fits and decide what revisions the request needs. Use the id from list_templates.",
    parameters: {
      type: "object",
      properties: { id: { type: "integer", description: "The template id." } },
      required: ["id"],
    },
  },
  {
    name: "search_contacts",
    description:
      "Search the firm contact book: clients (current/past/prospective), opposing parties, and attorneys on both sides, with email, phone, address, and firm.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Name, firm, or email fragment to match." } },
      required: ["query"],
    },
  },
];

/** OpenAI-compatible `tools` array for the chat completion request. */
export function assistantToolSchemas() {
  return TOOL_DEFS.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

/** Short human phrasing for the "working…" status line in the UI. */
export function toolStatusLabel(name: string, args: Record<string, unknown>): string {
  const m = typeof args.matter === "string" && args.matter ? ` — ${args.matter}` : "";
  switch (name) {
    case "list_cases": return args.query ? `Searching cases for “${String(args.query).slice(0, 60)}”…` : "Listing recent cases…";
    case "get_case": return `Pulling the case file${m}…`;
    case "list_discovery_documents": return `Reading the Discovery Reviewer${m}…`;
    case "list_exhibits": return `Reading the exhibit list${m}…`;
    case "read_document": return `Reading document #${args.doc_id ?? "?"}…`;
    case "search_documents": return `Searching documents for “${String(args.query ?? "").slice(0, 60)}”${m}…`;
    case "get_pretrial": return `Checking the pre-trial checklist${m}…`;
    case "list_intake": return "Reviewing intake submissions…";
    case "list_deadlines": return "Gathering upcoming deadlines…";
    case "search_contacts": return `Searching contacts for “${String(args.query ?? "").slice(0, 60)}”…`;
    case "list_templates": return args.query ? `Looking for a “${String(args.query).slice(0, 50)}” template…` : "Browsing the template bank…";
    case "read_template": return `Reading template #${args.id ?? "?"}…`;
    case "generate_document": return "Filling in the template…";
    default: return "Checking the firm's systems…";
  }
}

/* -------------------------------- helpers -------------------------------- */

const MAX_RESULT_CHARS = 14000;

function pack(data: unknown): string {
  const s = JSON.stringify(data);
  if (s.length <= MAX_RESULT_CHARS) return s;
  return JSON.stringify({ truncated: true, note: "Result truncated — narrow the request (fewer rows, a page range, or a more specific query).", partial: s.slice(0, MAX_RESULT_CHARS) });
}

function normMatter(v: unknown): string {
  return String(v ?? "").trim();
}

const today = () => new Date().toISOString().slice(0, 10);

/* -------------------------------- executor ------------------------------- */

/**
 * Run one tool call. Returns a JSON string to hand back to the model.
 * Any failure comes back as { error } — the model explains it, nothing throws.
 */
export async function runAssistantTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (!db) return JSON.stringify({ error: "The firm database isn't configured." });
  try {
    await ensureDiscoveryTables();
    switch (name) {
      case "list_cases": return pack(await listCases(String(args.query ?? "")));
      case "get_case": return pack(await getCase(normMatter(args.matter)));
      case "list_discovery_documents": return pack(await listDiscovery(normMatter(args.matter)));
      case "list_exhibits": return pack(await listExhibits(normMatter(args.matter)));
      case "read_document": return pack(await readDocument(String(args.source), Number(args.doc_id), args.page_from == null ? undefined : Number(args.page_from), args.page_to == null ? undefined : Number(args.page_to)));
      case "search_documents": return pack(await searchDocuments(normMatter(args.matter), String(args.query ?? "")));
      case "get_pretrial": return pack(await getPretrial(normMatter(args.matter)));
      case "list_intake": return pack(await listIntake(String(args.status ?? ""), Number(args.limit) || 25));
      case "list_deadlines": return pack(await listDeadlines(Number(args.days_ahead) || 45));
      case "search_contacts": return pack(await searchContactsTool(String(args.query ?? "")));
      case "list_templates": return pack(await listTemplatesTool(String(args.query ?? ""), String(args.folder ?? "")));
      case "read_template": return pack(await readTemplateTool(Number(args.id)));
      default: return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: `Lookup failed: ${(e as Error).message?.slice(0, 200) || "unknown error"}` });
  }
}

/* --------------------------------- tools --------------------------------- */

async function listCases(query: string) {
  const rows = await db!.select().from(caseHub).where(eq(caseHub.archived, false)).orderBy(desc(caseHub.updatedAt)).limit(400);
  const q = query.trim().toLowerCase();
  const match = q
    ? rows.filter((r) => {
        const parties = ((r.parties as CaseParty[]) ?? []).map((p) => `${p.name} ${p.attorney?.name ?? ""} ${p.attorney?.firm ?? ""}`).join(" ");
        return `${r.matter} ${r.name} ${r.causeNumber} ${r.court} ${r.county} ${parties}`.toLowerCase().includes(q);
      })
    : rows;
  return {
    cases: match.slice(0, 20).map((r) => ({ matter: r.matter, name: r.name, causeNumber: r.causeNumber, court: r.court, county: r.county })),
    total: match.length,
  };
}

async function getCase(matter: string) {
  if (!matter) return { error: "matter is required." };
  const [hub] = await db!.select().from(caseHub).where(eq(caseHub.matter, matter));
  if (!hub) {
    const near = await listCases(matter);
    return { error: `No case with matter "${matter}".`, similar: near.cases.slice(0, 5) };
  }
  const parties = ((hub.parties as CaseParty[]) ?? []).map((p) => ({
    name: p.name, role: p.role, email: p.email || undefined, phone: p.phone || undefined, address: p.address || undefined,
    attorney: p.attorney?.name ? p.attorney : undefined,
  }));
  const [dsets, esets, trials, folders] = await Promise.all([
    db!.select({ id: discoverySets.id, name: discoverySets.name }).from(discoverySets).where(and(eq(discoverySets.matter, matter), eq(discoverySets.archived, false))),
    db!.select({ id: exhibitSets.id, name: exhibitSets.name }).from(exhibitSets).where(and(eq(exhibitSets.matter, matter), eq(exhibitSets.archived, false))),
    db!.select({ id: trialCases.id, trialDate: trialCases.trialDate, pretrialDate: trialCases.pretrialDate }).from(trialCases).where(and(eq(trialCases.matter, matter), eq(trialCases.archived, false))),
    db!.select().from(shareFolders).where(and(eq(shareFolders.matter, matter), eq(shareFolders.archived, false))),
  ]);
  const setIds = dsets.map((s) => s.id);
  const prods = setIds.length ? await db!.select().from(productions).where(inArray(productions.setId, setIds)) : [];
  return {
    matter: hub.matter, name: hub.name, causeNumber: hub.causeNumber, court: hub.court, county: hub.county,
    notes: hub.notes || undefined, parties,
    discoverySets: dsets,
    exhibitSets: esets,
    preTrial: trials[0] ?? null,
    clientDocumentRequests: folders.filter((f) => f.type === "client").map((f) => ({
      folderId: f.id, name: f.name, rfpPrefix: f.discoveryPrefix || undefined, requestNumbers: (f.discoveryNumbers as number[]) ?? undefined,
      clientReturnDue: f.clientDue || undefined, responseDue: f.responseDue || undefined,
    })),
    productions: prods.map((p) => ({ label: p.label, bates: p.batesPrefix ? `${p.batesPrefix}${String(p.batesStart).padStart(6, "0")}–${p.batesPrefix}${String(p.batesEnd).padStart(6, "0")}` : "(not Bates labeled)", producedAt: p.producedAt?.toISOString().slice(0, 10) ?? null })),
  };
}

async function discoverySetsFor(matter: string) {
  return db!.select().from(discoverySets).where(and(eq(discoverySets.matter, matter), eq(discoverySets.archived, false)));
}

async function listDiscovery(matter: string) {
  if (!matter) return { error: "matter is required." };
  const sets = await discoverySetsFor(matter);
  if (!sets.length) return { note: `No discovery sets for matter "${matter}".` };
  const setIds = sets.map((s) => s.id);
  const [docs, marks, pdocs, prods] = await Promise.all([
    db!.select({ id: discoveryDocs.id, setId: discoveryDocs.setId, name: discoveryDocs.name, bucket: discoveryDocs.bucket, pageCount: discoveryDocs.pageCount, servedAt: discoveryDocs.servedAt, servedBy: discoveryDocs.servedBy, servedTo: discoveryDocs.servedTo, createdAt: discoveryDocs.createdAt }).from(discoveryDocs).where(inArray(discoveryDocs.setId, setIds)),
    db!.select({ party: discoveryMarks.party, number: discoveryMarks.number, label: discoveryMarks.label, title: discoveryMarks.title, pages: discoveryMarks.pages }).from(discoveryMarks).where(inArray(discoveryMarks.setId, setIds)),
    db!.select().from(productionDocs).where(inArray(productionDocs.setId, setIds)),
    db!.select().from(productions).where(inArray(productions.setId, setIds)),
  ]);
  // Client-uploaded files live in share folders keyed to the matter.
  let clientFiles: { name: string; folder: string; uploadedAt: string }[] = [];
  try {
    const folders = await db!.select().from(shareFolders).where(and(eq(shareFolders.matter, matter), eq(shareFolders.type, "client"), eq(shareFolders.archived, false)));
    if (folders.length) {
      const files = await db!.select().from(shareFiles).where(inArray(shareFiles.folderId, folders.map((f) => f.id)));
      const byId = new Map(folders.map((f) => [f.id, f.name]));
      clientFiles = files.map((f) => ({ name: f.filename, folder: byId.get(f.folderId) ?? "", uploadedAt: f.createdAt.toISOString().slice(0, 10) }));
    }
  } catch { /* share tables optional */ }
  return {
    sets: sets.map((s) => ({ id: s.id, name: s.name, causeNumber: s.causeNumber })),
    opposingProduction: docs.filter((d) => d.bucket !== "client").map((d) => ({ docId: d.id, name: d.name, pages: d.pageCount, servedAt: d.servedAt || undefined, servedBy: d.servedBy || undefined, servedTo: d.servedTo || undefined })),
    receivedFromClientViaOpposingTab: docs.filter((d) => d.bucket === "client").map((d) => ({ docId: d.id, name: d.name, pages: d.pageCount })),
    clientUploadedFiles: clientFiles,
    exhibitDesignations: marks.map((m) => ({ designation: m.label || `${m.party}-${m.number}`, title: m.title, pageCount: Array.isArray(m.pages) ? (m.pages as unknown[]).length : 0 })),
    productionPipeline: {
      staged: pdocs.filter((d) => d.status !== "produced").map((d) => ({ name: d.name, request: d.requestLabel || undefined, bates: d.batesPrefix ? `${d.batesPrefix}${String(d.batesStart).padStart(6, "0")}–${d.batesPrefix}${String(d.batesEnd).padStart(6, "0")}` : "(as-is, pre-labeled)" })),
      produced: prods.map((p) => ({ label: p.label, producedAt: p.producedAt?.toISOString().slice(0, 10) ?? null, documents: pdocs.filter((d) => d.productionId === p.id).map((d) => d.name) })),
    },
  };
}

async function listExhibits(matter: string) {
  if (!matter) return { error: "matter is required." };
  const sets = await db!.select().from(exhibitSets).where(and(eq(exhibitSets.matter, matter), eq(exhibitSets.archived, false)));
  if (!sets.length) return { note: `No exhibit sets for matter "${matter}".` };
  const docs = await db!
    .select({ id: exhibitDocs.id, setId: exhibitDocs.setId, side: exhibitDocs.side, label: exhibitDocs.label, number: exhibitDocs.number, title: exhibitDocs.title, description: exhibitDocs.description, bates: exhibitDocs.bates, batesEnd: exhibitDocs.batesEnd, trialStatus: exhibitDocs.trialStatus, offerStatus: exhibitDocs.offerStatus, omitted: exhibitDocs.omitted, pageCount: exhibitDocs.pageCount })
    .from(exhibitDocs).where(inArray(exhibitDocs.setId, sets.map((s) => s.id)));
  return {
    sets: sets.map((s) => ({ id: s.id, name: s.name })),
    exhibits: docs
      .sort((a, b) => (a.side === b.side ? (a.number ?? 0) - (b.number ?? 0) : a.side.localeCompare(b.side)))
      .map((d) => ({
        docId: d.id, designation: d.label || `${d.side === "defendant" ? "D" : "P"}-${d.number ?? "?"}`, title: d.title,
        description: d.description ? d.description.slice(0, 300) : undefined,
        bates: d.bates ? (d.batesEnd ? `${d.bates}–${d.batesEnd}` : d.bates) : undefined,
        pages: d.pageCount ?? undefined, trialStatus: d.trialStatus !== "none" ? d.trialStatus : undefined,
        offerPlan: d.offerStatus || undefined, omitted: d.omitted || undefined,
      })),
  };
}

async function readDocument(source: string, docId: number, pageFrom?: number, pageTo?: number) {
  if (!Number.isFinite(docId)) return { error: "doc_id is required." };
  let name = "", pages: string[] = [];
  if (source === "exhibit") {
    const [row] = await db!.select({ name: exhibitDocs.title, pageText: exhibitDocs.pageText }).from(exhibitDocs).where(eq(exhibitDocs.id, docId));
    if (!row) return { error: `No exhibit document #${docId}.` };
    name = row.name; pages = Array.isArray(row.pageText) ? (row.pageText as string[]) : [];
  } else {
    const [row] = await db!.select({ name: discoveryDocs.name, pageText: discoveryDocs.pageText }).from(discoveryDocs).where(eq(discoveryDocs.id, docId));
    if (!row) return { error: `No discovery document #${docId}.` };
    name = row.name; pages = Array.isArray(row.pageText) ? (row.pageText as string[]) : [];
  }
  if (!pages.length) return { document: name, note: "No extracted text — likely a scanned image without a text layer. The contents can't be read as text." };
  const from = Math.max(1, pageFrom ?? 1);
  const to = Math.min(pages.length, Math.max(from, pageTo ?? pages.length));
  const out: { page: number; text: string }[] = [];
  let budget = 11000;
  let last = from - 1;
  for (let p = from; p <= to && budget > 0; p++) {
    const text = (pages[p - 1] ?? "").slice(0, 3000);
    budget -= text.length + 20;
    out.push({ page: p, text });
    last = p;
  }
  return {
    document: name, totalPages: pages.length, pagesReturned: `${from}–${last}`,
    ...(last < to || to < pages.length ? { note: `More pages exist — call again with page_from: ${last + 1}.` } : {}),
    pages: out,
  };
}

async function searchDocuments(matter: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!matter || !q) return { error: "matter and query are required." };
  const dsets = await discoverySetsFor(matter);
  const esets = await db!.select().from(exhibitSets).where(and(eq(exhibitSets.matter, matter), eq(exhibitSets.archived, false)));
  const hits: { source: string; docId: number; document: string; page: number; snippet: string }[] = [];
  const scan = (sourceLabel: string, docId: number, docName: string, pages: string[]) => {
    pages.forEach((t, i) => {
      if (hits.length >= 30 || !t) return;
      const idx = t.toLowerCase().indexOf(q);
      if (idx < 0) return;
      const start = Math.max(0, idx - 70);
      hits.push({ source: sourceLabel, docId, document: docName, page: i + 1, snippet: `…${t.slice(start, idx + q.length + 90).replace(/\s+/g, " ")}…` });
    });
  };
  if (dsets.length) {
    const docs = await db!.select({ id: discoveryDocs.id, name: discoveryDocs.name, pageText: discoveryDocs.pageText }).from(discoveryDocs).where(inArray(discoveryDocs.setId, dsets.map((s) => s.id)));
    for (const d of docs) scan("discovery", d.id, d.name, Array.isArray(d.pageText) ? (d.pageText as string[]) : []);
  }
  if (esets.length) {
    const docs = await db!.select({ id: exhibitDocs.id, label: exhibitDocs.label, title: exhibitDocs.title, pageText: exhibitDocs.pageText }).from(exhibitDocs).where(inArray(exhibitDocs.setId, esets.map((s) => s.id)));
    for (const d of docs) scan("exhibit", d.id, `${d.label ? d.label + " — " : ""}${d.title}`, Array.isArray(d.pageText) ? (d.pageText as string[]) : []);
  }
  return { query, hits, ...(hits.length >= 30 ? { note: "Capped at 30 hits — refine the query for more precision." } : {}), ...(hits.length === 0 ? { note: "No hits. Scanned documents without a text layer can't be searched." } : {}) };
}

async function getPretrial(matter: string) {
  if (!matter) return { error: "matter is required." };
  const cases = await db!.select().from(trialCases).where(and(eq(trialCases.matter, matter), eq(trialCases.archived, false)));
  if (!cases.length) return { note: `No pre-trial checklist for matter "${matter}".` };
  const c = cases[0];
  const [items, wits] = await Promise.all([
    db!.select({ title: trialDeadlines.title, dueDate: trialDeadlines.dueDate, done: trialDeadlines.done, assignee: trialDeadlines.assignee, parentId: trialDeadlines.parentId }).from(trialDeadlines).where(eq(trialDeadlines.caseId, c.id)),
    db!.select({ name: trialWitnesses.name, side: trialWitnesses.side, role: trialWitnesses.role, available: trialWitnesses.available, appearance: trialWitnesses.appearance }).from(trialWitnesses).where(eq(trialWitnesses.caseId, c.id)),
  ]);
  return {
    case: { name: c.name, causeNumber: c.causeNumber, court: c.court, trialDate: c.trialDate, pretrialConference: c.pretrialDate },
    checklist: items.map((i) => ({ title: i.title, due: i.dueDate, done: i.done, assignee: i.assignee || undefined, subTask: i.parentId != null || undefined })),
    witnesses: wits,
  };
}

const INTAKE_STATUSES = new Set(["new", "contacted", "scheduled", "declined", "referred-out", "client-declined", "letter-sent", "converted"]);

async function listIntake(statusIn: string, limit: number) {
  const cap = Math.min(Math.max(1, limit || 25), 50);
  const status = INTAKE_STATUSES.has(statusIn) ? statusIn : "";
  const where = status ? and(eq(intakeSubmissions.archived, false), eq(intakeSubmissions.status, status as typeof intakeSubmissions.$inferSelect.status)) : eq(intakeSubmissions.archived, false);
  const rows = await db!
    .select({ id: intakeSubmissions.id, name: intakeSubmissions.name, practiceSlug: intakeSubmissions.practiceSlug, county: intakeSubmissions.county, isUrgent: intakeSubmissions.isUrgent, status: intakeSubmissions.status, opposingParty: intakeSubmissions.opposingParty, deadline: intakeSubmissions.deadline, createdAt: intakeSubmissions.createdAt })
    .from(intakeSubmissions).where(where).orderBy(desc(intakeSubmissions.createdAt)).limit(cap);
  return {
    submissions: rows.map((r) => ({ id: r.id, name: r.name, practiceArea: r.practiceSlug, county: r.county, urgent: r.isUrgent || undefined, status: r.status, opposingParty: r.opposingParty || undefined, statedDeadline: r.deadline || undefined, receivedAt: r.createdAt.toISOString().slice(0, 10) })),
  };
}

async function listDeadlines(daysAhead: number) {
  const horizon = Math.min(Math.max(1, daysAhead || 45), 366);
  const end = new Date(Date.now() + horizon * 86400000).toISOString().slice(0, 10);
  const start = today();
  const out: { date: string; kind: string; matter: string; case: string; what: string; assignee?: string }[] = [];
  const cases = await db!.select().from(trialCases).where(eq(trialCases.archived, false));
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const c of cases) {
    if (c.trialDate && c.trialDate >= start && c.trialDate <= end) out.push({ date: c.trialDate, kind: "trial", matter: c.matter, case: c.name, what: "TRIAL" });
    if (c.pretrialDate && c.pretrialDate >= start && c.pretrialDate <= end) out.push({ date: c.pretrialDate, kind: "pretrial-conference", matter: c.matter, case: c.name, what: "Pre-trial conference" });
  }
  if (cases.length) {
    const items = await db!.select().from(trialDeadlines).where(and(inArray(trialDeadlines.caseId, cases.map((c) => c.id)), eq(trialDeadlines.done, false)));
    for (const i of items) {
      if (!i.dueDate || i.dueDate < start || i.dueDate > end) continue;
      const c = byId.get(i.caseId);
      out.push({ date: i.dueDate, kind: "checklist", matter: c?.matter ?? "", case: c?.name ?? "", what: i.title, assignee: i.assignee || undefined });
    }
  }
  try {
    const folders = await db!.select().from(shareFolders).where(and(eq(shareFolders.type, "client"), eq(shareFolders.archived, false)));
    for (const f of folders) {
      if (f.clientDue && f.clientDue >= start && f.clientDue <= end) out.push({ date: f.clientDue, kind: "client-documents-due", matter: f.matter, case: f.name, what: "Client documents due back" });
      if (f.responseDue && f.responseDue >= start && f.responseDue <= end) out.push({ date: f.responseDue, kind: "discovery-response-due", matter: f.matter, case: f.name, what: "Discovery response deadline" });
    }
  } catch { /* share tables optional */ }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { from: start, through: end, deadlines: out.slice(0, 80) };
}

async function listTemplatesTool(query: string, folder: string) {
  const rows = await db!.select().from(docTemplates).where(eq(docTemplates.archived, false)).limit(500);
  const q = query.trim().toLowerCase();
  const f = folder.trim().toLowerCase();
  const match = rows
    .filter((r) => (!f || r.folder.toLowerCase() === f))
    .filter((r) => !q || `${r.name} ${r.folder} ${r.docType} ${r.description}`.toLowerCase().includes(q) || r.docText.toLowerCase().includes(q));
  return {
    templates: match.slice(0, 20).map((r) => ({
      id: r.id, name: r.name, folder: r.folder || "(inbox — not yet sorted)", type: r.docType,
      useWhen: r.description || undefined, fields: Array.isArray(r.fields) ? r.fields : [],
      docx: /\.docx$/i.test(r.pathname ?? r.name),
    })),
    total: match.length,
    ...(match.length === 0 ? { note: "No template matched — broaden the query, or draft from scratch and say no firm template was found." } : {}),
  };
}

async function readTemplateTool(id: number) {
  if (!Number.isFinite(id)) return { error: "id is required." };
  const [r] = await db!.select().from(docTemplates).where(eq(docTemplates.id, id));
  if (!r || r.archived) return { error: `No template #${id}.` };
  return {
    id: r.id, name: r.name, folder: r.folder, type: r.docType, useWhen: r.description || undefined,
    fields: Array.isArray(r.fields) ? r.fields : [],
    text: r.docText.slice(0, 14000) || "(no extracted text — not a .docx)",
  };
}

async function searchContactsTool(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return { error: "query is required." };
  const rows = await db!.select().from(contacts).where(eq(contacts.archived, false)).limit(1000);
  const match = rows.filter((r) => `${r.name} ${r.firm} ${r.email}`.toLowerCase().includes(q)).slice(0, 15);
  return { contacts: match.map((r) => ({ name: r.name, kind: r.kind, firm: r.firm || undefined, side: r.side || undefined, email: r.email || undefined, phone: r.phone || undefined, address: r.address || undefined })) };
}
