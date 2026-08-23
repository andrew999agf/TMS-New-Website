import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { aiConfig, modelForMode } from "@/lib/ai/config";
import { db } from "@/db";
import { assistantThreads, assistantMessages } from "@/db/schema";

export const runtime = "nodejs";
// Streaming replies can run a while; give the function room.
export const maxDuration = 120;

/** Shared ground rules for every mode. Behavior only — no confidential data. */
const BASE_PROMPT =
  "You are the in-house assistant for a Texas trial law firm, used only by firm staff inside the admin panel. " +
  "Be direct and practical. You are not a substitute for a lawyer's judgment and you do not give legal advice to the public. " +
  "If you are unsure, say so rather than inventing facts, citations, or case law.";

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
      "notes or options after it. When editing, preserve the author's voice and flag anything substantive you changed.",
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

/**
 * Server-side proxy to the configured OpenAI-compatible chat endpoint. The
 * provider key never leaves the server; the browser only ever talks to this
 * admin-gated route. The upstream token stream is piped straight back so replies
 * appear as they're generated.
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

  let body: { messages?: Msg[]; mode?: string; threadId?: number | null; regen?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const modeKey = MODES[body.mode ?? "general"] ? (body.mode ?? "general") : "general";
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

  const messages: Msg[] = [{ role: "system", content: mode.prompt }, ...history];

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: modelForMode(modeKey) ?? cfg.model, messages, stream: true, temperature: mode.temperature }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI provider." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `AI provider error (${upstream.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
  }

  // Pipe the provider's server-sent-events stream through to the client while
  // accumulating the assistant's text server-side, so the finished (or
  // interrupted) reply is saved to the thread even if the tab closes mid-answer.
  const upstreamReader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  let sseBuf = "";
  let saved = false;
  const persist = async () => {
    if (saved || threadId == null || !db || !acc.trim()) return;
    saved = true;
    try {
      await db.insert(assistantMessages).values({ threadId, role: "assistant", content: acc });
      await db.update(assistantThreads).set({ updatedAt: new Date() }).where(eq(assistantThreads.id, threadId));
    } catch { /* best-effort */ }
  };
  const collect = (chunk: Uint8Array) => {
    sseBuf += decoder.decode(chunk, { stream: true });
    const lines = sseBuf.split("\n");
    sseBuf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) acc += delta;
      } catch { /* keep-alive lines */ }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await upstreamReader.read();
        if (done) { await persist(); controller.close(); return; }
        if (value) { collect(value); controller.enqueue(value); }
      } catch {
        await persist();
        controller.close();
      }
    },
    async cancel() {
      // Client stopped the generation or closed the tab: keep the partial reply.
      try { await upstreamReader.cancel(); } catch { /* already closed */ }
      await persist();
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  };
  if (threadId != null) headers["X-Thread-Id"] = String(threadId);
  return new Response(stream, { headers });
}
