import "server-only";
import { getAiSetting, putAiSetting } from "@/lib/ai/concierge";
import { aiConfig } from "@/lib/ai/config";

/**
 * Two models, one GPU: the everyday text model and a vision model that can
 * read photos and scanned documents. The card only holds one at a time, so
 * the system SWAPS — the pod's start script asks this site which model is
 * wanted (via /api/ai/desired-model), and swapping is just "flip the
 * setting, restart the pod". Every caller that talks to the AI asks
 * activeModel() so requests always name whichever model is loaded.
 *
 * Configuration (hosting environment, optional — without it the assistant
 * is text-only and none of the swap UI appears):
 *   AI_MODEL_VISION        vision model id served by the same vLLM box
 *   AI_MODEL_VISION_LABEL  friendly name for the UI (defaults to the id)
 */

export const AI_DESIRED_MODEL_KEY = "ai.desiredModel";

export type DesiredModel = "text" | "vision";

export function visionEnv(): { model: string; label: string } | null {
  const model = process.env.AI_MODEL_VISION?.trim();
  if (!model) return null;
  return { model, label: process.env.AI_MODEL_VISION_LABEL?.trim() || model };
}

export async function getDesiredModel(): Promise<DesiredModel> {
  if (!visionEnv()) return "text";
  const v = await getAiSetting<string>(AI_DESIRED_MODEL_KEY, "text");
  return v === "vision" ? "vision" : "text";
}

export async function setDesiredModel(target: DesiredModel): Promise<void> {
  await putAiSetting(AI_DESIRED_MODEL_KEY, target);
}

/** The model id + label requests should be sent to right now (per the
 *  desired setting — during a swap the server may briefly still be loading
 *  it; callers that care about readiness check the serving model too). */
export async function activeModel(): Promise<{ model: string; label: string; desired: DesiredModel } | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const desired = await getDesiredModel();
  const vision = visionEnv();
  if (desired === "vision" && vision) return { model: vision.model, label: vision.label, desired };
  return { model: cfg.model, label: cfg.label, desired: "text" };
}
