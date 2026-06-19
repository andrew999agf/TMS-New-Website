/**
 * Client-side voice telemetry. Fire-and-forget; never throws, never blocks the
 * UI. Sends only device capability + pipeline-stage outcome to our own server —
 * no audio, no transcript, no personal data. This is how we SEE what happens on
 * real staff devices instead of guessing.
 */

export type DiagStage = "capability" | "permission" | "capture" | "vad" | "stt" | "tts" | "done";

export type DiagRecord = {
  platformLabel?: string;
  os?: string;
  browser?: string;
  engineGroup?: string;
  capture?: string;   // audioworklet | scriptprocessor | none
  backend?: string;   // webgpu | wasm | none
  permission?: string;
  secure?: boolean;
  standalone?: boolean;
  stage?: DiagStage;
  success?: boolean;
  reason?: string;
  message?: string;
  sampleRate?: number;
  captureMs?: number;
  transcribeMs?: number;
};

export function reportDiag(record: DiagRecord): void {
  if (typeof navigator === "undefined") return;
  try {
    const body = JSON.stringify({ ...record, message: record.message?.slice(0, 256) });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/voice/diag", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/voice/diag", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
