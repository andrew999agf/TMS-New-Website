/**
 * On-device speech recognition using OpenAI Whisper (MIT) via Hugging Face
 * Transformers.js (Apache-2.0). Everything runs in the browser: the model is
 * downloaded once and cached, then audio is recorded and transcribed locally —
 * no Google, no server, works offline. Fully permissive for commercial use.
 *
 * Exposes:
 *   loadWhisper(onProgress) — download + initialize the model (progress 0–100)
 *   recordTurn(opts)        — record one spoken turn, ending on silence
 *   transcribe(audio)       — turn recorded audio into text
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL_ID = "Xenova/whisper-tiny.en"; // small + fast; English

let pipePromise: Promise<any> | null = null;
let pipe: any = null;

export type LoadProgress = { pct: number; status: string };

/** Download and initialize Whisper. Safe to call repeatedly; only loads once. */
export async function loadWhisper(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (pipe) { onProgress?.({ pct: 100, status: "ready" }); return; }
  if (!pipePromise) {
    pipePromise = (async () => {
      const TJS: any = await import("@huggingface/transformers");
      try { TJS.env.allowLocalModels = false; } catch { /* ignore */ }
      // Track per-file download bytes and report an aggregate percentage.
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
          // Bytes are in; the model is being compiled/initialized (no byte
          // progress for this part) — report it so the bar doesn't look stuck.
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
  if (!audio.length) return "";
  const out = await pipe(audio);
  const text = Array.isArray(out) ? out.map((o: any) => o.text).join(" ") : out?.text ?? "";
  return String(text).trim();
}

/** Linear resample to 16 kHz (Whisper's required rate). */
function resample(data: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return data;
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
 * Record one spoken turn from the microphone, stopping automatically ~0.9s
 * after the user stops talking (or after a max length, or if they never speak).
 * Returns mono 16 kHz audio ready for Whisper.
 */
export async function recordTurn(opts: { signal?: RecordSignal; onLevel?: (rms: number) => void } = {}): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } as MediaTrackConstraints,
  });
  const AC: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);

  const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const buf = new Uint8Array(analyser.fftSize);
  let started = false, lastVoice = Date.now(); const startAt = Date.now();
  const cleanup = () => { try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } };

  return await new Promise<Float32Array>((resolve, reject) => {
    const poll = setInterval(() => {
      if (opts.signal?.aborted) { clearInterval(poll); try { if (rec.state !== "inactive") rec.stop(); } catch { /* ignore */ } return; }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      opts.onLevel?.(rms);
      const now = Date.now();
      if (rms > 0.025) { started = true; lastVoice = now; }
      const endedBySilence = started && now - lastVoice > 900;
      const endedByMax = now - startAt > 15000;
      const endedByNoSpeech = !started && now - startAt > 7000;
      if (endedBySilence || endedByMax || endedByNoSpeech) {
        clearInterval(poll);
        try { if (rec.state !== "inactive") rec.stop(); } catch { /* ignore */ }
      }
    }, 100);

    rec.onstop = async () => {
      clearInterval(poll);
      cleanup();
      try {
        if (!chunks.length) { try { await ctx.close(); } catch { /* ignore */ } return resolve(new Float32Array(0)); }
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        const arr = await blob.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arr.slice(0));
        const raw = Float32Array.from(audioBuf.getChannelData(0));
        const copy = audioBuf.sampleRate !== 16000 ? resample(raw, audioBuf.sampleRate, 16000) : raw;
        try { await ctx.close(); } catch { /* ignore */ }
        resolve(copy);
      } catch (e) { try { await ctx.close(); } catch { /* ignore */ } reject(e); }
    };
    rec.onerror = () => { clearInterval(poll); cleanup(); reject(new Error("Recording failed")); };
    try { rec.start(100); } catch (e) { clearInterval(poll); cleanup(); reject(e); }
  });
}
