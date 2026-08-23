/**
 * The AI engine's single swap point.
 *
 * The whole app talks to ONE OpenAI-compatible chat endpoint, chosen entirely by
 * environment variables — never hard-coded, never committed. That means we can
 * point the Assistant at any serverless Llama host today (Together, Fireworks,
 * Groq, DeepInfra, OpenRouter, …) and later at our own GPU server running vLLM,
 * without changing a line of app code — just the env vars.
 *
 * Required (set in the hosting env, e.g. Vercel → Project → Environment):
 *   AI_BASE_URL   OpenAI-compatible base, e.g. https://api.together.xyz/v1
 *   AI_API_KEY    the provider key (a server-only secret)
 *   AI_MODEL      the default model id, e.g. meta-llama/Llama-3.3-70B-Instruct-Turbo
 * Optional:
 *   AI_MODEL_LABEL    friendly name shown in the UI (defaults to AI_MODEL)
 *   AI_MODEL_CODE     model override for the Coding tool (e.g. a code specialist)
 *   AI_MODEL_DRAFT    model override for the Drafting tool
 *   AI_MODEL_GENERAL  model override for the General tool
 *
 * Per-task routing is how an open stack punches at top-tier quality: run a code
 * specialist in Coding and the strongest generalist in Drafting/General. All
 * overrides fall back to AI_MODEL, and all must live at the same AI_BASE_URL.
 *
 * Nothing here is confidential; the key lives only in the server environment and
 * is read exclusively by server code (the /api/admin/assistant route).
 */

export type AiConfig = {
  /** OpenAI-compatible base URL, no trailing slash. */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Friendly label for the UI. */
  label: string;
};

export function aiConfig(): AiConfig | null {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model,
    label: process.env.AI_MODEL_LABEL?.trim() || model,
  };
}

/** The model to use for a given tool — per-mode override, else the default. */
export function modelForMode(mode: string): string | null {
  const cfg = aiConfig();
  if (!cfg) return null;
  const override =
    mode === "code" ? process.env.AI_MODEL_CODE :
    mode === "draft" ? process.env.AI_MODEL_DRAFT :
    mode === "general" ? process.env.AI_MODEL_GENERAL : undefined;
  return override?.trim() || cfg.model;
}

/** True once a provider, key, and model are all set. Used to light up the tab. */
export function isAiConfigured(): boolean {
  return aiConfig() !== null;
}

/** Public (non-secret) view of the config for the client — no key. */
export function aiPublicInfo(): { configured: boolean; label: string | null } {
  const c = aiConfig();
  return { configured: c !== null, label: c?.label ?? null };
}
