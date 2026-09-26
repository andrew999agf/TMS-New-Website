import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath, canUseAssistantCode, canReviewBilling } from "@/lib/admin-sections";
import { buildAdminGuide } from "@/lib/ai/admin-guide";
import { billingSummary } from "@/lib/ai/billing";
import { generateFromTemplate } from "@/lib/documents/generate";
import { aiConfig, modelForMode } from "@/lib/ai/config";
import { assistantToolSchemas, runAssistantTool, toolStatusLabel } from "@/lib/ai/tools";
import { touchAiLastUsed } from "@/lib/ai/concierge";
import { getAiNotice } from "@/lib/ai/notice";
import { db } from "@/db";
import { assistantThreads, assistantMessages, assistantPrefs, assistantMemories } from "@/db/schema";
import { or, sql } from "drizzle-orm";

export const runtime = "nodejs";
// Streaming replies plus tool rounds can run a while; give the function room.
export const maxDuration = 300;

/** Shared ground rules for every mode. Behavior only — no confidential data. */
const BASE_PROMPT =
  "You are AI.fred, the in-house AI for a Texas trial law firm — the firm's steady digital butler, in the spirit of a trusted " +
  "aide-de-camp: unflappable, quietly capable, loyal to the firm, with an occasional touch of dry wit that never gets in the " +
  "way of the work. You serve firm staff inside the admin panel only. Refer to yourself as AI.fred when a name is called for; " +
  "never be theatrical about the persona — competence first, charm second. " +
  "Be direct and practical. You are not a substitute for a lawyer's judgment and you do not give legal advice to the public. " +
  "If you are unsure, say so rather than inventing facts, citations, or case law. " +
  "When someone asks for a Word document (or any downloadable document), write the complete document in your reply — every " +
  "reply has a 'Word (.docx)' button under it that turns your text into a real Word file, so never say you can't produce one; " +
  "just write it and point them to that button.";

/** Admin-panel navigator: the map is fetched on demand, per user. */
const GUIDE_TOOL = {
  type: "function" as const,
  function: {
    name: "admin_panel_guide",
    description:
      "Get the map of this admin panel tailored to the asking user: every section their account can access, what each is for, and where it lives in the sidebar. Use it whenever someone asks how to do something in the portal, where a feature lives, or what a tab does.",
    parameters: { type: "object", properties: {} },
  },
};

/** Billing rollup — only attached for accounts that hold billing access. */
const BILLING_TOOL = {
  type: "function" as const,
  function: {
    name: "billing_summary",
    description:
      "Billing totals from the firm's time entries for one month: billable hours and dollars, per-timekeeper breakdown, and top matters. Use for questions like how much was billed last month or who logged the most hours.",
    parameters: {
      type: "object",
      properties: { month: { type: "string", description: "Month as YYYY-MM. Omit for the current month." } },
    },
  },
};

/** Produce a real Word document from a bank template. */
const GENERATE_DOC_TOOL = {
  type: "function" as const,
  function: {
    name: "generate_document",
    description:
      "Generate a finished Word document FROM a firm template: fills the template's {{fields}} (standard case fields auto-fill from the matter) and applies your paragraph revisions, keeping the firm's formatting. Workflow: list_templates → read_template → get_case for the facts → generate_document. Give the user the returned downloadPath as a markdown link. Only revise paragraphs the request actually requires; the template's verbiage is the firm's preference.",
    parameters: {
      type: "object",
      properties: {
        template_id: { type: "integer", description: "The template to use (from list_templates)." },
        matter: { type: "string", description: "Matter number — auto-fills case fields (parties, court, cause number…)." },
        fields: { type: "object", description: "Field values to set or override, e.g. {\"client_name\": \"...\"}. Auto-filled case fields may be omitted.", additionalProperties: { type: "string" } },
        revisions: {
          type: "array",
          description: "Targeted text edits: each finds exact text from the template (read_template shows it) and replaces it. Keep them few and surgical.",
          items: { type: "object", properties: { find: { type: "string" }, replace: { type: "string" } }, required: ["find", "replace"] },
        },
        name_hint: { type: "string", description: "Base name for the generated file, e.g. \"Demand letter - Morganfield\"." },
      },
      required: ["template_id"],
    },
  },
};

