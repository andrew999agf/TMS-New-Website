import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { aiConfig } from "@/lib/ai/config";

export const runtime = "nodejs";
// Streaming replies can run a while; give the function room.
export const maxDuration = 120;

/** The firm assistant's standing instructions. Kept here (not in the repo's
 *  public surface) and prepended to every conversation. Behavior only — no
 *  confidential data lives here. */
const SYSTEM_PROMPT =
  "You are the in-house assistant for a Texas trial law firm, used only by firm staff inside the admin panel. " +
  "Your priorities, in order: (1) writing and debugging code, (2) drafting and editing clear written work, (3) general knowledge. " +
  "Be direct and practical. When you write code, make it correct and runnable. When you draft, match a professional legal-office tone. " +
  "You are not a substitute for a lawyer's judgment and you do not give legal advice to the public. " +
  "If you are unsure, say so rather than inventing facts, citations, or case law.";

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

  let body: { messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  // Keep only well-formed user/assistant turns, cap the history, and cap each
  // message length so a runaway payload can't be sent upstream.
  const history: Msg[] = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }));
  if (history.length === 0) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });

  const messages: Msg[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: 0.3 }),
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
