/**
 * VoiceEngine — the swappable I/O layer under Time Tracker 3.0's conversation
 * logic. The orchestrator (parsers, slot-filling, candidate picker, save loop)
 * talks ONLY to this interface, so the underlying speech stack can change
 * without touching any of that proven logic.
 *
 * The registered engine is the on-device pipeline (own capture → Silero VAD →
 * Whisper STT → device TTS). The only fallback is the typed form, which always
 * works. We never silently route audio to a third party.
 */

export type LoadPhase = "idle" | "loading" | "warming" | "ready" | "error";

export type LoadProgress = {
  phase: LoadPhase;
  /** 0..1 across all model downloads, or null when indeterminate. */
  ratio: number | null;
  /** Human label, e.g. "Loading speech model… 40%". */
  label: string;
};

export type ListenOptions = {
  /** Give up and resolve "" after this long with no end-of-speech. */
  timeoutMs?: number;
};

export interface VoiceEngine {
  readonly name: string;

  /** Acquire mic + load/warm models. Must be called from a user gesture.
   *  Reports progress so the UI can show a real loading state. */
  init(onProgress?: (p: LoadProgress) => void): Promise<void>;

  /** Speak a prompt (no client data). Resolves when finished or interrupted.
   *  Resolves immediately when muted. */
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
  setMuted(muted: boolean): void;

  /** Listen for one utterance. Resolves with the final transcript when the VAD
   *  detects end-of-speech, or "" on timeout/abort. */
  listen(opts?: ListenOptions): Promise<string>;
  abortListen(): void;

  /** Live UI hooks. onInterim may be a coarse "listening" signal when the STT
   *  is non-streaming; onSpeechStart drives barge-in + the listening indicator. */
  onInterim?: (text: string) => void;
  onSpeechStart?: () => void;
  onListeningChange?: (listening: boolean) => void;

  dispose(): void;
}