/** Added when the firm-data tools are attached to the request. */
const TOOLS_PROMPT =
  " You have read-only tools into the firm's own systems: Matters/Cases, the Discovery Reviewer, the Exhibit Reviewer, " +
  "the Pre-Trial Checklist, Intake, and Contacts. For ANY question about the firm's cases, documents, deadlines, or contacts, " +
  "use the tools — never answer from memory or invent case facts. Start with list_cases or get_case when only a name is given. " +
  "When reporting from documents, cite the document name and page so staff can verify. If a tool returns nothing or an error, " +
  "say what you looked for and what came back. The tools cannot change case data; to edit it, staff use the tabs themselves. " +
  "DOCUMENT DRAFTING: when asked for a letter, engagement letter, discovery requests, or any standard document, FIRST check " +
  "list_templates for a firm template and build from it with generate_document — the firm's own files carry its letterhead and " +
  "verbiage, so never draft from scratch when a template fits. After generating, give the download as a markdown link to the " +
  "returned downloadPath and briefly say which fields were filled and what you revised. If no template fits, say so, then draft " +
  "in the reply (the Word button exports it).";

/**
 * Per-mode instructions and settings. The UI offers General / Drafting / Coding;
 * each gets its own system prompt and temperature. Prompts live server-side so
 * they can't be tampered with from the browser.
 */
const MODES: Record<string, { prompt: string; temperature: number }> = {
  general: {
    prompt:
      `${BASE_PROMPT} This is a general conversation: stay well balanced across topics — ` +
      "answer questions, think through problems, summarize, and explain clearly at whatever depth the question deserves.",
    temperature: 0.6,
  },
  draft: {
    prompt:
      `${BASE_PROMPT} You are in DRAFTING mode. Produce polished written work: letters, memos, clauses, emails, ` +
      "policies, and edits to prose. Match a professional legal-office tone unless told otherwise. When asked to draft, " +
      "return the complete document ready to copy out — not an outline — and put the document itself first, with any " +
      "notes or options after it. When editing, preserve the author's voice and flag anything substantive you changed. " +
      "When a draft concerns one of the firm's cases, pull the real case style, cause number, court, and party names " +
      "with your tools instead of leaving blanks.",
    temperature: 0.5,
  },
  code: {
    prompt:
      `${BASE_PROMPT} You are in CODING mode — your top priority. Write correct, runnable code and debug precisely. ` +
      "Always put code in fenced blocks with the language tag. Prefer complete working solutions over fragments, state " +
      "assumptions briefly, and when fixing a bug explain the root cause in a sentence or two before the fix.",
    temperature: 0.2,
  },
};

type Msg = { role: "user" | "assistant" | "system"; content: string };

/** The memory tool: the model saves only durable, genuinely useful notes. */
const MEMORY_TOOL = {
  type: "function" as const,
  function: {
    name: "save_memory",
    description:
      "Save ONE short, durable note to long-term memory. Be highly selective: only save when the user states a lasting preference, a standing fact about themselves or how the firm works, or explicitly says to remember something. NEVER save case-specific facts (those live in Matters/Cases), transient details, or anything sensitive like passwords. Keep it under 200 characters, written in third person.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The note, e.g. \"Prefers short answers\" or \"Share-portal documents are managed in the Intake tab\"." },
        scope: { type: "string", enum: ["user", "firm"], description: "user = about this person only (default); firm = true for the whole firm." },
      },
      required: ["content"],
    },
  },
};

/** Custom instructions + remembered notes, folded into the system prompt. */
async function personalization(email: string): Promise<string> {
  if (!db) return "";
  try {
    const [row] = await db.select().from(assistantPrefs).where(eq(assistantPrefs.userEmail, email));
    const mems = await db
      .select({ scope: assistantMemories.scope, content: assistantMemories.content })
      .from(assistantMemories)
      .where(or(eq(assistantMemories.scope, "firm"), and(eq(assistantMemories.scope, "user"), eq(assistantMemories.userEmail, email))))
      .orderBy(assistantMemories.id)
      .limit(200);
    let out = "";
    if (row?.about?.trim()) out += `\nAbout this user (their own words): ${row.about.trim().slice(0, 800)}`;
    if (row?.style?.trim()) out += `\nHow they want replies: ${row.style.trim().slice(0, 800)}`;
    const firm = mems.filter((m) => m.scope === "firm").map((m) => `- ${m.content}`).join("\n").slice(0, 1600);
    const mine = mems.filter((m) => m.scope !== "firm").map((m) => `- ${m.content}`).join("\n").slice(0, 1600);
    if (firm) out += `\nRemembered firm-wide notes:\n${firm}`;
    if (mine) out += `\nRemembered notes about this user:\n${mine}`;
    if (out) out = "\n" + out + "\nApply these quietly; don't recite them back.";
    return out;
  } catch {
    return "";
  }
}

