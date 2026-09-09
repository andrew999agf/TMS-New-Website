"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";

/**
 * Low-profile "read this exhibit aloud" button for the exhibit reviewer.
 *
 * Uses the browser's built-in speech engine (the Web Speech API) — no
 * external service, nothing uploaded, works offline. Every device ships
 * voices of very different quality, so pickVoice() hunts for the most
 * natural one available: the neural "Natural/Premium/Enhanced" voices on
 * Edge/macOS/iOS first, then Google's, then the named good ones, then any
 * US-English default. Text is read verbatim, page by page, chunked into
 * sentence-sized utterances so long exhibits don't get cut off mid-read.
 */

type Chunk = { text: string; page: number };

function chunksFromPages(pages: string[]): Chunk[] {
  const out: Chunk[] = [];
  pages.forEach((raw, i) => {
    const text = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    // Sentence-ish splits grouped to a comfortable utterance size.
    const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
    let buf = "";
    for (const p of parts) {
      if (buf && buf.length + p.length > 220) { out.push({ text: buf.trim(), page: i + 1 }); buf = ""; }
      buf += p;
      // A single monster "sentence" (tables, Bates strings) still gets flushed.
      while (buf.length > 400) { out.push({ text: buf.slice(0, 400), page: i + 1 }); buf = buf.slice(400); }
    }
    if (buf.trim()) out.push({ text: buf.trim(), page: i + 1 });
  });
  return out;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang) || v.lang === "en");
  if (!voices.length) return null;
  const ranks: ((v: SpeechSynthesisVoice) => boolean)[] = [
    (v) => /natural/i.test(v.name),
    (v) => /premium|enhanced|neural/i.test(v.name),
    (v) => /google\s+(us|uk)\s+english/i.test(v.name),
    (v) => /samantha|ava|allison|aria|jenny|guy|karen|daniel|serena/i.test(v.name),
    (v) => /^en[-_]us/i.test(v.lang) && v.default,
    (v) => /^en[-_]us/i.test(v.lang),
  ];
  for (const test of ranks) {
    const hit = voices.find(test);
    if (hit) return hit;
  }
  return voices[0];
}

export function ReadAloudButton({ pages, docKey }: { pages: string[]; docKey: string | number }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [page, setPage] = useState(0);
  const [starting, setStarting] = useState(false);
  const runId = useRef(0);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    // Some browsers only populate the voice list after this event fires once.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const warm = () => {};
      window.speechSynthesis.addEventListener?.("voiceschanged", warm);
      window.speechSynthesis.getVoices();
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", warm);
    }
  }, []);

  const stop = useCallback(() => {
    runId.current++;
    try { window.speechSynthesis.cancel(); } catch { /* not supported */ }
    setSpeaking(false);
    setStarting(false);
    setPage(0);
  }, []);

  // Switching exhibits (or leaving the page) stops the reading.
  useEffect(() => () => stop(), [docKey, stop]);

  function start() {
    const chunks = chunksFromPages(pages);
    if (!chunks.length) return;
    const my = ++runId.current;
    setStarting(true);
    // getVoices can be empty on the very first call; a tiny retry loop covers it.
    let tries = 0;
    const begin = () => {
      if (runId.current !== my) return;
      const voice = pickVoice();
      if (!voice && tries++ < 5) { setTimeout(begin, 120); return; }
      setStarting(false);
      setSpeaking(true);
      const speakAt = (i: number) => {
        if (runId.current !== my) return;
        if (i >= chunks.length) { stop(); return; }
        setPage(chunks[i].page);
        const u = new SpeechSynthesisUtterance(chunks[i].text);
        if (voice) u.voice = voice;
        u.rate = 1;
        u.onend = () => speakAt(i + 1);
        u.onerror = () => { if (runId.current === my) stop(); };
        window.speechSynthesis.speak(u);
      };
      try { window.speechSynthesis.cancel(); } catch { /* fresh start */ }
      speakAt(0);
    };
    begin();
  }

  if (!supported) return null;
  const hasText = pages.some((p) => (p ?? "").trim());
  return (
    <button
      onClick={() => (speaking || starting ? stop() : start())}
      disabled={!hasText}
      title={!hasText ? "This PDF has no text layer to read (it may be scanned images)." : speaking ? `Reading page ${page} — click to stop` : "Read this exhibit aloud"}
      className={`inline-flex items-center gap-1 rounded-md border p-1.5 text-xs transition-colors disabled:opacity-40 ${speaking || starting ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"}`}
    >
      {starting ? <Loader2 size={15} className="animate-spin" /> : speaking ? <Square size={15} /> : <Volume2 size={15} />}
      {speaking && page > 0 && <span className="tabular-nums">p. {page}</span>}
    </button>
  );
}
