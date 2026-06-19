/**
 * Text-to-speech for prompts (Time Tracker 3.0). The spoken prompts ("Case and
 * rate?", "Saved.") contain NO client data, so device speech synthesis is the
 * pragmatic, dependency-free choice — and we bias hard toward on-device
 * (localService) voices so nothing leaves the machine where a local voice
 * exists. The class shape leaves a clean seam to swap in pre-rendered clips or a
 * neural engine (Kokoro + a permissive G2P) later without touching callers.
 */

const PREFER = [
  /natural/i, /neural/i, /google us english/i, /\baria\b/i, /\bjenny\b/i,
  /\bava\b/i, /samantha/i, /siri/i, /premium/i, /enhanced/i, /\bzira\b/i, /google/i,
];

export class Tts {
  private voice: SpeechSynthesisVoice | null = null;
  private rate = 1.06;
  private muted = false;
  private supported = typeof window !== "undefined" && "speechSynthesis" in window;

  /** English voices, on-device first. */
  listVoices(): SpeechSynthesisVoice[] {
    if (!this.supported) return [];
    const all = window.speechSynthesis.getVoices();
    const en = all.filter((v) => /^en\b|^en[-_]/i.test(v.lang));
    const pool = en.length ? en : all;
    return [...pool].sort((a, b) => Number(b.localService) - Number(a.localService));
  }

  pickBest(pool = this.listVoices()): SpeechSynthesisVoice | null {
    const local = pool.filter((v) => v.localService);
    const search = local.length ? local : pool; // honor "on-device first"
    for (const re of PREFER) {
      const v = search.find((x) => re.test(x.name));
      if (v) return v;
    }
    return search[0] ?? pool[0] ?? null;
  }

  setVoiceByName(name: string): void {
    this.voice = this.listVoices().find((v) => v.name === name) ?? null;
  }
  setVoice(v: SpeechSynthesisVoice | null): void {
    this.voice = v;
  }
  getVoiceName(): string {
    return this.voice?.name ?? "";
  }
  setRate(r: number): void {
    this.rate = r;
  }
  getRate(): number {
    return this.rate;
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stop();
  }
  isMuted(): boolean {
    return this.muted;
  }

  /** Speak a prompt; resolve when finished, interrupted, or muted. */
  speak(text: string): Promise<void> {
    if (!this.supported || this.muted) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.rate = this.rate;
        u.pitch = 1.0;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }

  stop(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  /** iOS needs a TTS call inside the first user gesture to unlock audio. */
  unlock(): void {
    if (!this.supported) return;
    try {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
}