/** save_memory executor — selective, deduplicated, capped. */
async function saveMemory(email: string, args: Record<string, unknown>): Promise<string> {
  if (!db) return JSON.stringify({ error: "No database." });
  const content = String(args.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (content.length < 8) return JSON.stringify({ error: "Too short to be worth remembering." });
  const scope = args.scope === "firm" ? "firm" : "user";
  const owner = scope === "user" ? email : "";
  try {
    const dupe = await db
      .select({ id: assistantMemories.id })
      .from(assistantMemories)
      .where(and(eq(assistantMemories.scope, scope), eq(assistantMemories.userEmail, owner), sql`lower(${assistantMemories.content}) = ${content.toLowerCase()}`));
    if (dupe.length) return JSON.stringify({ saved: false, note: "Already remembered." });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(assistantMemories).where(and(eq(assistantMemories.scope, scope), eq(assistantMemories.userEmail, owner)));
    if (n >= 200) return JSON.stringify({ error: "Memory is full — ask the user to prune old notes in Assistant settings." });
    await db.insert(assistantMemories).values({ scope, userEmail: owner, content, createdBy: email });
    return JSON.stringify({ saved: true, scope });
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message.slice(0, 150) });
  }
}
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type UpstreamMsg =
  | Msg
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Providers that reject the `tools` parameter (some local vLLM/Ollama builds
 *  without a tool-call parser). Remembered per base URL for a short while so
 *  most requests skip the wasted round — but it re-probes, so a transient
 *  provider hiccup can never disable firm-data lookups until redeploy. */
const toolsUnsupportedUntil = new Map<string, number>();
const TOOLS_RETRY_MS = 10 * 60 * 1000;
const toolsUnsupported = (baseUrl: string) => (toolsUnsupportedUntil.get(baseUrl) ?? 0) > Date.now();
/** Only a request-shape rejection means "no tool support" — auth problems and
 *  overload are transient and must not turn tools off. */
const looksLikeToolRejection = (status: number) => status === 400 || status === 404 || status === 422;

const enc = new TextEncoder();
const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const sseText = (delta: string) => sse({ choices: [{ delta: { content: delta } }] });

/** Read one upstream SSE round: forward content deltas to the client as they
 *  arrive and accumulate any tool calls the model makes. */
async function pipeRound(
  body: ReadableStream<Uint8Array>,
  emit: (chunk: Uint8Array) => void,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const calls: { id: string; name: string; args: string }[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          emit(sseText(delta.content));
        }
        // Tool-call arguments stream in fragments keyed by index.
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const i = typeof tc.index === "number" ? tc.index : calls.length;
            while (calls.length <= i) calls.push({ id: "", name: "", args: "" });
            if (tc.id) calls[i].id = tc.id;
            if (tc.function?.name) calls[i].name += tc.function.name;
            if (tc.function?.arguments) calls[i].args += tc.function.arguments;
          }
        }
      } catch { /* keep-alive lines */ }
    }
  }
  return {
    content,
    toolCalls: calls
      .filter((c) => c.name)
      .slice(0, 5)
      .map((c, i) => ({ id: c.id || `call_${i}`, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })),
  };
}

