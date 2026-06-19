/**
 * Voice model + asset configuration (Time Tracker 3.0).
 *
 * Confidential-path assets (the VAD model + worklet that touch the live mic) are
 * served FIRST-PARTY from /voice/vad/ — vendored into /public, no third party in
 * the loop. The ONNX runtime wasm and the Whisper weights carry no user data
 * (audio is transcribed locally; only the model binary is fetched), so they load
 * from the default CDN unless an origin override is provided — the seam below is
 * where self-hosting on our own Blob origin gets switched on later.
 */

/** First-party, self-hosted Silero VAD assets (worklet + onnx). */
export const VAD_ASSET_BASE = "/voice/vad/";

/** Whisper model id (English, tiny — fast + accurate enough for short utterances
 *  with VAD endpointing). transformers.js resolves this from its model host. */
export const STT_MODEL_ID = "onnx-community/whisper-tiny.en";

/** Optional self-host origin for STT/runtime assets. When set (e.g. a Blob base
 *  URL), transformers.js is pointed here instead of the public CDN. */
export const STT_REMOTE_HOST: string | null = null;

/** Approximate first-run download budget, for honest UI copy. */
export const APPROX_DOWNLOAD_MB = { vad: 2, stt: 45 } as const;
