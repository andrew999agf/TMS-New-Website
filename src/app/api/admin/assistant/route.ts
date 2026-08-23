import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { aiConfig } from "@/lib/ai/config";

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

  let body: { messages?: Msg[]; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const mode = MODES[body.mode ?? "general"] ?? MODES.general;
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  // Keep only well-formed user/assistant turns, cap the history, and cap each
  // message length so a runaway payload can't be sent upstream.
  const history: Msg[] = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }));
  if (history.length === 0) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });

  const messages: Msg[] = [{ role: "system", content: mode.prompt }, ...history];

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: mode.temperature }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI provider." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `AI provider error (${upstream.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
  }

  // Pipe the provider's server-sent-events stream straight through; the client
  // parses the OpenAI-style delta chunks.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
