import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { aiConfig } from "@/lib/ai/config";
import { activeModel } from "@/lib/ai/vision";
import { db } from "@/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Connection test for the AI endpoint: is it reachable, does it answer, how
 * fast, and does it support the tool calling that powers the firm-data
 * lookups? Read-only and admin-gated — used by the "Test connection" button
 * so swapping providers (cloud API today, the firm's own GPU server later)
 * is a green-light/red-light affair.
 */
export async function POST() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const cfg = aiConfig();
  if (!cfg) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      note: "AI_BASE_URL, AI_API_KEY, and AI_MODEL aren't set in the hosting environment yet.",
    });
  }

  // Test whichever model is actually loaded (text or vision).
  const act = await activeModel().catch(() => null);
  const model = act?.model ?? cfg.model;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };
  const url = `${cfg.baseUrl}/chat/completions`;
  const withTimeout = (ms: number) => AbortSignal.timeout(ms);

  // 1) Plain round trip: can we reach it and get words back?
  let reachable = false;
  let latencyMs: number | null = null;
  let reply = "";
  let errorDetail = "";
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: withTimeout(30000),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Connection test - reply with the single word: ready" }],
        max_tokens: 10,
        temperature: 0,
        stream: false,
      }),
    });
    latencyMs = Date.now() - t0;
    if (res.ok) {
      const j = await res.json().catch(() => null);
      reply = String(j?.choices?.[0]?.message?.content ?? "").trim();
      reachable = true;
    } else {
      errorDetail = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
    }
  } catch (e) {
    latencyMs = Date.now() - t0;
    errorDetail = (e as Error).name === "TimeoutError" ? "Timed out after 30s — the server may be off or still loading the model." : `Couldn't connect: ${(e as Error).message?.slice(0, 200)}`;
  }

  // 2) Tool support: send a trivial tool definition; a request-shape rejection
  //    (400/404/422) means no tool support, anything else means it's accepted.
  let toolSupport: boolean | null = null;
  if (reachable) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal: withTimeout(30000),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say ok." }],
          max_tokens: 10,
          temperature: 0,
          stream: false,
          tools: [{ type: "function", function: { name: "ping_check", description: "Connectivity probe. Never call this.", parameters: { type: "object", properties: {} } } }],
          tool_choice: "auto",
        }),
      });
      toolSupport = res.ok ? true : !(res.status === 400 || res.status === 404 || res.status === 422);
    } catch {
      toolSupport = null; // transient — can't tell
    }
  }

  return NextResponse.json({
    configured: true,
    baseUrlHost: (() => { try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; } })(),
    model,
    label: act?.label ?? cfg.label,
    reachable,
    latencyMs,
    reply: reply.slice(0, 80),
    toolSupport,
    firmDataReady: reachable && toolSupport === true && !!db,
    dbConfigured: !!db,
    ...(errorDetail ? { errorDetail } : {}),
  });
}
