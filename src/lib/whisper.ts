/**
 * On-device speech recognition using OpenAI Whisper (MIT) via Hugging Face
 * Transformers.js (Apache-2.0). Everything runs in the browser: the model is
 * downloaded once and cached, then audio is recorded and transcribed locally —
 * no Google, no server, works offline. Permissive for commercial use.
 *
 * Built to be robust on mobile (Android tablets/phones):
 *  - forces single-threaded WASM (multi-threaded needs COOP/COEP headers we
 *    don't set; without them it can fail to initialize — a common "model didn't
 *    finish" cause on mobile);
 *  - captures raw PCM with a ScriptProcessor instead of MediaRecorder, avoiding
 *    Android codec/container differences (webm vs mp4 vs 3gpp) and the separate
 *    decodeAudioData step.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL_ID = "Xenova/whisper-tiny.en"; // small + fast; English

let pipePromise: Promise<any> | null = null;
let pipe: any = null;

export type LoadProgress = { pct: number; status: "downloading" | "installing" | "ready" };

/** Download and initialize Whisper. Safe to call repeatedly; only loads once. */
export async function loadWhisper(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (pipe) { onProgress?.({ pct: 100, status: "ready" }); return; }
  if (!pipePromise) {
    pipePromise = (async () => {
      const TJS: any = await import("@huggingface/transformers");
      try {
        TJS.env.allowLocalModels = false;
        // Single-threaded WASM works everywhere without cross-origin isolation.
        if (TJS.env.backends?.onnx?.wasm) {
          TJS.env.backends.onnx.wasm.numThreads = 1;
        }
      } catch { /* ignore env quirks */ }

      const files: Record<string, { loaded: number; total: number }> = {};
      const cb = (e: any) => {
        if ((e.status === "progress" || e.status === "download" || e.status === "initiate") && e.file) {
          const prev = files[e.file] || { loaded: 0, total: 0 };
          files[e.file] = { loaded: e.loaded ?? prev.loaded, total: e.total ?? prev.total };
          const total = Object.values(files).reduce((a, f) => a + (f.total || 0), 0);
          const loaded = Object.values(files).reduce((a, f) => a + (f.loaded || 0), 0);
          const pct = total ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
          onProgress?.({ pct, status: "downloading" });
        } else if (e.status === "done") {
          onProgress?.({ pct: 100, status: "installing" });
        }
      };
      const p = await TJS.pipeline("automatic-speech-recognition", MODEL_ID, { dtype: "q8", progress_callback: cb });
      pipe = p;
      onProgress?.({ pct: 100, status: "ready" });
    })().catch((err) => { pipePromise = null; throw err; });
  }
  await pipePromise;
}

export function whisperReady(): boolean {
  return !!pipe;
}

export async function transcribe(audio: Float32Array): Promise<string> {
  if (!pipe) throw new Error("Whisper model not loaded");
  if (audio.length < 1600) return ""; // < 0.1s — nothing useful
  const out = await pipe(audio);
  const text = Array.isArray(out) ? out.map((o: any) => o.text).join(" ") : out?.text ?? "";
  return String(text).trim();
}

/** Linear resample to 16 kHz (Whisper's required rate). */
function resample(data: Float32Array, from: number, to: number): Float32Array {
  if (from === to || !data.length) return data;
  const ratio = from / to;
  const len = Math.round(data.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, data.length - 1);
    const f = idx - i0;
    out[i] = data[i0] * (1 - f) + data[i1] * f;
  }
  return out;
}

export type RecordSignal = { aborted: boolean };

/**
 * A live audio session: the mic stream + an AudioContext. MUST be opened from a
 * user gesture (a tap) — on Android an AudioContext created outside a gesture
 * starts suspended and records silence. Open once when the user starts, reuse
 * for every turn.
 */
export type AudioSession = { ctx: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode };

export async function openAudioSession(): Promise<AudioSession> {
  const AC: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
  const ctx = new AC(); // created synchronously within the gesture
  try { await ctx.resume(); } catch { /* ignore */ }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } as MediaTrackConstraints,
  });
  const source = ctx.createMediaStreamSource(stream);
  return { ctx, stream, source };
}

export function closeAudioSession(s: AudioSession | null): void {
  if (!s) return;
  try { s.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
  try { s.ctx.close(); } catch { /* ignore */ }
}

/**
 * Record one spoken turn from an already-open session, ending ~1s after the
 * user stops talking (or a max length, or if they never speak). Returns 16 kHz
 * mono audio. The capture node is muted (no playback) and detached when the
 * turn ends; the session's mic + context stay alive for the next turn.
 */
export function recordTurn(session: AudioSession, opts: { signal?: RecordSignal; onLevel?: (rms: number) => void } = {}): Promise<Float32Array> {
  const { ctx, source } = session;
  const sampleRate = ctx.sampleRate;
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  const chunks: Float32Array[] = [];
  let started = false;
  let lastVoice = performance.now();
  const startAt = performance.now();
  let resolved = false;

  return new Promise<Float32Array>((resolve) => {
    const stop = () => {
      if (resolved) return;
      resolved = true;
      try { processor.disconnect(); mute.disconnect(); } catch { /* ignore */ }
      const len = chunks.reduce((a, c) => a + c.length, 0);
      const merged = new Float32Array(len);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      resolve(resample(merged, sampleRate, 16000));
    };
    processor.onaudioprocess = (e: any) => {
      if (opts.signal?.aborted) { stop(); return; }
      const data: Float32Array = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      opts.onLevel?.(rms);
      const now = performance.now();
      if (rms > 0.012) { started = true; lastVoice = now; }
      const endedBySilence = started && now - lastVoice > 1000;
      const endedByMax = now - startAt > 15000;
      const endedByNoSpeech = !started && now - startAt > 8000;
      if (endedBySilence || endedByMax || endedByNoSpeech) stop();
    };
  });
}
