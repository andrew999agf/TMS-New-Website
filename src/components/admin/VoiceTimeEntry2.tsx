"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { Mic, X, Loader2, Check, Volume2, VolumeX, Info, Settings, Play } from "lucide-react";
import type { TimeEntryInput } from "@/app/admin/(panel)/time-tracker/actions";

/**
 * Voice time entry — 2.0 engine. Same flow as the original (three short spoken
 * parts, green/red buttons, an editable review, an "another entry" loop), but:
 *   • it speaks with the most natural voice the device offers (not the robotic
 *     default), a touch faster, so it sounds less annoying;
 *   • it says far fewer words — terse prompts and read-backs — so entry is fast;
 *   • a light legal-vocabulary cleanup fixes common mishearings in the note.
 * Built on the browser's speech recognition + synthesis (no server/API), with
 * the same matter/rate/date parsing the firm relies on.
 */

const fix = (n: number, d = 1) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
const getUserRole = (u: string) => (u.includes("Attorney") ? "Attorney" : "Legal Assistant");
const createDesc = (cat: string, notes: string, user: string) => `${cat} - ${user.split(" (")[0]} (${getUserRole(user)}) - ${notes}`;
const todayISO = () => new Date().toISOString().split("T")[0];
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

type Matter = { displayNumber: string; description: string };
type Slots = { matter?: string; rate?: number; hours?: number; category?: string; notes?: string; nonBillable?: boolean; date?: string };

/** Conservative fixes for words the browser commonly mishears in a legal note. */
const NOTE_FIXES: [RegExp, string][] = [
  [/\b(?:vore?|war|where)\s+(?:deer|dear|dire)\b/gi, "voir dire"],
  [/\bsub\s?peen[ao]\b/gi, "subpoena"],
  [/\bday\s?position\b/gi, "deposition"],
  [/\bvolndeer\b/gi, "voir dire"],
  [/\bdiscoveryphase\b/gi, "discovery"],
];
function applyNoteFixes(s: string): string {
  let out = s;
  for (const [re, to] of NOTE_FIXES) out = out.replace(re, to);
  return out;
}

