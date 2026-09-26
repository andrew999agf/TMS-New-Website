import "server-only";
import { getAiSetting, putAiSetting } from "@/lib/ai/concierge";

/**
 * The AI status notice: one shared message the Assistant UI surfaces as a
 * drop-down toast — "Vision enabled for Discovery Set 12", "Switching
 * models, chat back in ~3 minutes", and so on. Whatever background work
 * needs the user's awareness writes here; the UI polls it alongside the
 * power strip. `chatBlocked` grays out sending while an operation (like a
 * model swap) makes the chat unavailable. Notices expire on their own so a
 * crashed job can never wedge the chat shut.
 */

export type AiNotice = {
  message: string;
  /** Disable sending chats while this notice is active. */
  chatBlocked: boolean;
  /** ISO timestamp after which the notice self-clears (safety valve). */
  until: string;
  startedAt: string;
};

const KEY = "ai.notice";
const MAX_MINUTES = 30;

export async function setAiNotice(message: string, opts: { chatBlocked?: boolean; minutes?: number } = {}): Promise<void> {
  const minutes = Math.min(Math.max(1, opts.minutes ?? 10), MAX_MINUTES);
  const notice: AiNotice = {
    message: message.slice(0, 300),
    chatBlocked: !!opts.chatBlocked,
    until: new Date(Date.now() + minutes * 60000).toISOString(),
    startedAt: new Date().toISOString(),
  };
  await putAiSetting(KEY, notice);
}

export async function clearAiNotice(): Promise<void> {
  await putAiSetting(KEY, null);
}

/** The active notice, or null if none / expired. */
export async function getAiNotice(): Promise<AiNotice | null> {
  const n = await getAiSetting<AiNotice | null>(KEY, null);
  if (!n?.message) return null;
  if (new Date(n.until).getTime() < Date.now()) return null;
  return n;
}
