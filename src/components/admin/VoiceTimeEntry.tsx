"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { Mic, X, Loader2, Check, Volume2, VolumeX } from "lucide-react";
import type { TimeEntryInput } from "@/app/admin/(panel)/time-tracker/actions";

/**
 * Hands-free time entry. Tap the floating mic, describe the entry, and it fills
 * what it can, asks for anything missing, reads it back, and saves on a "yes".
 * Uses the browser's built-in speech recognition + synthesis (no server/API).
 */

const fix = (n: number, d = 1) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
const getUserRole = (u: string) => (u.includes("Attorney") ? "Attorney" : "Legal Assistant");
const createDesc = (cat: string, notes: string, user: string) => `${cat} - ${user.split(" (")[0]} (${getUserRole(user)}) - ${notes}`;
const todayISO = () => new Date().toISOString().split("T")[0];
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; };

type Slots = { matter?: string; hours?: number; category?: string; notes?: string; nonBillable?: boolean; date?: string };

export function VoiceTimeEntry({
  matters, categories, activityUsers, defaultUser, onAdd,
}: {
  matters: string[];
  categories: string[];
  activityUsers: { name: string; rate: number }[];
  defaultUser: string;
  onAdd: (input: TimeEntryInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [slots, setSlots] = useState<Slots>({});
  const [saved, setSaved] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const pickedRef = useRef<string | null>(null);
  const cancelRef = useRef(false);
  const recRef = useRef<any>(null);
  const runningRef = useRef(false);
  // Mute silences the spoken voice ("the lady") for the whole session on this
  // page; it resets if the user leaves the tab and comes back.
  const [muted, setMuted] = useState(false);
  const muteRef = useRef(false);
  // Per-step verification: while true, the Correct/Incorrect buttons are shown
  // and verifyRef holds the resolver that a button (or voice) calls.
  const [verifying, setVerifying] = useState(false);
  const verifyRef = useRef<((ok: boolean) => void) | null>(null);

  const supported = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && Boolean(window.speechSynthesis);

  // Reset the mute toggle whenever the user navigates away from this tab/page,
  // so they don't have to un-mute, but also don't have to re-mute every entry.
  useEffect(() => {
    const onHide = () => { if (document.hidden) { setMuted(false); muteRef.current = false; } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  function speak(text: string): Promise<void> {
    setStatus(text);
    if (muteRef.current) return Promise.resolve();
    return new Promise((res) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => res();
        u.onerror = () => res();
        window.speechSynthesis.speak(u);
      } catch { res(); }
    });
  }

  function listen(): Promise<string> {
    return new Promise((res) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return res("");
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
      let done = false;
      setListening(true); setHeard("");
      rec.onresult = (e: any) => { done = true; const t = e.results[0][0].transcript as string; setHeard(t); setListening(false); res(t); };
      rec.onerror = () => { if (!done) { done = true; setListening(false); res(""); } };
      rec.onend = () => { if (!done) { done = true; setListening(false); res(""); } };
      try { rec.start(); } catch { setListening(false); res(""); }
    });
  }

  async function ask<T>(prompt: string, parse: (s: string) => T, required = true): Promise<T | undefined> {
    if (cancelRef.current) return undefined;
    await speak(prompt);
    if (cancelRef.current) return undefined;
    let v = parse(await listen());
    if (required && (v === undefined || v === null || v === ("" as unknown))) {
      if (cancelRef.current) return undefined;
      await speak("Sorry, I didn't catch that. " + prompt);
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

  /** A Correct/Incorrect button press (or a spoken yes/no) resolves the
   *  pending verification step. */
  function clickVerify(ok: boolean) {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    verifyRef.current?.(ok);
  }

  /** Read a captured value back and wait for confirmation. The user can tap the
   *  green Correct / red Incorrect buttons, or just say yes/no. Resolves true to
   *  advance, false to redo. */
  function verifyStep(desc: string): Promise<boolean> {
    if (cancelRef.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        verifyRef.current = null;
        setVerifying(false);
        try { recRef.current?.abort?.(); } catch { /* ignore */ }
        resolve(ok);
      };
      verifyRef.current = finish;
      setVerifying(true);
      (async () => {
        await speak(`I have ${desc}. Tap the green Correct button or the red Incorrect button — or just tell me.`);
        // Listen for a spoken yes/no too; the buttons can interrupt at any time.
        for (let i = 0; i < 8 && !settled && !cancelRef.current; i++) {
          const ans = await listen();
          if (settled || cancelRef.current) return;
          if (isNo(ans)) { finish(false); return; }
          if (isYes(ans)) { finish(true); return; }
          // Unclear — keep listening; the buttons remain available.
        }
      })();
    });
  }

  /* ---- parsers ---- */
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

    // "N and a half hours", "an hour and a half"
    if (/\bhour(?:s)?\s+and\s+(?:a\s+)?half\b/.test(t)) return 1.5;
    if ((m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine)\b\s*and\s+(?:a\s+)?half/))) return (W[m[1]] ?? parseInt(m[1])) + 0.5;

    // Tenths: "2/10", "two tenths", "a tenth"
    if ((m = t.match(/\b(\d+)\s*\/\s*10\b/))) return round1(parseInt(m[1]) / 10);
    if ((m = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+tenths?\b/))) return round1((W[m[1]] ?? parseInt(m[1])) / 10);
    if (/\btenth\b/.test(t)) return 0.1;

    // Spoken decimals: "point two", "point six", "point two five"
    if ((m = t.match(/\bpoint\s+(\w+)(?:\s+(\w+))?/))) {
      const d1 = digit(m[1]);
      if (d1 != null) {
        const d2 = m[2] ? digit(m[2]) : null;
        return d2 != null ? Math.round((d1 * 10 + d2)) / 100 : round1(d1 / 10);
      }
    }

    // Written decimals: ".2", "0.2", "1.5", "2.5"
    if ((m = t.match(/(\d*\.\d+)/))) return parseFloat(m[1]);

    // Hours / minutes / words
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/))) return parseFloat(m[1]);
    if ((m = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s*hours?\b/))) return W[m[1]];
    if ((m = t.match(/(\d+)\s*(?:minutes?|mins?)\b/))) return round1(parseInt(m[1]) / 60);
    if (/\bhalf\b/.test(t)) return 0.5;
    if (/\bquarter\b/.test(t)) return 0.25;
    if (/\b(?:an|one)\s+hour\b/.test(t)) return 1;

    // Bare number
    if ((m = t.match(/^\s*(\d*\.?\d+)\s*$/))) return parseFloat(m[1]);
    return undefined;
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

  // ---- matter matching against the uploaded Clio matters ----
  // Matters look like "0042 - Nelson, John". The speaker usually says just the
  // name, so we match spoken words against the matter's words (ignoring the
  // numbers) with a fuzzy comparison so near-misses ("Nelsen" → "Nelson") count.
  const STOP = new Set(["the", "and", "for", "matter", "client", "case", "file", "our"]);
  const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const mToks = (m: string) => m.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

  function lev(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function tokenMatch(st: string, mt: string): boolean {
    if (/^\d+$/.test(mt)) return st === mt; // matter number only matches if said exactly
    if (mt.includes(st) || st.includes(mt)) return true;
    if (st.length >= 4 && mt.length >= 4) return lev(st, mt) <= Math.floor(Math.max(st.length, mt.length) / 4);
    return false;
  }

  /** Top candidate matters for spoken text, ranked, each with whether it covers
   *  every spoken word (a strong/confident signal). */
  function rankMatters(spoken: string): { matter: string; score: number; coversAll: boolean }[] {
    const st = toks(spoken);
    if (!st.length) return [];
    return matters
      .map((m) => {
        const mt = mToks(m);
        const hits = st.filter((t) => mt.some((w) => tokenMatch(t, w)));
        return { matter: m, score: hits.length, coversAll: hits.length === st.length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => Number(b.coversAll) - Number(a.coversAll) || b.score - a.score)
      .slice(0, 5);
  }

  /** Confident only: exactly one matter covers all spoken words. */
  function confidentMatter(spoken: string): string | undefined {
    const covering = rankMatters(spoken).filter((r) => r.coversAll);
    return covering.length === 1 ? covering[0].matter : undefined;
  }

  /** Tapping a shown candidate selects it immediately (and stops the voice walk). */
  function tapCandidate(m: string) {
    pickedRef.current = m;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }

  /** Resolve the matter: a single sure hit is used outright; otherwise the top
   *  candidates (≤5) are shown as tappable buttons AND read aloud one by one —
   *  the user can tap the right one or answer yes/no. If none fit, re-ask. */
  async function resolveMatter(spoken: string, attempt = 1): Promise<string | undefined> {
    if (cancelRef.current) return undefined;
    const ranked = rankMatters(spoken);
    if (ranked.length === 0) {
      if (attempt >= 3) return spoken.trim() || undefined;
      const again = await ask("I couldn't find a matching case. Please say the client or matter name again.", (x) => x.trim(), true);
      return resolveMatter(again ?? "", attempt + 1);
    }
    const covering = ranked.filter((r) => r.coversAll);
    if (covering.length === 1) return covering[0].matter; // 100% sure → just use it

    const cands = [...covering, ...ranked.filter((r) => !r.coversAll)].slice(0, 5).map((r) => r.matter);
    pickedRef.current = null;
    setCandidates(cands);
    await speak(cands.length === 1 ? "I found one possible match. Tap it, or say yes." : "I found a few. Tap the right one, or say yes when I read it.");
    for (const c of cands) {
      if (cancelRef.current) { setCandidates([]); return undefined; }
      if (pickedRef.current) break;
      await speak(`Is it ${c}?`);
      if (pickedRef.current || cancelRef.current) break;
      const ans = await listen();
      if (pickedRef.current || cancelRef.current) break;
      if (isYes(ans)) { setCandidates([]); return c; }
      if (!isNo(ans) && ans.trim() && !/\bnext\b/i.test(ans)) { setCandidates([]); return resolveMatter(ans, attempt + 1); }
    }
    setCandidates([]);
    if (pickedRef.current) { const m = pickedRef.current; pickedRef.current = null; return m; }
    if (cancelRef.current) return undefined;
    if (attempt >= 3) return spoken.trim() || undefined;
    const again = await ask("None of those matched. Please say the client or matter name again.", (x) => x.trim(), true);
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

  /** First-utterance parse: pull client/date/category/time in any order. The
   *  note is captured separately on its own prompt (easier to recognize). */
  function parseInitial(s: string): Slots {
    const out: Slots = {};
    const h = parseHours(s); if (h != null) out.hours = h;
    const cat = matchCategory(s, true); if (cat) out.category = cat;
    const mt = confidentMatter(s); if (mt) out.matter = mt;
    if (/non[- ]?billable|no charge|not billable/i.test(s)) out.nonBillable = true;
    const d = parseDate(stripTime(s)); if (d) out.date = d;
    return out;
  }

  /** Pull a note value when the speaker explicitly flags it ("the note is …"). */
  function extractNoteValue(t: string): string {
    const m = t.match(/notes?\s+(?:should (?:be|say|read)|that says|saying|reads?|is|are|to be|to|of|:)\s*(.+)/i);
    return m ? m[1].trim() : "";
  }

  function detectEditField(s: string): "matter" | "hours" | "category" | "note" | "nonBillable" | null {
    const t = s.toLowerCase();
    if (/\b(matter|client|case|file)\b/.test(t)) return "matter";
    if (/\b(hours?|time|long|duration|minutes?)\b/.test(t)) return "hours";
    if (/\b(category|type of work|activity)\b/.test(t)) return "category";
    if (/\b(notes?|description|memo)\b/.test(t)) return "note";
    if (/\b(billable|non[- ]?billable|charge)\b/.test(t)) return "nonBillable";
    return null;
  }

  function dateLabel(d?: string): string {
    if (!d || d === todayISO()) return "today";
    if (d === yesterdayISO()) return "yesterday";
    const [y, mo, da] = d.split("-");
    return `${parseInt(mo)}/${parseInt(da)}/${y}`;
  }
  function summaryText(s: Slots): string {
    const parts = [
      `${s.hours ?? 0} hour${s.hours === 1 ? "" : "s"}`,
      `of ${s.category || "no category"}`,
      `on ${s.matter || "no matter"}`,
    ];
    if (s.notes) parts.push(`note: ${s.notes}`);
    parts.push(s.nonBillable ? "non-billable" : "billable");
    parts.push(`dated ${dateLabel(s.date)}`);
    return parts.join(", ");
  }

  /** Apply a spoken edit at the confirmation step (instead of discarding). */
  async function applyEdit(s: Slots, utterance: string): Promise<void> {
    const field = detectEditField(utterance);
    if (field === "hours") {
      let h = parseHours(utterance);
      if (h == null) h = await ask("What should the time be?", parseHours);
      if (h != null) s.hours = h;
      return;
    }
    if (field === "category") {
      let c = matchCategory(utterance, true);
      if (!c) c = matchCategory((await ask("What category?", (x) => x.trim())) ?? "", false);
      if (c) s.category = c;
      return;
    }
    if (field === "matter") {
      const spoken = (await ask("Which matter or client?", (x) => x.trim())) ?? "";
      if (cancelRef.current) return;
      const r = await resolveMatter(spoken);
      if (r) s.matter = r;
      return;
    }
    if (field === "note") {
      let note = extractNoteValue(utterance);
      if (!note) note = (await ask("What should the note say?", (x) => x.trim())) ?? "";
      s.notes = note;
      return;
    }
    if (field === "nonBillable") {
      if (/non[- ]?billable|not billable|no charge/i.test(utterance)) s.nonBillable = true;
      else if (/\bbillable\b/i.test(utterance)) s.nonBillable = false;
      else { const a = (await ask("Billable or non-billable?", (x) => x)) ?? ""; s.nonBillable = /non[- ]?billable|not billable|no charge/i.test(a); }
      return;
    }
    const which = (await ask("No problem — what would you like to change? You can say the matter, the time, the category, the note, or whether it's billable.", (x) => x, true)) ?? "";
    if (cancelRef.current) return;
    if (detectEditField(which)) await applyEdit(s, which);
  }

  async function run() {
    if (runningRef.current) return;
    if (!supported) { alert("Voice input isn't supported in this browser. Try Chrome or Edge on a computer."); return; }
    runningRef.current = true; cancelRef.current = false; setOpen(true); setSaved(false); setSlots({});
    const set = (s: Slots) => setSlots({ ...s });
    try {
      // Step 1 — say the client, date, category, and time in any order.
      await speak("Tell me the client, the date, the category, and how long it took.");
      const s: Slots = parseInitial(await listen());
      set(s);
      if (cancelRef.current) return;

      // Each field is captured (if not already heard) and then verified with the
      // green Correct / red Incorrect buttons. Incorrect re-does that one step.

      // Client / matter.
      while (!cancelRef.current) {
        if (!s.matter) {
          const spoken = (await ask("Which client or matter?", (x) => x.trim())) ?? "";
          if (cancelRef.current) return;
          s.matter = await resolveMatter(spoken);
          set(s);
        }
        if (cancelRef.current) return;
        if (await verifyStep(`the matter as ${s.matter || "no matter"}`)) break;
        s.matter = undefined; set(s);
      }
      if (cancelRef.current) return;

      // Date.
      while (!cancelRef.current) {
        if (!s.date) {
          const d = (await ask("What date? Say today if it's for today.", (x) => x, true)) ?? "";
          s.date = !d.trim() || /\btoday\b/i.test(d) ? todayISO() : (parseDate(d) || todayISO());
          set(s);
        }
        if (cancelRef.current) return;
        if (await verifyStep(`the date as ${dateLabel(s.date)}`)) break;
        s.date = undefined; set(s);
      }
      if (cancelRef.current) return;

      // Category.
      while (!cancelRef.current) {
        if (!s.category) { s.category = matchCategory((await ask("What category?", (x) => x.trim())) ?? "", false); set(s); }
        if (cancelRef.current) return;
        if (await verifyStep(`the category as ${s.category || "no category"}`)) break;
        s.category = undefined; set(s);
      }
      if (cancelRef.current) return;

      // Time.
      while (!cancelRef.current) {
        if (s.hours == null) { s.hours = await ask("How much time? For example, half an hour, point five, or forty-five minutes.", parseHours); set(s); }
        if (cancelRef.current) return;
        if (await verifyStep(`the time as ${s.hours ?? 0} hour${s.hours === 1 ? "" : "s"}`)) break;
        s.hours = undefined; set(s);
      }
      if (cancelRef.current) return;

      // Step 2 — the activity note, on its own so it's easy to capture.
      while (!cancelRef.current) {
        const n = (await ask("Now, what is the activity note?", (x) => x, false)) ?? "";
        const skip = !n.trim() || /^(?:no|none|skip|nope|nothing|that's all|no notes?)\.?$/i.test(n.trim());
        s.notes = skip ? "" : n.trim();
        set(s);
        if (cancelRef.current) return;
        if (await verifyStep(s.notes ? `the note as ${s.notes}` : "no note")) break;
      }
      if (cancelRef.current) return;

      const user = defaultUser;
      // Final read-back of the whole entry. Correct saves; Incorrect lets the
      // user name a single piece to change.
      let confirmed = false;
      for (let i = 0; i < 6 && !cancelRef.current; i++) {
        if (await verifyStep(summaryText(s))) { confirmed = true; break; }
        if (cancelRef.current) return;
        const which = (await ask("No problem — what would you like to change? You can say the matter, the time, the category, the note, or whether it's billable.", (x) => x, true)) ?? "";
        if (cancelRef.current) return;
        if (/\b(cancel|discard|delete it|throw it out|never mind|forget it|scrap)\b/i.test(which)) {
          await speak("Okay, discarded.");
          setStatus("Discarded.");
          return;
        }
        await applyEdit(s, which);
        set(s);
      }
      if (!confirmed) {
        if (!cancelRef.current) { await speak("Let's stop here. Nothing was saved."); setStatus("Not saved."); }
        return;
      }

      const rate = activityUsers.find((u) => u.name === user)?.rate ?? 145;
      const hoursR = fix(Math.ceil((s.hours || 0) * 10) / 10, 1);
      const note = s.notes ? createDesc(s.category || "", s.notes, user) : `${s.category || ""} - ${user.split(" (")[0]} (${getUserRole(user)})`;
      onAdd({
        matter: s.matter || "", entryDate: s.date || todayISO(), activityDescription: "", note,
        price: fix(rate, 2), quantity: hoursR, activityUserName: user, nonBillable: !!s.nonBillable,
      });
      setSaved(true);
      await speak("Saved to your board.");
    } finally {
      runningRef.current = false; setListening(false);
    }
  }

  function cancel() {
    cancelRef.current = true;
    pickedRef.current = null;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    verifyRef.current?.(true); // release any pending verify so run() can unwind
    setVerifying(false);
    runningRef.current = false; setListening(false); setOpen(false); setCandidates([]);
  }

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
          <div className="bg-[var(--c-surface)] rounded-lg w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-[family-name:var(--font-display)] text-lg flex items-center gap-2"><Mic size={18} className="text-[var(--c-accent)]" /> Voice entry</h3>
              <div className="flex items-center gap-1.5">
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
            <p className="text-sm min-h-[40px]">{status}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--c-ink-muted)] min-h-[18px]">
              {listening ? <><Loader2 size={14} className="animate-spin" /> Listening…</> : heard ? `“${heard}”` : null}
            </div>

            {candidates.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[var(--c-ink-muted)] mb-1.5">Tap the correct case (or say yes when I read it):</p>
                <div className="space-y-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c}
                      onClick={() => tapCandidate(c)}
                      className="w-full text-left rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm hover:border-[var(--c-accent)] hover:bg-[var(--c-surface2)]"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {([["Matter", slots.matter], ["Hours", slots.hours], ["Category", slots.category], ["Notes", slots.notes], ["Non-billable", slots.nonBillable ? "Yes" : ""]] as [string, unknown][])
                .map(([k, v]) => (v ? <div key={k}><span className="text-[var(--c-ink-muted)]">{k}: </span>{String(v)}</div> : null))}
            </div>
            {verifying && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => clickVerify(true)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-success)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  <Check size={16} /> Correct
                </button>
                <button
                  onClick={() => clickVerify(false)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-error)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  <X size={16} /> Incorrect
                </button>
              </div>
            )}
            {saved && <p className="mt-4 text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Added to your board.</p>}
            {!saved && (
              <p className="mt-4 text-[11px] text-[var(--c-ink-muted)] leading-relaxed">
                Say the client&apos;s name to find their case. Time can be &ldquo;half an hour&rdquo;, &ldquo;point five&rdquo;, or &ldquo;45 minutes&rdquo;.
              </p>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={cancel} className="btn btn-outline text-sm py-2 px-4">{saved ? "Close" : "Cancel"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
