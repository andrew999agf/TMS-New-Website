"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { Mic, X, Loader2, Check, Volume2, VolumeX, Info } from "lucide-react";
import type { TimeEntryInput } from "@/app/admin/(panel)/time-tracker/actions";

/**
 * Hands-free time entry in three spoken parts:
 *   1) the case/client and the hourly rate,
 *   2) the date, the time, and the category,
 *   3) the activity note.
 * You see the words appear live as you talk, then every field becomes an
 * editable box so you can fix anything on the spot before saving. Uses the
 * browser's built-in speech recognition + synthesis (no server/API).
 */

const fix = (n: number, d = 1) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
const getUserRole = (u: string) => (u.includes("Attorney") ? "Attorney" : "Legal Assistant");
const createDesc = (cat: string, notes: string, user: string) => `${cat} - ${user.split(" (")[0]} (${getUserRole(user)}) - ${notes}`;
const todayISO = () => new Date().toISOString().split("T")[0];
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Matter = { displayNumber: string; description: string };
type Slots = { matter?: string; rate?: number; hours?: number; category?: string; notes?: string; nonBillable?: boolean; date?: string };

export function VoiceTimeEntry({
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
  // Mute silences the spoken voice ("the lady") for the whole session on this
  // page; it resets if the user leaves the tab and comes back.
  const [muted, setMuted] = useState(false);
  const muteRef = useRef(false);
  // The green Correct / red Incorrect buttons stay visible for the whole of
  // each part. decisionRef holds the resolver a button press feeds; tapping a
  // button also cuts off the spoken voice so the user never waits for her.
  const [verifying, setVerifying] = useState(false);
  const decisionRef = useRef<((d: "next" | "redo") => void) | null>(null);

  const defaultRate = activityUsers.find((u) => u.name === defaultUser)?.rate ?? 145;
  const descOf = (displayNumber?: string) => matters.find((m) => m.displayNumber === displayNumber)?.description ?? "";

  const supported = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && Boolean(window.speechSynthesis);

  // Reset the mute toggle whenever the user navigates away from this tab/page,
  // so they don't have to re-mute every entry but also don't get stuck muted.
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
          // Keep clear speech; drop low-confidence blips so background noise
          // doesn't get treated as an answer. (Confidence is 0 in some browsers,
          // so only filter when a real confidence value is provided.)
          const conf = r[0]?.confidence ?? 0;
          if (r.isFinal) { if (conf === 0 || conf >= 0.4) finalText += r[0].transcript; }
          else live += r[0].transcript;
        }
        setInterim((finalText + live).trim()); // live view of what's being heard
      };
      rec.onerror = () => finish(finalText);
      rec.onend = () => finish(finalText);
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

  /** A green Correct (next) or red Incorrect (redo) press — cuts off the voice
   *  and the microphone, then hands the decision to whatever part is waiting. */
  function press(next: boolean) {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    decisionRef.current?.(next ? "next" : "redo");
  }

  /** Read a part back and wait for confirmation. The user can tap the green
   *  Correct / red Incorrect buttons (interrupting the voice at any moment) or
   *  just say yes/no. Resolves true to advance, false to redo this part. */
  function confirmPart(desc: string): Promise<boolean> {
    if (cancelRef.current) return Promise.resolve(true);
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
      setVerifying(true);
      (async () => {
        // Let her finish the read-back first, then open the mic — otherwise the
        // mic hears her own voice and trips over itself. The buttons can still
        // cut her off at any moment.
        await speak(`I have ${desc}. Tap Correct, tap Incorrect, or just tell me.`);
        if (settled || cancelRef.current) return;
        await wait(150);
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

  /** Run one part of the entry. The Correct/Incorrect buttons are live the whole
   *  time: pressing Correct mid-sentence accepts and advances; Incorrect clears
   *  this part and re-asks. If the user just speaks, we read it back to confirm. */
  async function runPart(
    prompt: string,
    capture: (text: string) => void | Promise<void>,
    clearPart: () => void,
    readback: () => string,
    set: () => void,
  ): Promise<void> {
    for (;;) {
      if (cancelRef.current) return;
      setVerifying(true);
      const outcome = await new Promise<"next" | "redo" | "heard">((resolve) => {
        let settled = false;
        decisionRef.current = (d) => { if (settled) return; settled = true; decisionRef.current = null; resolve(d); };
        (async () => {
          // Let her finish asking, then open the mic. Listening while she talks
          // makes the mic catch her own voice and skip ahead. The green/red
          // buttons stay live so the user can still cut her off instantly.
          await speak(prompt);
          if (settled || cancelRef.current) return;
          await wait(150);
          if (settled || cancelRef.current) return;
          const text = await listen();
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
      // Heard the user out — read it back and let them confirm or redo.
      if (await confirmPart(readback())) { setVerifying(false); return; }
      clearPart(); set();
    }
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

    if (/\bhour(?:s)?\s+and\s+(?:a\s+)?half\b/.test(t)) return 1.5;
    if ((m = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine)\b\s*and\s+(?:a\s+)?half/))) return (W[m[1]] ?? parseInt(m[1])) + 0.5;

    if ((m = t.match(/\b(\d+)\s*\/\s*10\b/))) return round1(parseInt(m[1]) / 10);
    if ((m = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+tenths?\b/))) return round1((W[m[1]] ?? parseInt(m[1])) / 10);
    if (/\btenth\b/.test(t)) return 0.1;

    if ((m = t.match(/\bpoint\s+(\w+)(?:\s+(\w+))?/))) {
      const d1 = digit(m[1]);
      if (d1 != null) {
        const d2 = m[2] ? digit(m[2]) : null;
        return d2 != null ? Math.round((d1 * 10 + d2)) / 100 : round1(d1 / 10);
      }
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

  /** Hourly rate — only when there's a money cue, so a case number isn't mistaken for a rate. */
  function parseRate(s: string): number | undefined {
    const t = s.toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/))) return parseFloat(m[1]);
    if ((m = t.match(/\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|per hour|an hour|\/\s*hour|\/\s*hr|hourly)\b/))) return parseFloat(m[1]);
    if ((m = t.match(/\b(?:rate|charge|bill(?:ed)?)\b\s+(?:of\s+|is\s+|at\s+)?\$?\s*(\d{1,4}(?:\.\d{1,2})?)/))) return parseFloat(m[1]);
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

  // ---- matter matching against the uploaded Clio matters ----
  // Matters look like "0042 - Nelson, John" and carry a case description. The
  // speaker usually says a name or something about the case, so we match spoken
  // words against BOTH the number/name and the description (fuzzy, so near-misses
  // like "Nelsen" → "Nelson" still count).
  const STOP = new Set(["the", "and", "for", "matter", "client", "case", "file", "our"]);
  // Keep any spoken word longer than two letters, plus any number (so a short or
  // zero-padded case number like "42" or "1234" still counts as a token).
  const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w));
  const mToks = (m: Matter) => `${m.displayNumber} ${m.description}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 || /^\d$/.test(w));

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
    // A case number matches numerically, ignoring leading zeros, so the matter
    // "01234" is found when the user just says "1234" (and "0042" when they say "42").
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
      .map((m) => {
        const mt = mToks(m);
        const hits = st.filter((t) => mt.some((w) => tokenMatch(t, w)));
        return { ...m, score: hits.length, coversAll: hits.length === st.length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => Number(b.coversAll) - Number(a.coversAll) || b.score - a.score)
      .slice(0, 5);
  }

  /** Confident only: exactly one matter covers all spoken words. */
  function confidentMatter(spoken: string): string | undefined {
    const covering = rankMatters(spoken).filter((r) => r.coversAll);
    return covering.length === 1 ? covering[0].displayNumber : undefined;
  }

  /** Tapping the check on a shown candidate selects it (and stops the voice walk). */
  function tapCandidate(displayNumber: string) {
    pickedRef.current = displayNumber;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }

  /** Resolve the matter: a single sure hit is used outright; otherwise the top
   *  candidates (≤5) are shown — tap a row to see its description, tap the check
   *  to pick it — and read aloud one by one for a yes/no. If none fit, re-ask. */
  async function resolveMatter(spoken: string, attempt = 1): Promise<string | undefined> {
    if (cancelRef.current) return undefined;
    const ranked = rankMatters(spoken);
    if (ranked.length === 0) {
      if (attempt >= 3) return spoken.trim() || undefined;
      const again = await ask("I couldn't find a matching case. Please say the client or matter name again.", (x) => x.trim(), true);
      return resolveMatter(again ?? "", attempt + 1);
    }
    const covering = ranked.filter((r) => r.coversAll);
    if (covering.length === 1) return covering[0].displayNumber; // 100% sure → just use it

    const cands: Matter[] = [...covering, ...ranked.filter((r) => !r.coversAll)].slice(0, 5).map((r) => ({ displayNumber: r.displayNumber, description: r.description }));
    pickedRef.current = null;
    setCandidates(cands);
    setOpenDesc(null);
    await speak(cands.length === 1 ? "I found one possible match. Tap the check to use it, or say yes." : "I found a few. Tap a row to see the case, tap the check to pick it, or say yes when I read the right one.");
    for (const c of cands) {
      if (cancelRef.current) { setCandidates([]); return undefined; }
      if (pickedRef.current) break;
      await speak(`Is it ${c.displayNumber}?`);
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

  async function run() {
    if (runningRef.current) return;
    if (!supported) { alert("Voice input isn't supported in this browser. Try Chrome or Edge on a computer."); return; }
    runningRef.current = true; cancelRef.current = false;
    setOpen(true); setSaved(false); setCandidates([]); setHeard(""); setInterim("");
    const s: Slots = { date: todayISO(), nonBillable: false, rate: defaultRate };
    setSlots({ ...s });
    const set = () => setSlots({ ...s });
    try {
      // Part 1 — the case/client and the hourly rate.
      await runPart(
        "First, the case or client, and the hourly rate.",
        async (text) => {
          const r0 = parseRate(text); if (r0 != null) s.rate = r0;
          const matterText = stripRate(text).trim();
          const conf = confidentMatter(matterText);
          s.matter = conf ?? (await resolveMatter(matterText || text));
        },
        () => { s.matter = undefined; s.rate = defaultRate; },
        () => `the case as ${s.matter || "no case"}, at ${s.rate ?? defaultRate} dollars an hour`,
        set,
      );
      if (cancelRef.current) return;

      // Part 2 — the date, the time, and the category.
      await runPart(
        "Next, the date, how long it took, and the category.",
        (text) => {
          const h = parseHours(text); if (h != null) s.hours = h;
          const cat = matchCategory(text, true); if (cat) s.category = cat;
          const d = parseDate(stripTime(text)); if (d) s.date = d;
          if (/non[- ]?billable|no charge|not billable/i.test(text)) s.nonBillable = true;
        },
        () => { s.hours = undefined; s.category = undefined; s.date = todayISO(); },
        () => `${s.hours ?? 0} hour${s.hours === 1 ? "" : "s"} of ${s.category || "no category"}, dated ${s.date || todayISO()}`,
        set,
      );
      if (cancelRef.current) return;

      // Part 3 — the activity note.
      await runPart(
        "Last, the activity note.",
        (text) => {
          const skip = !text.trim() || /^(?:no|none|skip|nope|nothing|that's all|no notes?)\.?$/i.test(text.trim());
          s.notes = skip ? "" : text.trim();
        },
        () => { s.notes = undefined; },
        () => (s.notes ? `the note as ${s.notes}` : "no note"),
        set,
      );
      if (cancelRef.current) return;

      // Everything's editable on screen the whole time; just invite a final look.
      speak("Here's what I have. Edit anything on screen, then tap Save.");
    } finally {
      runningRef.current = false; setListening(false); setVerifying(false);
    }
  }

  function saveReview() {
    if (!slots.matter || !slots.matter.trim()) { setStatus("Please choose a case before saving."); return; }
    const user = defaultUser;
    const rate = slots.rate ?? defaultRate;
    const hoursR = fix(Math.ceil((slots.hours || 0) * 10) / 10, 1);
    const note = slots.notes ? createDesc(slots.category || "", slots.notes, user) : `${slots.category || ""} - ${user.split(" (")[0]} (${getUserRole(user)})`;
    onAdd({
      matter: slots.matter.trim(), entryDate: slots.date || todayISO(), activityDescription: "", note,
      price: fix(rate, 2), quantity: hoursR, activityUserName: user, nonBillable: !!slots.nonBillable,
    });
    setSaved(true);
    speak("Saved to your board.");
  }

  function cancel() {
    cancelRef.current = true;
    pickedRef.current = null;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    decisionRef.current?.("next"); // release any pending step so run() can unwind
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

            {/* The big green Correct / red Incorrect buttons stay up the whole
                time a part is running — tap either to cut her off and move on. */}
            {verifying && candidates.length === 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => press(true)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-success)] px-4 py-3 text-base font-semibold text-white hover:opacity-90"
                >
                  <Check size={18} /> Correct
                </button>
                <button
                  onClick={() => press(false)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-error)] px-4 py-3 text-base font-semibold text-white hover:opacity-90"
                >
                  <X size={18} /> Incorrect
                </button>
              </div>
            )}

            {/* Every field is editable on the spot, the whole time. */}
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Case / client</label>
                <input list="vte-matters" value={slots.matter ?? ""} onChange={(e) => upd({ matter: e.target.value })} className={fieldClass} placeholder="Choose a case" />
                <datalist id="vte-matters">{matters.map((m) => <option key={m.displayNumber} value={m.displayNumber}>{m.description}</option>)}</datalist>
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

            <div className="mt-5 flex justify-end gap-2">
              {!saved && (
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
