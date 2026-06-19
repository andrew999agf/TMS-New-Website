/**
 * On-device speech-to-text (Time Tracker 3.0). Runs Whisper entirely in the
 * browser via transformers.js — the attorney's audio is transcribed on the
 * device and NEVER sent anywhere. This is the confidentiality win over the
 * browser's Web Speech API (which streamed audio to Google on Chrome).
 *
 * Backends: WebGPU where available (fast), quantized WASM everywhere else
 * (universal floor). Loaded lazily so it stays out of the SSR/build graph.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { STT_MODEL_ID, STT_REMOTE_HOST } from "./models";
import type { Backend } from "./backend";

export type SttProgress = (ratio: number | null, label: string) => void;

let _transcriber: any | null = null;
let _loading: Promise<any> | null = null;

/** Aggregate transformers.js per-file progress events into a single 0..1 ratio. */
function makeProgressAggregator(onProgress?: SttProgress) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (e: any) => {
    if (!onProgress) return;
    if (e?.status === "progress" && e.file) {
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      const ratio = total > 0 ? Math.min(0.99, loaded / total) : null;
      onProgress(ratio, `Loading speech model… ${ratio != null ? Math.round(ratio * 100) + "%" : ""}`.trim());
    } else if (e?.status === "ready" || e?.status === "done") {
      onProgress(1, "Speech model ready");
    }
  };
}

/** Load + warm the STT model. Idempotent; safe to call repeatedly. */
export async function loadStt(backend: Backend, onProgress?: SttProgress): Promise<void> {
  if (_transcriber) return;
  if (_loading) {
    await _loading;
    return;
  }
  _loading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Models carry no user data; only weights are fetched. Optionally self-host.
    (env as any).allowLocalModels = false;
    if (STT_REMOTE_HOST) (env as any).remoteHost = STT_REMOTE_HOST;

    const device = backend === "webgpu" ? "webgpu" : "wasm";
    const dtype = backend === "webgpu" ? "fp32" : "q8";
    const t = await pipeline("automatic-speech-recognition", STT_MODEL_ID, {
      device,
      dtype,
      progress_callback: makeProgressAggregator(onProgress),
    } as any);

    // Warm-up: a short silent buffer forces JIT/shader compile so the first real
    // utterance isn't slow.
    try {
      onProgress?.(null, "Warming up…");
      await t(new Float32Array(16000 * 0.4));
    } catch {
      /* warm-up is best-effort */
    }
    _transcriber = t;
    onProgress?.(1, "Speech model ready");
  })();
  try {
    await _loading;
  } finally {
    _loading = null;
  }
}

/** Transcribe a 16 kHz mono Float32 utterance to text. Returns "" on failure. */
export async function transcribe(audio: Float32Array): Promise<string> {
  if (!_transcriber || audio.length === 0) return "";
  try {
    // whisper-*.en is English-only: do NOT pass language/task (it rejects them).
    const out = await _transcriber(audio);
    const text = (Array.isArray(out) ? out[0]?.text : out?.text) ?? "";
    return String(text).trim();
  } catch {
    return "";
  }
}

export function isSttLoaded(): boolean {
  return _transcriber != null;
}
