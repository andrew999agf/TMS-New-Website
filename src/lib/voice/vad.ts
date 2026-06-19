/**
 * VAD controller (Time Tracker 3.0). Wraps Silero VAD (MicVAD) — which owns the
 * getUserMedia capture, the AudioWorklet/ScriptProcessor frame pipeline, and the
 * neural endpointing — behind a small, predictable interface.
 *
 * This is the "knows when you've started and stopped" core that makes the
 * conversation feel like talking to a person:
 *   - onSpeechStart fires the instant the user begins (drives barge-in).
 *   - onSpeechEnd hands back the captured utterance as 16 kHz mono Float32,
 *     ready for the STT — only AFTER a tuned silence hangover, so we don't cut
 *     people off mid-sentence.
 *
 * The library is imported dynamically so it never enters the SSR/build graph.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { VAD_ASSET_BASE } from "./models";

export type VadCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onMisfire?: () => void;
};

export type VadHandle = {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  destroy: () => Promise<void>;
  processorType: "AudioWorklet" | "ScriptProcessor";
};

/** Endpointing tuned for short, deliberate legal time-entry answers: quick to
 *  notice speech, patient enough not to clip the end of a sentence. */
const TUNING = {
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 640, // silence hangover before we call it "done"
  minSpeechMs: 250, // ignore lip-smacks / single-frame blips
  preSpeechPadMs: 240, // keep the attack of the first word
};

/**
 * Create + initialise the VAD on the live mic. MUST be called from a user
 * gesture (it triggers getUserMedia). `preferScriptProcessor` forces the
 * fallback path for the (rare) browsers without AudioWorklet.
 */
export async function createVad(
  cb: VadCallbacks,
  preferScriptProcessor = false,
): Promise<VadHandle> {
  const { MicVAD } = await import("@ricky0123/vad-web");

  const vad = await MicVAD.new({
    model: "v5",
    baseAssetPath: VAD_ASSET_BASE,
    processorType: preferScriptProcessor ? "ScriptProcessor" : "auto",
    startOnLoad: false,
    ...TUNING,
    onSpeechStart: () => cb.onSpeechStart?.(),
    onSpeechEnd: (audio: Float32Array) => cb.onSpeechEnd?.(audio),
    onVADMisfire: () => cb.onMisfire?.(),
  } as any);

  return {
    start: () => vad.start(),
    pause: () => vad.pause(),
    destroy: () => vad.destroy(),
    processorType: (vad as any)?._audioProcessorAdapterType === "ScriptProcessor" ? "ScriptProcessor" : "AudioWorklet",
  };
}