export function VoiceTimeEntry2({
  matters, categories, activityUsers, defaultUser, onAdd,
}: {
  matters: Matter[];
  categories: string[];
  activityUsers: { name: string; rate: number }[];
  defaultUser: string;
  onAdd: (input: TimeEntryInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [slots, setSlots] = useState<Slots>({});
  const [saved, setSaved] = useState(false);
  const [candidates, setCandidates] = useState<Matter[]>([]);
  const [openDesc, setOpenDesc] = useState<string | null>(null);
  const pickedRef = useRef<string | null>(null);
  const cancelRef = useRef(false);
  const recRef = useRef<any>(null);
  const runningRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const muteRef = useRef(false);
  const [verifying, setVerifying] = useState(false);
  const decisionRef = useRef<((d: "next" | "redo") => void) | null>(null);
  const [labels, setLabels] = useState<{ yes: string; no: string }>({ yes: "Correct", no: "Incorrect" });
  // Voice + speed are user-pickable and remembered (device's own free voices).
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(1.06);
  const rateRef = useRef(1.06);
  const [showSettings, setShowSettings] = useState(false);
  const [micError, setMicError] = useState(false);

  const defaultRate = activityUsers.find((u) => u.name === defaultUser)?.rate ?? 145;
  const descOf = (displayNumber?: string) => matters.find((m) => m.displayNumber === displayNumber)?.description ?? "";

  const supported = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && Boolean(window.speechSynthesis);

  useEffect(() => {
    const onHide = () => { if (document.hidden) { setMuted(false); muteRef.current = false; } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Build the list of English voices and choose one: the user's saved pick if
  // any, otherwise the nicest available (Natural/Neural/Google/Siri beat the
  // robotic default). getVoices() is often empty until the list loads, so we
  // also listen for "voiceschanged".
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const best = (pool: SpeechSynthesisVoice[]) => {
      const prefers = [/natural/i, /neural/i, /google us english/i, /\baria\b/i, /\bjenny\b/i, /\bava\b/i, /\bguy\b/i, /samantha/i, /siri/i, /premium/i, /enhanced/i, /\bzira\b/i, /google/i];
      for (const re of prefers) { const v = pool.find((x) => re.test(x.name)); if (v) return v; }
      return pool.find((v) => v.localService) ?? pool[0] ?? null;
    };
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      if (!all.length) return;
      const en = all.filter((v) => /^en\b|^en[-_]/i.test(v.lang));
      const pool = en.length ? en : all;
      setVoices(pool);
      const saved = localStorage.getItem("tms_tt2_voice");
      const chosen = (saved && pool.find((v) => v.name === saved)) || best(pool);
      voiceRef.current = chosen ?? null;
      setVoiceName(chosen?.name ?? "");
    };
    load();
    const savedRate = parseFloat(localStorage.getItem("tms_tt2_rate") || "");
    if (!Number.isNaN(savedRate)) { setRate(savedRate); rateRef.current = savedRate; }
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  function chooseVoice(name: string) {
    const v = voices.find((x) => x.name === name) ?? null;
    voiceRef.current = v; setVoiceName(name);
    try { localStorage.setItem("tms_tt2_voice", name); } catch { /* ignore */ }
  }
  function chooseRate(r: number) {
    setRate(r); rateRef.current = r;
    try { localStorage.setItem("tms_tt2_rate", String(r)); } catch { /* ignore */ }
  }
  function previewVoice() {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Case and rate? Two hours, research, today.");
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = rateRef.current; u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  function speak(text: string): Promise<void> {
    setStatus(text);
    if (muteRef.current) return Promise.resolve();
    return new Promise((res) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = rateRef.current; u.pitch = 1.0;
        u.onend = () => res();
        u.onerror = () => res();
        window.speechSynthesis.speak(u);
      } catch { res(); }
    });
  }

  // Listen for a single utterance, showing the words live as they're spoken.
  function listen(): Promise<string> {
    return new Promise((res) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return res("");
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
      let done = false; let finalText = "";
      const finish = (t: string) => { if (done) return; done = true; setListening(false); setHeard(t.trim()); setInterim(""); res(t.trim()); };
      setListening(true); setHeard(""); setInterim("");
      rec.onresult = (e: any) => {
        let live = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else live += r[0].transcript;
        }
        setInterim((finalText + live).trim());
      };
      rec.onerror = (e: any) => {
        // Permission problems are the usual "nothing happens on desktop" cause —
        // surface them clearly instead of silently looping.
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          cancelRef.current = true;
          setMicError(true);
          setStatus("Chrome wouldn't start the microphone. Click the microphone icon at the right end of the address bar, choose Allow, then tap “Enable microphone & retry”.");
        }
        finish(finalText);
      };
      rec.onend = () => finish(finalText);
      try { rec.start(); } catch { setListening(false); res(""); }
    });
  }

  /** Listen for the user's actual answer; mic opens the instant the question
   *  starts (caller fires speak without awaiting). Words from her own prompt are
   *  stripped so speaker bleed isn't mistaken for the answer. */
  async function listenForAnswer(prompt: string, tries = 2): Promise<string> {
    const ignore = new Set(prompt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    for (let i = 0; i < tries && !cancelRef.current; i++) {
      if (i > 0) await wait(150); // let the previous recognition fully release
      const raw = (await listen()).trim();
      if (cancelRef.current) return "";
      if (!raw) continue;
      const cleaned = raw
        .split(/\s+/)
        .filter((w) => { const k = w.toLowerCase().replace(/[^a-z0-9]/g, ""); return k && !ignore.has(k); })
        .join(" ")
        .trim();
      if (cleaned) return cleaned;
    }
    return "";
  }

  async function ask<T>(prompt: string, parse: (s: string) => T, required = true): Promise<T | undefined> {
    if (cancelRef.current) return undefined;
    await speak(prompt);
    if (cancelRef.current) return undefined;
    let v = parse(await listen());
    if (required && (v === undefined || v === null || v === ("" as unknown))) {
      if (cancelRef.current) return undefined;
      await speak("Again?");
      if (cancelRef.current) return undefined;
      v = parse(await listen());
    }
    return v;
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      muteRef.current = next;
      if (next) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
      return next;
    });
  }

  function press(next: boolean) {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    decisionRef.current?.(next ? "next" : "redo");
  }

  function askDecision(
    speakText: string,
    opts: { yes: string; no: string; isAffirmative?: (s: string) => boolean; isNegative?: (s: string) => boolean } = { yes: "Correct", no: "Incorrect" },
  ): Promise<boolean> {
    if (cancelRef.current) return Promise.resolve(true);
    const yesFn = opts.isAffirmative ?? isYes;
    const noFn = opts.isNegative ?? isNo;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        decisionRef.current = null;
        try { recRef.current?.abort?.(); } catch { /* ignore */ }
        resolve(ok);
      };
      decisionRef.current = (d) => finish(d === "next");
      setLabels({ yes: opts.yes, no: opts.no });
      setVerifying(true);
      (async () => {
        // Let her finish, THEN open the mic — listening while she talks makes
        // desktop speakers feed her voice back in and loop. (Muted = instant.)
        await speak(speakText);
        if (settled || cancelRef.current) return;
        for (let i = 0; i < 6 && !settled && !cancelRef.current; i++) {
          const ans = await listenForAnswer(speakText, 1);
          if (settled || cancelRef.current) return;
          if (noFn(ans)) { finish(false); return; }
          if (yesFn(ans)) { finish(true); return; }
        }
      })();
    });
  }

  /** Read a part back (concisely) and wait for Correct or Incorrect. */
  function confirmPart(desc: string): Promise<boolean> {
    return askDecision(desc, { yes: "Correct", no: "Incorrect" });
  }

  async function runPart(
    prompt: string,
    capture: (text: string) => void | Promise<void>,
    clearPart: () => void,
    readback: () => string,
    set: () => void,
  ): Promise<void> {
    for (;;) {
      if (cancelRef.current) return;
      setLabels({ yes: "Correct", no: "Incorrect" });
      setVerifying(true);
      const outcome = await new Promise<"next" | "redo" | "heard">((resolve) => {
        let settled = false;
        decisionRef.current = (d) => { if (settled) return; settled = true; decisionRef.current = null; resolve(d); };
        (async () => {
          // Speak the question fully, then open the mic. (When muted, speak
          // returns instantly, so listening starts right away.) This is what
          // makes it reliable on desktop Chrome, not just iPhone.
          await speak(prompt);
          if (settled || cancelRef.current) return;
          const text = await listenForAnswer(prompt, 3);
          if (settled || cancelRef.current) return;
          await capture(text);
          set();
          if (settled) return;
          settled = true; decisionRef.current = null; resolve("heard");
        })();
      });
      if (cancelRef.current) return;
      if (outcome === "redo") { clearPart(); set(); continue; }
      if (outcome === "next") { setVerifying(false); return; }
      if (await confirmPart(readback())) { setVerifying(false); return; }
      clearPart(); set();
    }
  }

  /* ---- parsers (same logic the firm relies on) ---- */
  function parseHours(s: string): number | undefined {
    const t = s.toLowerCase();
    const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const digit = (w: string): number | null => {
      const map: Record<string, number> = { zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
      if (w in map) return map[w];
      if (/^\d$/.test(w)) return parseInt(w);
      return null;
    };
    const round1 = (n: number) => Math.round(n * 10) / 10;
    let m: RegExpMatchArray | null;
    if (/\bhour(?:s)?\s+and\s+(?:a\s+)?half\b/.test(t)) return 1.5;
    if ((m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine)\b\s*and\s+(?:a\s+)?half/))) return (W[m[1]] ?? parseInt(m[1])) + 0.5;
    if ((m = t.match(/\b(\d+)\s*\/\s*10\b/))) return round1(parseInt(m[1]) / 10);
    if ((m = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+tenths?\b/))) return round1((W[m[1]] ?? parseInt(m[1])) / 10);
    if (/\btenth\b/.test(t)) return 0.1;
    if ((m = t.match(/\bpoint\s+(\w+)(?:\s+(\w+))?/))) {
      const d1 = digit(m[1]);
      if (d1 != null) { const d2 = m[2] ? digit(m[2]) : null; return d2 != null ? Math.round((d1 * 10 + d2)) / 100 : round1(d1 / 10); }
    }
    if ((m = t.match(/(\d*\.\d+)/))) return parseFloat(m[1]);
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/))) return parseFloat(m[1]);
    if ((m = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s*hours?\b/))) return W[m[1]];
    if ((m = t.match(/(\d+)\s*(?:minutes?|mins?)\b/))) return round1(parseInt(m[1]) / 60);
    if (/\bhalf\b/.test(t)) return 0.5;
    if (/\bquarter\b/.test(t)) return 0.25;
    if (/\b(?:an|one)\s+hour\b/.test(t)) return 1;
    if ((m = t.match(/^\s*(\d*\.?\d+)\s*$/))) return parseFloat(m[1]);
    return undefined;
  }
  function parseRate(s: string): number | undefined {
    const t = s.toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/))) return parseFloat(m[1]);
    if ((m = t.match(/\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|per hour|an hour|\/\s*hour|\/\s*hr|hourly)\b/))) return parseFloat(m[1]);
    if ((m = t.match(/\b(?:rate|charge|bill(?:ed)?)\b\s+(?:of\s+|is\s+|at\s+)?\$?\s*(\d{1,4}(?:\.\d{1,2})?)/))) return parseFloat(m[1]);
    return undefined;
  }
  function parseBareRate(s: string): { value: number; raw: string } | undefined {
    const matches = [...s.matchAll(/\b(\d{2,4})(?:\.(\d{1,2}))?\b/g)];
    for (let i = matches.length - 1; i >= 0; i--) {
      const mm = matches[i];
      const v = parseFloat(mm[2] ? `${mm[1]}.${mm[2]}` : mm[1]);
      if (v >= 50 && v <= 1500) return { value: v, raw: mm[0] };
    }
    return undefined;
  }
  function stripRate(s: string): string {
    return s
      .replace(/\$\s*\d{1,4}(?:\.\d{1,2})?/g, " ")
      .replace(/\b\d{1,4}(?:\.\d{1,2})?\s*(?:dollars?|bucks?|per hour|an hour|\/\s*hour|\/\s*hr|hourly)\b/gi, " ")
      .replace(/\b(?:rate|charge|bill(?:ed)?)\b\s+(?:of\s+|is\s+|at\s+)?\$?\s*\d{1,4}(?:\.\d{1,2})?/gi, " ");
  }
  function matchCategory(s: string, strict: boolean): string | undefined {
    const t = s.toLowerCase();
    let best: string | null = null, len = 0;
    for (const c of categories) { const cl = c.toLowerCase(); if (t.includes(cl) && cl.length > len) { best = c; len = cl.length; } }
    if (best) return best;
    for (const c of categories) { const w = c.toLowerCase().split(/[\s(]/)[0]; if (w.length > 2 && t.includes(w)) return c; }
    return strict ? undefined : (s.trim() ? s.trim().toUpperCase() : undefined);
  }
  const isYes = (s: string) => /\b(yes|yeah|yep|yup|good|ok|okay|correct|right|sure|perfect|confirm|that's right|looks good)\b/i.test(s);
  const isNo = (s: string) => /\b(no|nope|nah|negative|wrong|not it|incorrect)\b/i.test(s);

  const STOP = new Set(["the", "and", "for", "matter", "client", "case", "file", "our"]);
  const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w));
  const mToks = (m: Matter) => `${m.displayNumber} ${m.description}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 || /^\d$/.test(w));
  function lev(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function tokenMatch(st: string, mt: string): boolean {
    if (/^\d+$/.test(mt)) return /^\d+$/.test(st) && mt.replace(/^0+/, "") === st.replace(/^0+/, "");
    if (mt.includes(st) || st.includes(mt)) return true;
    if (st.length >= 4 && mt.length >= 4) return lev(st, mt) <= Math.floor(Math.max(st.length, mt.length) / 4);
    return false;
  }
  type Ranked = Matter & { score: number; coversAll: boolean };
  function rankMatters(spoken: string): Ranked[] {
    const st = toks(spoken);
    if (!st.length) return [];
    return matters
      .map((m) => { const mt = mToks(m); const hits = st.filter((t) => mt.some((w) => tokenMatch(t, w))); return { ...m, score: hits.length, coversAll: hits.length === st.length }; })
      .filter((x) => x.score > 0)
      .sort((a, b) => Number(b.coversAll) - Number(a.coversAll) || b.score - a.score)
      .slice(0, 5);
  }
  function confidentMatter(spoken: string): string | undefined {
    const covering = rankMatters(spoken).filter((r) => r.coversAll);
    return covering.length === 1 ? covering[0].displayNumber : undefined;
  }
  function tapCandidate(displayNumber: string) {
    pickedRef.current = displayNumber;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
  async function resolveMatter(spoken: string, attempt = 1): Promise<string | undefined> {
    if (cancelRef.current) return undefined;
    const ranked = rankMatters(spoken);
    if (ranked.length === 0) {
      if (attempt >= 3) return spoken.trim() || undefined;
      const again = await ask("No match. Say the client or matter again.", (x) => x.trim(), true);
      return resolveMatter(again ?? "", attempt + 1);
    }
    const covering = ranked.filter((r) => r.coversAll);
    if (covering.length === 1) return covering[0].displayNumber;
    const cands: Matter[] = [...covering, ...ranked.filter((r) => !r.coversAll)].slice(0, 5).map((r) => ({ displayNumber: r.displayNumber, description: r.description }));
    pickedRef.current = null;
    setCandidates(cands);
    setOpenDesc(null);
    await speak(cands.length === 1 ? "One match." : "A few matches.");
    for (const c of cands) {
      if (cancelRef.current) { setCandidates([]); return undefined; }
      if (pickedRef.current) break;
      await speak(`${c.displayNumber}?`);
      if (pickedRef.current || cancelRef.current) break;
      const ans = await listen();
      if (pickedRef.current || cancelRef.current) break;
      if (isYes(ans)) { setCandidates([]); return c.displayNumber; }
      if (!isNo(ans) && ans.trim() && !/\bnext\b/i.test(ans)) { setCandidates([]); return resolveMatter(ans, attempt + 1); }
    }
    setCandidates([]);
    if (pickedRef.current) { const m = pickedRef.current; pickedRef.current = null; return m; }
    if (cancelRef.current) return undefined;
    if (attempt >= 3) return spoken.trim() || undefined;
    const again = await ask("Say the client or matter again.", (x) => x.trim(), true);
    return resolveMatter(again ?? "", attempt + 1);
  }

  /* ---- date ---- */
  function stripTime(s: string): string {
    return (" " + s + " ")
      .replace(/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\b/gi, " ")
      .replace(/\b\d+\s*\/\s*10\b/gi, " ")
      .replace(/\bpoint\s+\w+(?:\s+\w+)?\b/gi, " ");
  }
  function parseDate(s: string): string | undefined {
    const t = s.toLowerCase();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (/\b(today|this morning|this afternoon|tonight|now)\b/.test(t)) return fmt(new Date());
    if (/\byesterday\b/.test(t)) { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d); }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/\b(\d+)\s+days?\s+ago\b/))) { const d = new Date(); d.setDate(d.getDate() - parseInt(m[1])); return fmt(d); }
    const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    for (const name in days) {
      if (new RegExp(`\\b${name}\\b`).test(t)) { const d = new Date(); let diff = (d.getDay() - days[name] + 7) % 7; if (diff === 0) diff = 7; d.setDate(d.getDate() - diff); return fmt(d); }
    }
    const mo: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const monRe = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
    if ((m = t.match(new RegExp(`\\b(${monRe})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`)))) {
      const month = mo[m[1].slice(0, 3)]; const day = parseInt(m[2]); const yr = m[3] ? parseInt(m[3]) : new Date().getFullYear();
      if (month != null) return fmt(new Date(yr, month, day));
    }
    if ((m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${monRe})`)))) {
      const day = parseInt(m[1]); const month = mo[m[2].slice(0, 3)]; if (month != null) return fmt(new Date(new Date().getFullYear(), month, day));
    }
    if ((m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/))) {
      const month = parseInt(m[1]) - 1; const day = parseInt(m[2]); let yr = m[3] ? parseInt(m[3]) : new Date().getFullYear(); if (yr < 100) yr += 2000;
      return fmt(new Date(yr, month, day));
    }
    return undefined;
  }
  function dateLabel(d?: string): string {
    if (!d || d === todayISO()) return "today";
    if (d === yesterdayISO()) return "yesterday";
    const [y, m, day] = d.split("-");
    return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`;
  }

  async function captureFlow(initial: Slots, skipCase: boolean): Promise<void> {
    if (runningRef.current) return;
    runningRef.current = true; cancelRef.current = false;
    setOpen(true); setSaved(false); setCandidates([]); setHeard(""); setInterim("");
    const s: Slots = { ...initial };
    setSlots({ ...s });
    const set = () => setSlots({ ...s });
    try {
      if (!skipCase) {
        await runPart(
          "Case and rate?",
          async (text) => {
            let work = text;
            const r0 = parseRate(text);
            if (r0 != null) { s.rate = r0; work = stripRate(text); }
            else { const b = parseBareRate(text); if (b) { s.rate = b.value; work = text.replace(b.raw, " "); } }
            const matterText = stripRate(work).trim();
            const conf = confidentMatter(matterText);
            s.matter = conf ?? (await resolveMatter(matterText || text));
          },
          () => { s.matter = undefined; s.rate = defaultRate; },
          () => `${s.matter || "no case"}, ${s.rate ?? defaultRate} dollars.`,
          set,
        );
        if (cancelRef.current) return;
      }

      await runPart(
        "Date, time, and category?",
        (text) => {
          const h = parseHours(text); if (h != null) s.hours = h;
          const cat = matchCategory(text, true); if (cat) s.category = cat;
          const d = parseDate(stripTime(text)); if (d) s.date = d;
          if (/non[- ]?billable|no charge|not billable/i.test(text)) s.nonBillable = true;
        },
        () => { s.hours = undefined; s.category = undefined; s.date = todayISO(); },
        () => `${s.hours ?? 0} ${s.hours === 1 ? "hour" : "hours"}, ${s.category || "no category"}, ${dateLabel(s.date)}.`,
        set,
      );
      if (cancelRef.current) return;

      await runPart(
        "Note?",
        (text) => {
          const skip = !text.trim() || /^(?:no|none|skip|nope|nothing|that's all|no notes?)\.?$/i.test(text.trim());
          s.notes = skip ? "" : applyNoteFixes(text.trim());
        },
        () => { s.notes = undefined; },
        () => (s.notes ? `Note: ${s.notes}.` : "No note."),
        set,
      );
      if (cancelRef.current) return;

      // Final decision point — finish entirely by voice. "Save" (green / "yes")
      // commits it; "Edit" (red / "no") hands back to the form for tweaks. Both
      // are also tappable.
      const ok = await askDecision("Save?", { yes: "Save", no: "Edit", isAffirmative: isYes, isNegative: isNo });
      if (cancelRef.current) return;
      if (!ok) { setVerifying(false); setStatus("Edit any field, then tap Save."); return; }
      await commit(s);
    } finally {
      runningRef.current = false; setListening(false); setVerifying(false);
    }
  }

  /** Persist an entry, then offer (by voice or tap) to make another. */
  async function commit(s: Slots): Promise<void> {
    const user = defaultUser;
    const rate = s.rate ?? defaultRate;
    const hoursR = fix(Math.ceil((s.hours || 0) * 10) / 10, 1);
    const note = s.notes ? createDesc(s.category || "", s.notes, user) : `${s.category || ""} - ${user.split(" (")[0]} (${getUserRole(user)})`;
    onAdd({
      matter: (s.matter || "").trim(), entryDate: s.date || todayISO(), activityDescription: "", note,
      price: fix(rate, 2), quantity: hoursR, activityUserName: user, nonBillable: !!s.nonBillable,
    });
    const savedMatter = (s.matter || "").trim();
    const savedRate = rate;
    setSaved(true);
    if (!supported) return;
    await speak("Saved.");
    if (cancelRef.current) return;
    const again = await askDecision("Another entry?", { yes: "Yes", no: "No, done", isAffirmative: isYes, isNegative: isNo });
    if (cancelRef.current) return;
    if (!again) { setVerifying(false); setStatus("All set."); return; }
    const sameCase = await askDecision("Same case?", {
      yes: "Same case", no: "Another case",
      isAffirmative: (x) => /\b(same|this|that|keep|yes|yeah|yep|yup)\b/i.test(x),
      isNegative: (x) => /\b(another|different|new|other|no|nope|nah)\b/i.test(x),
    });
    if (cancelRef.current) return;
    setVerifying(false);
    runningRef.current = false; // captureFlow guards on this
    if (sameCase) await captureFlow({ date: todayISO(), nonBillable: false, matter: savedMatter, rate: savedRate }, true);
    else await captureFlow({ date: todayISO(), nonBillable: false, rate: defaultRate }, false);
  }

  /** Ask the browser for microphone access *in the click gesture*. Chrome only
   *  shows its Allow prompt (and remembers the grant) when the request happens
   *  in a user gesture — our recognition starts after the voice talks, which is
   *  too late, so we prime it here. Returns true if the mic is usable. */
  async function ensureMic(): Promise<boolean> {
    setMicError(false);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // we only needed the grant
      return true;
    } catch {
      setOpen(true);
      setMicError(true);
      setStatus("Microphone access is needed. Click Allow when Chrome asks — or click the microphone icon at the right end of the address bar, choose Allow, then tap the mic again.");
      return false;
    }
  }

  async function run() {
    if (runningRef.current) return;
    if (!supported) { alert("Voice input isn't supported in this browser. Try Chrome or Edge on a computer."); return; }
    if (!(await ensureMic())) return;
    captureFlow({ date: todayISO(), nonBillable: false, rate: defaultRate }, false);
  }

  /** Tap path for Save — same persistence + "another entry?" loop as voice. */
  async function saveReview() {
    if (!slots.matter || !slots.matter.trim()) { setStatus("Please choose a case before saving."); return; }
    if (runningRef.current) return; // a voice step is mid-run; its own Save covers it
    runningRef.current = true; cancelRef.current = false;
    try { await commit({ ...slots }); } finally { runningRef.current = false; }
  }

  function cancel() {
    cancelRef.current = true;
    pickedRef.current = null;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    decisionRef.current?.("next");
    setVerifying(false);
    runningRef.current = false; setListening(false); setOpen(false);
    setCandidates([]); setInterim("");
  }

  const upd = (patch: Partial<Slots>) => setSlots((p) => ({ ...p, ...patch }));
  const fieldClass = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] rounded-md px-2.5 py-1.5 text-sm focus:border-[var(--c-accent)] outline-none";
  const labelClass = "block text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)] mb-1";

  return (
    <>
      <button
        onClick={run}
        title="Add a time entry by voice"
        aria-label="Add a time entry by voice"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-[var(--c-accent)] text-[var(--c-on-accent)] shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <Mic size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
          <div className="bg-[var(--c-surface)] rounded-lg w-full max-w-md p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-[family-name:var(--font-display)] text-lg flex items-center gap-2"><Mic size={18} className="text-[var(--c-accent)]" /> Voice entry <span className="text-[10px] font-semibold text-[var(--c-accent)] border border-[var(--c-accent)] rounded px-1 py-0.5">2.0</span></h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  aria-label="Voice settings"
                  title="Choose the voice and speed"
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                    showSettings ? "border-[var(--c-accent)] text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-ink)]"
                  }`}
                >
                  <Settings size={14} />
                </button>
                <button
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute the voice" : "Mute the voice"}
                  title={muted ? "Voice is muted — tap to turn it back on" : "Mute the spoken voice for now"}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                    muted
                      ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]"
                      : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-ink)]"
                  }`}
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  {muted ? "Muted" : "Mute"}
                </button>
                <button onClick={cancel} aria-label="Close"><X size={18} className="text-[var(--c-ink-muted)]" /></button>
              </div>
            </div>

            {showSettings && (
              <div className="mb-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3 space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)] mb-1">Voice</label>
                  <div className="flex gap-2">
                    <select value={voiceName} onChange={(e) => chooseVoice(e.target.value)} className="flex-1 border border-[var(--c-border)] bg-[var(--c-surface)] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]">
                      {voices.length === 0 && <option value="">Default voice</option>}
                      {voices.map((v) => <option key={v.name} value={v.name}>{v.name}{v.localService ? "" : " (online)"}</option>)}
                    </select>
                    <button onClick={previewVoice} title="Hear a sample" className="flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:border-[var(--c-accent)]"><Play size={13} /> Test</button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Tip: on iPhone, pick a Siri voice for the most natural sound.</p>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)] mb-1">Speed — {rate.toFixed(2)}×</label>
                  <input type="range" min="0.8" max="1.4" step="0.02" value={rate} onChange={(e) => chooseRate(parseFloat(e.target.value))} className="w-full accent-[var(--c-accent)]" />
                </div>
              </div>
            )}

            <p className="text-sm min-h-[40px]">{status}</p>
            {micError && (
              <button
                onClick={() => { setMicError(false); run(); }}
                className="mt-1 mb-1 flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] hover:opacity-90 w-full"
              >
                <Mic size={15} /> Enable microphone &amp; retry
              </button>
            )}
            <div className="mt-1 flex items-start gap-2 text-xs text-[var(--c-ink-muted)] min-h-[18px]">
              {listening
                ? <><Loader2 size={14} className="animate-spin mt-0.5 shrink-0" /> <span>{interim ? `“${interim}”` : "Listening…"}</span></>
                : heard ? `“${heard}”` : null}
            </div>

            {candidates.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[var(--c-ink-muted)] mb-1.5">Tap a row to see the case; tap the check to pick it (or say yes when I read it):</p>
                <div className="space-y-1.5">
                  {candidates.map((c) => (
                    <div key={c.displayNumber} className="flex items-stretch rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] overflow-hidden hover:border-[var(--c-accent)]">
                      <button
                        onClick={() => setOpenDesc((o) => (o === c.displayNumber ? null : c.displayNumber))}
                        className="flex-1 text-left px-3 py-2 text-sm hover:bg-[var(--c-surface2)]"
                      >
                        <span className="flex items-center gap-1.5">{c.displayNumber}<Info size={12} className="text-[var(--c-ink-muted)]" /></span>
                        {openDesc === c.displayNumber && (
                          <span className="mt-1 block text-xs text-[var(--c-ink-muted)] leading-relaxed">{c.description || "No description on file for this case."}</span>
                        )}
                      </button>
                      <button
                        onClick={() => tapCandidate(c.displayNumber)}
                        aria-label={`Select ${c.displayNumber}`}
                        title="Use this case"
                        className="w-1/5 min-w-[46px] border-l border-[var(--c-border)] flex items-center justify-center text-[var(--c-ink-muted)] hover:bg-[var(--c-success)] hover:text-white"
                      >
                        <Check size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verifying && candidates.length === 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => press(true)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-success)] px-4 py-3 text-base font-semibold text-white hover:opacity-90"
                >
                  <Check size={18} /> {labels.yes}
                </button>
                <button
                  onClick={() => press(false)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-error)] px-4 py-3 text-base font-semibold text-white hover:opacity-90"
                >
                  <X size={18} /> {labels.no}
                </button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Case / client</label>
                <input list="vte2-matters" value={slots.matter ?? ""} onChange={(e) => upd({ matter: e.target.value })} className={fieldClass} placeholder="Choose a case" />
                <datalist id="vte2-matters">{matters.map((m) => <option key={m.displayNumber} value={m.displayNumber}>{m.description}</option>)}</datalist>
                {descOf(slots.matter) && <p className="mt-1 text-xs text-[var(--c-ink-muted)] leading-relaxed">{descOf(slots.matter)}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Hourly rate</label>
                  <input type="number" step="1" value={slots.rate ?? ""} onChange={(e) => upd({ rate: e.target.value === "" ? undefined : parseFloat(e.target.value) })} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Date</label>
                  <input type="date" value={slots.date ?? todayISO()} onChange={(e) => upd({ date: e.target.value })} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Hours</label>
                  <input type="number" step="0.1" value={slots.hours ?? ""} onChange={(e) => upd({ hours: e.target.value === "" ? undefined : parseFloat(e.target.value) })} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <select value={slots.category ?? ""} onChange={(e) => upd({ category: e.target.value })} className={fieldClass}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Activity note</label>
                <textarea rows={3} value={slots.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })} className={fieldClass} placeholder="What was done" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!slots.nonBillable} onChange={(e) => upd({ nonBillable: e.target.checked })} className="accent-[var(--c-accent)]" />
                Non-billable
              </label>
            </div>

            {saved && <p className="mt-4 text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Added to your board.</p>}
            {!saved && (
              <p className="mt-3 text-[11px] text-[var(--c-ink-muted)] leading-relaxed">
                Talk naturally — you can answer the moment it asks. Tap <span className="text-[var(--c-success)] font-medium">Correct</span> / <span className="text-[var(--c-error)] font-medium">Incorrect</span> to confirm or redo, edit any field above, then <span className="font-medium">Save</span>. <span className="text-[var(--c-accent)]">Mute</span> silences the voice; the gear changes it.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              {!saved && !verifying && (
                <button onClick={saveReview} className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-success)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                  <Check size={16} /> Save entry
                </button>
              )}
              <button onClick={cancel} className="btn btn-outline text-sm py-2 px-4">{saved ? "Close" : "Cancel"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
