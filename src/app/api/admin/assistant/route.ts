import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath, canUseAssistantCode } from "@/lib/admin-sections";
import { aiConfig, modelForMode } from "@/lib/ai/config";
import { assistantToolSchemas, runAssistantTool, toolStatusLabel } from "@/lib/ai/tools";
import { db } from "@/db";
import { assistantThreads, assistantMessages } from "@/db/schema";

export const runtime = "nodejs";
// Streaming replies plus tool rounds can run a while; give the function room.
export const maxDuration = 300;

/** Shared ground rules for every mode. Behavior only — no confidential data. */
const BASE_PROMPT =
  "You are the in-house assistant for a Texas trial law firm, used only by firm staff inside the admin panel. " +
  "Be direct and practical. You are not a substitute for a lawyer's judgment and you do not give legal advice to the public. " +
  "If you are unsure, say so rather than inventing facts, citations, or case law.";

/** Added when the firm-data tools are attached to the request. */
const TOOLS_PROMPT =
  " You have read-only tools into the firm's own systems: Matters/Cases, the Discovery Reviewer, the Exhibit Reviewer, " +
  "the Pre-Trial Checklist, Intake, and Contacts. For ANY question about the firm's cases, documents, deadlines, or contacts, " +
  "use the tools — never answer from memory or invent case facts. Start with list_cases or get_case when only a name is given. " +
  "When reporting from documents, cite the document name and page so staff can verify. If a tool returns nothing or an error, " +
  "say what you looked for and what came back. The tools cannot change anything; to edit data, staff use the tabs themselves.";

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
  const matter = typeof body.matter === "string" ? body.matter.trim().slice(0, 120) : "";
  let systemPrompt = mode.prompt + (useTools ? TOOLS_PROMPT : "");
  if (matter && useTools) {
    systemPrompt += ` The user attached case/matter "${matter}" to this conversation — when a question concerns "the case" or "this case", that is the one; look it up with your tools as needed.`;
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
        ...(withTools ? { tools: assistantToolSchemas(), tool_choice: "auto" } : {}),
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
            emit(sse({ tool_status: toolStatusLabel(tc.function.name, args) }));
            const result = await runAssistantTool(tc.function.name, args);
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