/**
 * Server-side proxy to the configured OpenAI-compatible chat endpoint, with an
 * agentic tool loop: when the model asks for firm data (cases, discovery,
 * exhibits, deadlines…), the tools run here — read-only, behind the admin
 * session — and the model continues with the results. The provider key never
 * leaves the server; the browser only ever talks to this admin-gated route.
 */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const cfg = aiConfig();
  if (!cfg) {
    return NextResponse.json({ error: "The assistant isn't configured yet. Set AI_BASE_URL, AI_API_KEY, and AI_MODEL." }, { status: 503 });
  }

  let body: { messages?: Msg[]; mode?: string; threadId?: number | null; regen?: boolean; matter?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // A chat-blocking notice (e.g. a model swap in progress) pauses sending —
  // the UI grays the button out too, but the server is the enforcement.
  const notice = await getAiNotice().catch(() => null);
  if (notice?.chatBlocked) {
    return NextResponse.json({ error: `The AI is briefly busy: ${notice.message}` }, { status: 503 });
  }

  // Every chat marks the AI server as in use, so the idle reaper's clock
  // resets while people are actually working with it.
  void touchAiLastUsed();

  const modeKey = MODES[body.mode ?? "general"] ? (body.mode ?? "general") : "general";
  // The Coding tool is a separately granted ability: owners always, everyone
  // else only with the per-user grant from User Management.
  if (modeKey === "code" && !canUseAssistantCode(session.role, session.permissions)) {
    return NextResponse.json({ error: "The Coding tool hasn't been turned on for your account. An owner can grant it in User Management." }, { status: 403 });
  }
  const mode = MODES[modeKey];
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  // Keep only well-formed user/assistant turns, cap the history, and cap each
  // message length so a runaway payload can't be sent upstream.
  const history: Msg[] = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }));
  if (history.length === 0) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  const lastUser = history[history.length - 1];

  // Saved conversations: resolve (or create) the caller's thread and persist the
  // user turn now; the assistant turn is persisted when the stream finishes.
  // With no database configured the chat still works — it's just not saved.
  let threadId: number | null = null;
  if (db) {
    try {
      if (typeof body.threadId === "number" && Number.isFinite(body.threadId)) {
        const [t] = await db
          .select({ id: assistantThreads.id })
          .from(assistantThreads)
          .where(and(eq(assistantThreads.id, body.threadId), eq(assistantThreads.userEmail, session.email)));
        threadId = t?.id ?? null;
      }
      if (threadId == null && lastUser.role === "user" && !body.regen) {
        const title = lastUser.content.replace(/\s+/g, " ").trim().slice(0, 80) || "New conversation";
        const [t] = await db
          .insert(assistantThreads)
          .values({ userEmail: session.email, mode: modeKey, title })
          .returning({ id: assistantThreads.id });
        threadId = t.id;
      }
      // On regenerate the user turn is already saved — only the fresh assistant
      // reply should be appended.
      if (threadId != null && lastUser.role === "user" && !body.regen) {
        await db.insert(assistantMessages).values({ threadId, role: "user", content: lastUser.content });
        await db.update(assistantThreads).set({ updatedAt: new Date() }).where(eq(assistantThreads.id, threadId));
      }
    } catch {
      threadId = null; // saving is best-effort; never block the reply
    }
  }

  // Firm-data tools ride along whenever the database is configured and the
  // provider accepts them. A conversation-attached matter pins the case.
  let useTools = !!db && !toolsUnsupported(cfg.baseUrl);
  const billingAllowed = canReviewBilling(session.role, session.permissions);
  const matter = typeof body.matter === "string" ? body.matter.trim().slice(0, 120) : "";
  let systemPrompt = mode.prompt + (useTools ? TOOLS_PROMPT : "");
  if (matter && useTools) {
    systemPrompt += ` The user attached case/matter "${matter}" to this conversation — when a question concerns "the case" or "this case", that is the one; look it up with your tools as needed.`;
  }
  if (useTools) {
    systemPrompt += billingAllowed
      ? " This user holds billing access: the billing_summary tool answers questions about billed hours and amounts."
      : " This user does NOT hold billing access: politely decline to share billing amounts, revenue, or rates — that information is limited to the owners and billing staff. Their own time entry work in Time Tracker 4.0 is fine to discuss in general terms.";
    systemPrompt += " Use save_memory sparingly — only for durable preferences or standing facts, never case details or anything sensitive.";
    systemPrompt += await personalization(session.email);
  }

  const convo: UpstreamMsg[] = [{ role: "system", content: systemPrompt }, ...history];
  const model = modelForMode(modeKey) ?? cfg.model;
  const chatUrl = `${cfg.baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };

  let acc = "";
  let saved = false;
  const persist = async () => {
    if (saved || threadId == null || !db || !acc.trim()) return;
    saved = true;
    try {
      await db.insert(assistantMessages).values({ threadId, role: "assistant", content: acc });
      await db.update(assistantThreads).set({ updatedAt: new Date() }).where(eq(assistantThreads.id, threadId));
    } catch { /* best-effort */ }
  };

  // Fail fast (before streaming headers go out) on the first upstream call so
  // configuration problems surface as a normal error message in the UI.
  const callUpstream = (withTools: boolean) =>
    fetch(chatUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: convo,
        stream: true,
        temperature: mode.temperature,
        ...(withTools
          ? { tools: [...assistantToolSchemas(), MEMORY_TOOL, GUIDE_TOOL, GENERATE_DOC_TOOL, ...(billingAllowed ? [BILLING_TOOL] : [])], tool_choice: "auto" }
          : {}),
      }),
      signal: req.signal,
    });

  let first: Response;
  try {
    first = await callUpstream(useTools);
    if (!first.ok && useTools && looksLikeToolRejection(first.status)) {
      // Some local engines (vLLM/Ollama without a tool parser) reject `tools`.
      // Fall back to a plain chat and remember briefly, so the assistant still
      // works everywhere — just without live firm-data lookups.
      toolsUnsupportedUntil.set(cfg.baseUrl, Date.now() + TOOLS_RETRY_MS);
      useTools = false;
      convo[0] = { role: "system", content: mode.prompt };
      first = await callUpstream(false);
    }
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI provider." }, { status: 502 });
  }
  if (!first.ok || !first.body) {
    const detail = await first.text().catch(() => "");
    return NextResponse.json({ error: `AI provider error (${first.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunk: Uint8Array) => { try { controller.enqueue(chunk); } catch { /* client gone */ } };
      try {
        let res: Response | null = first;
        // The agentic loop: each round either finishes the answer or asks for
        // tools; tool results are appended and the model continues. Bounded so
        // a confused model can't spin forever.
        for (let round = 0; round < 8 && res; round++) {
          const { content, toolCalls } = await pipeRound(res.body!, emit);
          acc += content;
          if (!useTools || toolCalls.length === 0) break;

          convo.push({ role: "assistant", content: content || null, tool_calls: toolCalls });
          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* malformed args */ }
            const name = tc.function.name;
            let result: string;
            if (name === "save_memory") {
              emit(sse({ tool_status: "Saving a note to memory…" }));
              result = await saveMemory(session.email, args);
            } else if (name === "admin_panel_guide") {
              emit(sse({ tool_status: "Pulling up the admin panel map…" }));
              result = buildAdminGuide(session.role, session.permissions);
            } else if (name === "generate_document") {
              emit(sse({ tool_status: "Filling in the template…" }));
              const revs = Array.isArray(args.revisions) ? (args.revisions as { find: string; replace: string }[]) : [];
              const flds = args.fields && typeof args.fields === "object" ? (args.fields as Record<string, string>) : {};
              const gen = await generateFromTemplate({
                templateId: Number(args.template_id),
                matter: typeof args.matter === "string" ? args.matter : matter || undefined,
                fields: flds,
                revisions: revs,
                nameHint: typeof args.name_hint === "string" ? args.name_hint : undefined,
                byEmail: session.email,
              });
              result = JSON.stringify(gen);
            } else if (name === "billing_summary") {
              emit(sse({ tool_status: "Adding up the billing…" }));
              result = billingAllowed ? await billingSummary(args) : JSON.stringify({ error: "This user does not hold billing access." });
            } else {
              emit(sse({ tool_status: toolStatusLabel(name, args) }));
              result = await runAssistantTool(name, args);
            }
            convo.push({ role: "tool", tool_call_id: tc.id, content: result });
          }

          res = null;
          try {
            const next = await callUpstream(true);
            if (next.ok && next.body) res = next;
            else emit(sse({ stream_error: `The AI provider errored mid-answer (${next.status}).` }));
          } catch {
            if (!req.signal.aborted) emit(sse({ stream_error: "Lost the AI provider mid-answer." }));
          }
          if (res && content) { acc += "\n\n"; emit(sseText("\n\n")); } // separate any pre-tool remarks from the continuation
        }
      } catch { /* aborted or upstream died — keep what we have */ }
      await persist();
      emit(enc.encode("data: [DONE]\n\n"));
      try { controller.close(); } catch { /* already closed */ }
    },
    async cancel() {
      // Client stopped the generation or closed the tab: keep the partial reply.
      await persist();
    },
  });

  const outHeaders: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  };
  if (threadId != null) outHeaders["X-Thread-Id"] = String(threadId);
  return new Response(stream, { headers: outHeaders });
}
