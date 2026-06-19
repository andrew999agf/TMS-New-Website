/**
 * OnDeviceEngine (Time Tracker 3.0) — composes the fully on-device pipeline into
 * the VoiceEngine the conversation logic consumes:
 *
 *     mic → Silero VAD (endpointing + barge-in) → Whisper STT → text
 *     prompts → device TTS
 *
 * Nothing the attorney says leaves the device. The VAD runs continuously so we
 * get real barge-in: if the user starts talking while a prompt is playing, the
 * prompt is cut and their words are captured for the next listen().
 */

import type { VoiceEngine, ListenOptions, LoadProgress } from "./engine";
import type { Backend } from "./backend";
import { createVad, type VadHandle } from "./vad";
import { loadStt, transcribe } from "./stt";
import { Tts } from "./tts";

export class OnDeviceEngine implements VoiceEngine {
  readonly name = "on-device";
  readonly tts: Tts;

  onInterim?: (text: string) => void;
  onSpeechStart?: () => void;
  onListeningChange?: (listening: boolean) => void;

  private backend: Backend;
  private preferScriptProcessor: boolean;
  private vad: VadHandle | null = null;
  private ready = false;

  // One-utterance hand-off between the continuous VAD and discrete listen() calls.
  private pendingResolve: ((s: string) => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private buffered: string | null = null; // captured during a prompt (barge-in)
  private speaking = false;

  constructor(opts: { backend: Backend; preferScriptProcessor?: boolean; tts?: Tts }) {
    this.backend = opts.backend;
    this.preferScriptProcessor = opts.preferScriptProcessor ?? false;
    this.tts = opts.tts ?? new Tts();
  }

  /** Which capture path the VAD actually selected (for telemetry). */
  get captureKind(): "audioworklet" | "scriptprocessor" | "none" {
    if (!this.vad) return "none";
    return this.vad.processorType === "ScriptProcessor" ? "scriptprocessor" : "audioworklet";
  }

  async init(onProgress?: (p: LoadProgress) => void): Promise<void> {
    if (this.ready) return;
    onProgress?.({ phase: "loading", ratio: null, label: "Loading speech model…" });
    await loadStt(this.backend, (ratio, label) => onProgress?.({ phase: "loading", ratio, label }));

    onProgress?.({ phase: "warming", ratio: null, label: "Starting microphone…" });
    this.vad = await createVad(
      {
        onSpeechStart: () => {
          // Barge-in: stop any prompt the moment the user starts speaking.
          if (this.speaking) this.tts.stop();
          this.onSpeechStart?.();
          this.onListeningChange?.(true);
        },
        onSpeechEnd: (audio) => void this.handleUtterance(audio),
        onMisfire: () => this.onListeningChange?.(false),
      },
      this.preferScriptProcessor,
    );
    await this.vad.start();
    this.ready = true;
    onProgress?.({ phase: "ready", ratio: 1, label: "Ready" });
  }

  private async handleUtterance(audio: Float32Array): Promise<void> {
    const text = await transcribe(audio);
    this.onListeningChange?.(false);
    if (!text) return;
    this.onInterim?.(text);
    if (this.pendingResolve) {
      this.resolveListen(text);
    } else {
      // Spoken during a prompt (or between turns) — keep the latest for next listen().
      this.buffered = text;
    }
  }

  private resolveListen(text: string): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const r = this.pendingResolve;
    this.pendingResolve = null;
    r?.(text);
  }

  listen(opts?: ListenOptions): Promise<string> {
    // If the user already answered (e.g. barged in over the prompt), use it.
    if (this.buffered) {
      const t = this.buffered;
      this.buffered = null;
      return Promise.resolve(t);
    }
    return new Promise<string>((resolve) => {
      this.pendingResolve = resolve;
      const timeout = opts?.timeoutMs ?? 15000;
      this.pendingTimer = setTimeout(() => {
        this.onListeningChange?.(false);
        this.resolveListen("");
      }, timeout);
    });
  }

  abortListen(): void {
    this.buffered = null;
    if (this.pendingResolve) this.resolveListen("");
    this.onListeningChange?.(false);
  }

  async speak(text: string): Promise<void> {
    this.speaking = true;
    try {
      await this.tts.speak(text);
    } finally {
      this.speaking = false;
    }
  }
  stopSpeaking(): void {
    this.tts.stop();
    this.speaking = false;
  }
  setMuted(muted: boolean): void {
    this.tts.setMuted(muted);
  }

  dispose(): void {
    this.abortListen();
    this.tts.stop();
    void this.vad?.destroy();
    this.vad = null;
    this.ready = false;
  }
}
