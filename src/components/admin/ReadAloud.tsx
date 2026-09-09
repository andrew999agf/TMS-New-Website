"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Square, Volume2 } from "lucide-react";

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
 *
 * Controls: click reads / stops. Double-click (computer) or press-and-hold
 * (tablet / phone) opens a small speed picker; a change mid-read resumes
 * from the same spot at the new speed, and the choice is remembered.
 */

type Chunk = { text: string; page: number };

const RATE_KEY = "tms-readaloud-rate";
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const rateLabel = (r: number) => `${r}×`;

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

/** Only one reader speaks at a time — starting any button silences the rest. */
let globalRun = 0;

export function ReadAloudButton({ pages, loadPages, docKey, compact = false }: {
  /** Page text, when the caller already has it (the reader view). */
  pages?: string[];
  /** Lazy loader for list rows / grid cards — fetched once on first play. */
  loadPages?: () => Promise<string[]>;
  docKey: string | number;
  /** Borderless small variant that sits with the row/card icon buttons. */
  compact?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [page, setPage] = useState(0);
  const [starting, setStarting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rate, setRate] = useState(1);
  const [noText, setNoText] = useState(false);
  const loadedRef = useRef<{ key: string | number; pages: string[] } | null>(null);
  const runId = useRef(0);
  const rateRef = useRef(1);
  const chunksRef = useRef<Chunk[]>([]);
  const posRef = useRef(0);
  const clickTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdFired = useRef(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    try {
      const saved = Number(localStorage.getItem(RATE_KEY));
      if (RATES.includes(saved as (typeof RATES)[number])) { setRate(saved); rateRef.current = saved; }
    } catch { /* per-viewer convenience only */ }
    // Some browsers only populate the voice list after this event fires once.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const warm = () => {};
      window.speechSynthesis.addEventListener?.("voiceschanged", warm);
      window.speechSynthesis.getVoices();
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", warm);
    }
  }, []);

  // Close the speed menu on any outside press.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); };
  }, [menuOpen]);

  const stop = useCallback(() => {
    runId.current++;
    try { window.speechSynthesis.cancel(); } catch { /* not supported */ }
    setSpeaking(false);
    setStarting(false);
    setPage(0);
    posRef.current = 0;
  }, []);

  // Switching exhibits (or leaving the page) stops the reading.
  useEffect(() => () => stop(), [docKey, stop]);

  const start = useCallback(async (fromChunk = 0) => {
    const my = ++runId.current;
    const g = ++globalRun;
    setStarting(true);
    // Resolve the text: given directly, cached from a prior play, or lazily
    // fetched (list rows / grid cards) the first time.
    let source = pages;
    if (!source) {
      if (loadedRef.current?.key === docKey) source = loadedRef.current.pages;
      else if (loadPages) {
        try { source = await loadPages(); } catch { source = []; }
        loadedRef.current = { key: docKey, pages: source ?? [] };
      }
    }
    if (runId.current !== my || g !== globalRun) return;
    const chunks = fromChunk > 0 && chunksRef.current.length ? chunksRef.current : chunksFromPages(source ?? []);
    chunksRef.current = chunks;
    if (!chunks.length) { setNoText(true); setStarting(false); return; }
    // getVoices can be empty on the very first call; a tiny retry loop covers it.
    let tries = 0;
    const begin = () => {
      if (runId.current !== my || g !== globalRun) return;
      const voice = pickVoice();
      if (!voice && tries++ < 5) { setTimeout(begin, 120); return; }
      setStarting(false);
      setSpeaking(true);
      const speakAt = (i: number) => {
        // A different button (or a newer run of this one) took over — go quiet.
        if (runId.current !== my) return;
        if (g !== globalRun) { stop(); return; }
        if (i >= chunks.length) { stop(); return; }
        posRef.current = i;
        setPage(chunks[i].page);
        const u = new SpeechSynthesisUtterance(chunks[i].text);
        if (voice) u.voice = voice;
        u.rate = rateRef.current;
        u.onend = () => speakAt(i + 1);
        u.onerror = () => { if (runId.current === my) stop(); };
        window.speechSynthesis.speak(u);
      };
      try { window.speechSynthesis.cancel(); } catch { /* fresh start */ }
      speakAt(fromChunk);
    };
    begin();
  }, [pages, loadPages, docKey, stop]);

  function chooseRate(r: number) {
    setRate(r);
    rateRef.current = r;
    try { localStorage.setItem(RATE_KEY, String(r)); } catch { /* fine */ }
    setMenuOpen(false);
    // Mid-read: pick back up at the current chunk at the new speed.
    if (speaking) {
      const at = posRef.current;
      try { window.speechSynthesis.cancel(); } catch { /* restart below */ }
      start(at);
    }
  }

  const toggle = () => (speaking || starting ? stop() : start(0));

  // Click vs double-click: hold the single click briefly so a double-click
  // opens the speed menu instead of toggling twice.
  function onClick() {
    if (holdFired.current) { holdFired.current = false; return; } // long-press already handled
    if (clickTimer.current != null) return;
    clickTimer.current = window.setTimeout(() => { clickTimer.current = null; toggle(); }, 260);
  }
  function onDoubleClick() {
    if (clickTimer.current != null) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
    setMenuOpen((v) => !v);
  }
  // Press-and-hold on touch opens the speed menu.
  function onTouchStart() {
    holdFired.current = false;
    holdTimer.current = window.setTimeout(() => { holdFired.current = true; setMenuOpen(true); }, 450);
  }
  function onTouchEndOrMove() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  }

  if (!supported) return null;
  // With the text in hand we know up front; lazy mode assumes yes until a
  // fetch comes back empty.
  const hasText = pages ? pages.some((p) => (p ?? "").trim()) : !noText;
  const iconSize = compact ? 13 : 15;
  const btnCls = compact
    ? `inline-flex select-none items-center gap-1 rounded p-1.5 text-[10px] transition-colors disabled:opacity-40 ${speaking || starting ? "bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-accent)]"}`
    : `inline-flex select-none items-center gap-1 rounded-md border p-1.5 text-xs transition-colors disabled:opacity-40 ${speaking || starting ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"}`;
  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEndOrMove}
        onTouchMove={onTouchEndOrMove}
        onTouchCancel={onTouchEndOrMove}
        onContextMenu={(e) => { if (holdFired.current) e.preventDefault(); }}
        disabled={!hasText}
        title={!hasText ? "This PDF has no text layer to read (it may be scanned images)." : speaking ? `Reading page ${page} at ${rateLabel(rate)} — click to stop` : `Read this exhibit aloud (${rateLabel(rate)}). Double-click — or press and hold on a tablet/phone — for speed.`}
        className={btnCls}
        style={{ WebkitTouchCallout: "none" }}
      >
        {starting ? <Loader2 size={iconSize} className="animate-spin" /> : speaking ? <Square size={iconSize} /> : <Volume2 size={iconSize} />}
        {speaking && page > 0 && <span className="tabular-nums">p. {page}</span>}
        {rate !== 1 && !speaking && <span className="text-[10px] font-semibold">{rateLabel(rate)}</span>}
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Reading speed</p>
          {RATES.map((r) => (
            <button
              key={r}
              onClick={(e) => { e.stopPropagation(); chooseRate(r); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--c-accent)]/10"
            >
              <span className="w-9 font-semibold tabular-nums">{rateLabel(r)}</span>
              <span className="flex-1 text-[var(--c-ink-muted)]">{r === 1 ? "Normal" : r < 1 ? "Slower" : r <= 1.5 ? "Faster" : "Fastest"}</span>
              {rate === r && <Check size={12} className="text-[var(--c-accent)]" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
