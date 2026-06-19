"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { Mic, X, Loader2, Check, Volume2, VolumeX, Info, Pencil } from "lucide-react";
import type { TimeEntryInput } from "@/app/admin/(panel)/time-tracker/actions";
import {
  type Matter,
  todayISO, parseHours, parseDate, fullDate,
  matchCategory, rankMatters, isYes, isNo,
} from "@/lib/voice/match4";

/**
 * Voice time entry — 4.0. A fresh, forgiving, two-step flow built on the
 * browser's built-in speech recognition + synthesis (the only engine that
 * actually works reliably in the field; the on-device Whisper experiment in 3.0
 * did not). Everything the user says is surfaced and correctable; nothing is
 * ever dropped because of a misheard "no."
 *
 * Design goals (highest first):
 *   1. Recognition robustness + matter matching quality — the core complaint.
 *   2. Two steps: gather the core facts in any order, then capture the note
 *      verbatim in isolation so a note that starts with "no" is never a cancel.
 *   3. Every step is read back and correctable in place (tap or voice).
 *   4. Confirmation is an EDIT LOOP — only the words "cancel / discard / never
 *      mind / start over" throw an entry away.
 *
 * The host (TimeTracker) and the CSV import/export are untouched: this component
 * only consumes the shared {matters, categories, activityUsers, defaultUser}
 * and emits a finished entry through onAdd, exactly like the original.
 */

/* ----- billing/CSV helpers (kept identical to the original tracker) ----- */
const fix = (n: number, d = 1) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
const getUserRole = (u: string) => (u.includes("Attorney") ? "Attorney" : "Legal Assistant");
const createDesc = (cat: string, notes: string, user: string) =>
  `${cat} - ${user.split(" (")[0]} (${getUserRole(user)}) - ${notes}`;

/* ----- hourly-rate parsing (ported verbatim from Time Tracker 1.0 so Part 1 —
   "the case or client, and the hourly rate" — behaves exactly the same) ----- */
/** Hourly rate when there's a money cue ($295, "295 dollars", "rate of 295"). */
function parseRate(s: string): number | undefined {
  const t = s.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/))) return parseFloat(m[1]);
  if ((m = t.match(/\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|per hour|an hour|\/\s*hour|\/\s*hr|hourly)\b/))) return parseFloat(m[1]);
  if ((m = t.match(/\b(?:rate|charge|bill(?:ed)?)\b\s+(?:of\s+|is\s+|at\s+)?\$?\s*(\d{1,4}(?:\.\d{1,2})?)/))) return parseFloat(m[1]);
  return undefined;
}
/** A bare spoken number in a sensible hourly-rate range (e.g. "295") taken as the
 *  rate. Returns the value and the matched text so it can be removed before
 *  matching the case. */
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

type Slots = {
  rawClient?: string; // what the user said for the client, before resolving
  matter?: string; // resolved Display Number
  rate?: number;
  hours?: number;
  category?: string;
  notes?: string;
  nonBillable?: boolean;
  date?: string; // YYYY-MM-DD
  user?: string;
};

/** The explicit control-flow states from the spec (§3). Surfaced for clarity
 *  and so the UI can label what's happening; the async driver walks them. */
type Phase =
  | "idle"
  | "gather_core"
  | "fill_client"
  | "fill_date"
  | "fill_category"
  | "fill_time"
  | "resolve_matter"
  | "ask_note"
  | "confirm"
  | "edit_field"
  | "saved";

/* ----------------------------------------------------------------- component */
export function VoiceTimeEntry4({
  matters, categories, activityUsers, defaultUser, onAdd,
}: {
  matters: Matter[];
  categories: string[];
  activityUsers: { name: string; rate: number }[];
  defaultUser: string;
  onAdd: (input: TimeEntryInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [slots, setSlots] = useState<Slots>({});
  const [saved, setSaved] = useState(false);
  const [candidates, setCandidates] = useState<Matter[]>([]);
  const [openDesc, setOpenDesc] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const pickedRef = useRef<string | null>(null);
  const cancelRef = useRef(false);
  const recRef = useRef<any>(null);
  const runningRef = useRef(false);

  // Mute silences the spoken voice for the whole session on this page; it resets
  // when the user leaves the tab/page and comes back (§10).
  const [muted, setMuted] = useState(false);
  const muteRef = useRef(false);

  // Green Correct / red Incorrect buttons stay live for the whole of each step.
  const [verifying, setVerifying] = useState(false);
  const [labels, setLabels] = useState<{ yes: string; no: string }>({ yes: "Correct", no: "Incorrect" });
  const decisionRef = useRef<((d: "next" | "redo") => void) | null>(null);

  const defaultRate = activityUsers.find((u) => u.name === defaultUser)?.rate ?? 145;
  const descOf = (displayNumber?: string) => matters.find((m) => m.displayNumber === displayNumber)?.description ?? "";

  const supported = typeof window !== "undefined"
    && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    && Boolean(typeof window !== "undefined" && window.speechSynthesis);

  // Reset mute when navigating away (§10).
  useEffect(() => {
    const onHide = () => { if (document.hidden) { setMuted(false); muteRef.current = false; } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  /* ------------------------------------------------------------ speech I/O */
  function speak(text: string): Promise<void> {
    setStatus(text);
    if (muteRef.current || !supported) return Promise.resolve();
    return new Promise((res) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.02;
        u.onend = () => res();
        u.onerror = () => res();
        window.speechSynthesis.speak(u);
      } catch { res(); }
    });
  }

  /** Listen for one utterance, showing words live. Reports mic-permission
   *  failures so the typed fallback can take over. */
  function listen(): Promise<string> {
    return new Promise((res) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return res("");
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      let done = false; let finalText = "";
      const finish = (t: string) => { if (done) return; done = true; setListening(false); setHeard(t.trim()); setInterim(""); res(t.trim()); };
      setListening(true); setHeard(""); setInterim("");
      rec.onresult = (e: any) => {
        let live = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          const conf = r[0]?.confidence ?? 0;
          // Keep clear speech; drop genuinely low-confidence finals (confidence
          // is 0 in some browsers, so only filter when a real value is present).
          if (r.isFinal) { if (conf === 0 || conf >= 0.3) finalText += r[0].transcript + " "; }
          else live += r[0].transcript;
        }
        setInterim((finalText + live).trim());
      };
      rec.onerror = (e: any) => {
        const err = e?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          setMicError("The microphone is blocked. Allow mic access in your browser, or type the entry below — every field is editable.");
        }
        finish(finalText);
      };
      rec.onend = () => finish(finalText);
      // The mic actually opened → clear any stale "blocked" banner from earlier.
      rec.onstart = () => setMicError(null);
      try { rec.start(); } catch { setListening(false); res(""); }
    });
  }

  /** Listen for the user's actual answer, retrying on empties and stripping any
   *  of the prompt's own words that bleed in through the speakers. */
  async function listenForAnswer(prompt: string, longForm = false): Promise<string> {
    const ignore = new Set(prompt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    for (let i = 0; i < 6 && !cancelRef.current; i++) {
      const raw = (await listen()).trim();
      if (cancelRef.current) return "";
      if (!raw) continue;
      if (longForm) return raw; // notes are verbatim — never filter
      const cleaned = raw.split(/\s+/)
        .filter((w) => { const k = w.toLowerCase().replace(/[^a-z0-9]/g, ""); return k && !ignore.has(k); })
        .join(" ").trim();
      if (cleaned) return cleaned;
    }
    return "";
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      muteRef.current = next;
      if (next) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
      return next;
    });
  }

  /** A green Correct (next) / red Incorrect (redo) press — cuts the voice + mic
   *  and hands the decision to whatever step is waiting. */
  function press(next: boolean) {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    decisionRef.current?.(next ? "next" : "redo");
  }

  /* ------------------------------------------------------ a single gather step
   * Reads the prompt, listens, captures, reads the value back, and waits for the
   * user to confirm (green/voice-yes) or redo (red/voice-no). Returns when the
   * user accepts. Pressing Correct mid-sentence accepts early; Incorrect redoes
   * ONLY this step — the rest of the entry is preserved (§9).
   *
   * REDO HOOK: red Incorrect currently re-asks just this one field. To switch a
   * firm to "start the whole entry over" on Incorrect, replace the `clear()` +
   * continue below with a call that throws to the top of runEntry(). */
  async function step(opts: {
    phase: Phase;
    prompt: string;
    capture: (text: string) => void | Promise<void>;
    clear: () => void;
    readback: () => string;
    sync?: () => void; // mirror the in-progress entry object onto the on-screen fields
    longForm?: boolean;
    confirm?: boolean; // when false, advance as soon as something is captured
  }): Promise<void> {
    for (;;) {
      if (cancelRef.current) return;
      setPhase(opts.phase);
      setLabels({ yes: "Correct", no: "Incorrect" });
      setVerifying(true);
      const outcome = await new Promise<"next" | "redo" | "heard">((resolve) => {
        let settled = false;
        decisionRef.current = (d) => { if (settled) return; settled = true; decisionRef.current = null; resolve(d); };
        (async () => {
          speak(opts.prompt); // mic opens immediately; user can talk over the prompt
          const text = await listenForAnswer(opts.prompt, opts.longForm);
          if (settled || cancelRef.current) return;
          await opts.capture(text);
          if (opts.sync) opts.sync(); else setSlots((s) => ({ ...s }));
          if (settled) return;
          settled = true; decisionRef.current = null; resolve("heard");
        })();
      });
      if (cancelRef.current) return;
      if (outcome === "redo") { opts.clear(); if (opts.sync) opts.sync(); else setSlots((s) => ({ ...s })); continue; }
      if (outcome === "next") { setVerifying(false); return; }
      // Heard the user — read the value back and let them confirm or redo.
      if (opts.confirm === false) { setVerifying(false); return; }
      const ok = await confirmValue(opts.readback());
      if (cancelRef.current) return;
      if (ok) { setVerifying(false); return; }
      opts.clear(); if (opts.sync) opts.sync(); else setSlots((s) => ({ ...s }));
    }
  }

  /** Read a captured value back and wait for Correct/Incorrect (tap or voice). */
  function confirmValue(desc: string): Promise<boolean> {
    return askDecision(`I have ${desc}.`, { yes: "Correct", no: "Incorrect" });
  }

  /** Yes/no-style question. Tap green/red (interrupting the voice) or speak.
   *  Resolves true for green, false for red. */
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
        settled = true; decisionRef.current = null;
        try { recRef.current?.abort?.(); } catch { /* ignore */ }
        resolve(ok);
      };
      decisionRef.current = (d) => finish(d === "next");
      setLabels({ yes: opts.yes, no: opts.no });
      setVerifying(true);
      (async () => {
        speak(speakText);
        for (let i = 0; i < 8 && !settled && !cancelRef.current; i++) {
          const ans = await listenForAnswer(speakText);
          if (settled || cancelRef.current) return;
          if (noFn(ans)) { finish(false); return; }
          if (yesFn(ans)) { finish(true); return; }
          // Unclear — keep listening; the buttons stay live.
        }
      })();
    });
  }

  /* Core parsing + matter ranking live in @/lib/voice/match4 (unit-tested);
     resolveMatter below is the interactive wrapper around them. */

  /** Resolve the spoken client to a single matter (§6). */
  async function resolveMatter(spoken: string, attempt = 1): Promise<string | undefined> {
    if (cancelRef.current) return undefined;
    setPhase("resolve_matter");
    if (!matters.length) {
      // No CSV loaded — keep the raw text so nothing is lost, and tell the user.
      await speak("No matters are loaded. Please upload the Clio Matters CSV, or type the case below.");
      return spoken.trim() || undefined;
    }
    const ranked = rankMatters(spoken, matters);
    if (ranked.length === 0) {
      if (attempt >= 3) return spoken.trim() || undefined;
      const again = await askField("I couldn't find a matching case. Say the client's name again.");
      return resolveMatter(again, attempt + 1);
    }

    const full = ranked.filter((r) => r.matched === r.total);
    // Single high-confidence hit → auto-select silently.
    if (full.length === 1) return full[0].displayNumber;
    if (ranked.length === 1 && ranked[0].score >= 1.6) return ranked[0].displayNumber;
    if (ranked[0].score >= 2.6 && (ranked.length === 1 || ranked[0].score - ranked[1].score >= 0.8)) return ranked[0].displayNumber;

    // Ambiguous → present the top 5; tap a row, tap the check, or speak yes/no.
    const cands: Matter[] = ranked.slice(0, 5).map((r) => ({ displayNumber: r.displayNumber, description: r.description }));
    pickedRef.current = null;
    setCandidates(cands);
    setOpenDesc(null);
    await speak(cands.length === 1 ? "Is this the case?" : "I found a few. Tap one, or tell me which.");
    for (const c of cands) {
      if (cancelRef.current) { setCandidates([]); return undefined; }
      if (pickedRef.current) break;
      await speak(`Is it ${c.displayNumber}?`);
      if (pickedRef.current || cancelRef.current) break;
      const ans = await listen();
      if (pickedRef.current || cancelRef.current) break;
      if (isYes(ans)) { setCandidates([]); return c.displayNumber; }
      // A fresh name (not yes/no/next) → re-rank against it.
      if (!isNo(ans) && ans.trim() && !/\bnext\b/i.test(ans)) { setCandidates([]); return resolveMatter(ans, attempt + 1); }
    }
    setCandidates([]);
    if (pickedRef.current) { const m = pickedRef.current; pickedRef.current = null; return m; }
    if (cancelRef.current) return undefined;
    if (attempt >= 3) return ranked[0].displayNumber; // never strand the user
    const again = await askField("None of those. Say the client's name again.");
    return resolveMatter(again, attempt + 1);
  }

  /** Tapping the check on a candidate selects it and stops the spoken walk. */
  function tapCandidate(displayNumber: string) {
    pickedRef.current = displayNumber;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }

  /** Plain prompt → one spoken answer (used inside matter resolution). */
  async function askField(prompt: string): Promise<string> {
    if (cancelRef.current) return "";
    return await listenForAnswerSpoken(prompt);
  }
  async function listenForAnswerSpoken(prompt: string): Promise<string> {
    speak(prompt);
    return await listenForAnswer(prompt);
  }

  /* --------------------------------------------------------- the main flow
   * The spoken workflow mirrors Time Tracker 1.0 exactly: three grouped parts —
   * (1) case/client + hourly rate, (2) date + time + category, (3) the note —
   * each read back with Correct/Incorrect, then an on-screen review the user
   * saves by hand. On a repeat "same case" entry, part 1 is skipped. */
  async function runEntry(initial: Slots, skipCase = false) {
    if (runningRef.current) return;
    runningRef.current = true; cancelRef.current = false;
    setOpen(true); setSaved(false); setCandidates([]); setHeard(""); setInterim("");
    const s: Slots = { date: todayISO(), nonBillable: false, rate: defaultRate, user: defaultUser, ...initial };
    setSlots({ ...s });
    const set = () => setSlots({ ...s });
    try {
      // Part 1 — the case/client and the hourly rate (skipped on a repeat).
      if (!skipCase) {
        await step({
          phase: "gather_core",
          prompt: "First, the case or client, and the hourly rate.",
          capture: async (text) => {
            // Rate: a money cue first, otherwise a plain number like "295".
            let work = text;
            const r0 = parseRate(text);
            if (r0 != null) { s.rate = r0; work = stripRate(text); }
            else { const b = parseBareRate(text); if (b) { s.rate = b.value; work = text.replace(b.raw, " "); } }
            const matterText = stripRate(work).trim();
            s.matter = await resolveMatter(matterText || text);
          },
          clear: () => { s.matter = undefined; s.rate = defaultRate; },
          readback: () => `the case as ${s.matter || "no case"}, at ${s.rate ?? defaultRate} dollars an hour`,
          sync: set,
        });
        if (cancelRef.current) return;
      }

      // Part 2 — the date, how long it took, and the category.
      await step({
        phase: "fill_category",
        prompt: skipCase ? "Same case. The date, how long it took, and the category." : "Next, the date, how long it took, and the category.",
        capture: (text) => {
          const h = parseHours(text); if (h != null) s.hours = h;
          const cat = matchCategory(text, categories); if (cat) s.category = cat;
          const d = parseDate(text); if (d) s.date = d;
          if (/non[- ]?billable|no charge|not billable/i.test(text)) s.nonBillable = true;
        },
        clear: () => { s.hours = undefined; s.category = undefined; s.date = todayISO(); },
        readback: () => `${s.hours ?? 0} hour${s.hours === 1 ? "" : "s"} of ${s.category || "no category"}, dated ${fullDate(s.date || todayISO())}`,
        sync: set,
      });
      if (cancelRef.current) return;

      // Part 3 — the activity note.
      await step({
        phase: "ask_note",
        prompt: "Last, the activity note.",
        capture: (text) => {
          const skip = !text.trim() || /^(?:no|none|skip|nope|nothing|that's all|no notes?)\.?$/i.test(text.trim());
          s.notes = skip ? "" : text.trim();
        },
        clear: () => { s.notes = undefined; },
        readback: () => (s.notes ? `the note as ${s.notes}` : "no note"),
        sync: set,
        longForm: true,
      });
      if (cancelRef.current) return;

      // Everything's editable on screen; invite a final look, then they Save.
      setPhase("confirm");
      speak("Here's what I have.");
    } finally {
      runningRef.current = false; setListening(false); setVerifying(false);
    }
  }

  /** Save the reviewed entry (the green Save button), then — like 1.0 — offer to
   *  keep going: "another entry?" and, if so, "same case or another case?" */
  async function saveReview() {
    if (!slots.matter || !slots.matter.trim()) { setStatus("Please choose a case before saving."); return; }
    const user = slots.user || defaultUser;
    const rate = slots.rate ?? defaultRate;
    const hoursR = fix(Math.ceil((slots.hours || 0) * 10) / 10, 1);
    const note = slots.notes ? createDesc(slots.category || "", slots.notes, user) : `${slots.category || ""} - ${user.split(" (")[0]} (${getUserRole(user)})`;
    onAdd({
      matter: slots.matter.trim(), entryDate: slots.date || todayISO(), activityDescription: "", note,
      price: fix(rate, 2), quantity: hoursR, activityUserName: user, nonBillable: !!slots.nonBillable,
    });
    const savedMatter = slots.matter.trim();
    const savedRate = rate;
    setSaved(true);
    setPhase("saved");

    // Offer to keep going. Hold the floor for the spoken follow-up Q&A.
    if (!supported) return;
    runningRef.current = true; cancelRef.current = false;
    try {
      await speak("Saved to your board.");
      if (cancelRef.current) return;
      const again = await askDecision("Do you want to make another entry?", { yes: "Yes", no: "No, all done", isAffirmative: isYes, isNegative: isNo });
      if (cancelRef.current) return;
      if (!again) { setVerifying(false); await speak("All set."); setStatus("All set."); return; }
      const sameCase = await askDecision("Is it the same case, or another case?", {
        yes: "Same case", no: "Another case",
        isAffirmative: (x) => /\b(same|this case|this one|that one|keep)\b/i.test(x),
        isNegative: (x) => /\b(another|different|new case|other|new one)\b/i.test(x),
      });
      if (cancelRef.current) return;
      setVerifying(false);
      runningRef.current = false; // runEntry takes the floor back
      resetEntryState();
      if (sameCase) await runEntry({ date: todayISO(), nonBillable: false, matter: savedMatter, rate: savedRate, user }, true);
      else await runEntry({ date: todayISO(), nonBillable: false, rate: defaultRate, user }, false);
    } finally {
      runningRef.current = false;
    }
  }

  function resetEntryState() {
    pickedRef.current = null;
    setCandidates([]); setHeard(""); setInterim(""); setSaved(false); setMicError(null);
    setSlots({ date: undefined, nonBillable: false, rate: defaultRate, user: defaultUser });
  }

  /** Explicitly ASK for the microphone. Chrome's SpeechRecognition does not
   *  reliably raise the standard "site wants to use your microphone" prompt, so
   *  we call getUserMedia inside the user's tap — that is what actually shows
   *  the prompt and, once granted, the page-level mic permission also covers
   *  SpeechRecognition. We release the device immediately (recognition opens its
   *  own), branch on the real DOMException name, and never dead-end: on any
   *  failure the typed form is right there. Returns true if the mic is usable. */
  async function primeMic(): Promise<boolean> {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setMicError("Voice needs a secure (https) connection. Open the site over https, or type the entry below — every field is editable.");
      return false;
    }
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return true; // very old browser — let SpeechRecognition try to self-manage
    setStatus("Starting the microphone…");
    try {
      const stream = await md.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // we only needed the grant + prompt
      setMicError(null);
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicError("Microphone access is blocked for this site. Click the mic/camera icon in the address bar (or open Site settings) and set Microphone to “Allow,” then tap the mic again. You can also just type the entry below.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setMicError("No microphone was found on this device. Type the entry below — every field is editable.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setMicError("The microphone is being used by another app. Close anything else using it, then tap the mic again — or type the entry below.");
      } else {
        setMicError("Couldn't start the microphone. Tap the mic to try again, or type the entry below — every field is editable.");
      }
      return false;
    }
  }

  async function start() {
    if (runningRef.current) return;
    if (!supported) {
      setOpen(true); setMicError("Voice input isn't supported in this browser. Use Chrome or Edge — or type the entry below; every field is editable and saves the same way.");
      setPhase("idle");
      return;
    }
    resetEntryState();
    setOpen(true);
    // Ask for the mic with a real user gesture (this is the call that prompts).
    const primed = await primeMic();
    if (!primed) { setPhase("idle"); return; } // typed form stays fully usable
    runEntry({});
  }

  function cancel() {
    cancelRef.current = true;
    pickedRef.current = null;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    decisionRef.current?.("next"); // release any pending step so the driver unwinds
    decisionRef.current = null;
    setVerifying(false);
    runningRef.current = false; setListening(false); setOpen(false);
    setCandidates([]); setInterim(""); setPhase("idle");
  }

  /* ----------------------------------------- manual save (typed fallback) */
  const PHASE_LABEL: Record<Phase, string> = {
    idle: "", gather_core: "Part 1 · case & rate", fill_client: "Part 1 · client",
    fill_date: "Part 2 · date", fill_category: "Part 2 · date, time & category", fill_time: "Part 2 · time",
    resolve_matter: "Finding the case", ask_note: "Part 3 · the note",
    confirm: "Review", edit_field: "Editing", saved: "Saved",
  };

  const upd = (patch: Partial<Slots>) => setSlots((p) => ({ ...p, ...patch }));
  const fieldClass = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] rounded-md px-2.5 py-1.5 text-sm focus:border-[var(--c-accent)] outline-none";
  const labelClass = "block text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)] mb-1";

  /* surface a docket / case number out of the matter Description, if present */
  const docketOf = (displayNumber?: string): string | null => {
    const d = descOf(displayNumber);
    const m = d.match(/\b(?:case|cause|docket)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i);
    return m ? m[1] : null;
  };

  return (
    <>
      <button
        onClick={start}
        title="Add a time entry by voice (4.0)"
        aria-label="Add a time entry by voice"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-[var(--c-accent)] text-[var(--c-on-accent)] shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <Mic size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
          <div className="bg-[var(--c-surface)] rounded-lg w-full max-w-md p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-[family-name:var(--font-display)] text-lg flex items-center gap-2">
                <Mic size={18} className="text-[var(--c-accent)]" /> Voice entry
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)] border border-[var(--c-border)] rounded px-1.5 py-0.5">4.0</span>
                {PHASE_LABEL[phase] && <span className="text-[10px] font-medium text-[var(--c-accent)]">{PHASE_LABEL[phase]}</span>}
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute the voice" : "Mute the voice"}
                  title={muted ? "Voice is muted — tap to turn it back on" : "Mute the spoken voice for this session"}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${muted ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-ink)]"}`}
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  {muted ? "Muted" : "Mute"}
                </button>
                <button onClick={cancel} aria-label="Close"><X size={18} className="text-[var(--c-ink-muted)]" /></button>
              </div>
            </div>

            <p className="text-sm min-h-[40px]">{status}</p>
            <p className="text-[11px] text-[var(--c-ink-muted)] -mt-1 mb-1">Say the client&apos;s name to find their case. Time can be &quot;half an hour,&quot; &quot;point five,&quot; or &quot;45 minutes.&quot;</p>
            <div className="mt-1 flex items-start gap-2 text-xs text-[var(--c-ink-muted)] min-h-[18px]">
              {listening
                ? <><Loader2 size={14} className="animate-spin mt-0.5 shrink-0" /> <span>{interim ? `“${interim}”` : "Listening…"}</span></>
                : heard ? `“${heard}”` : null}
            </div>

            {micError && (
              <div className="mt-3 rounded-md border border-[var(--c-error)] bg-[var(--c-error)]/10 px-3 py-2 text-xs text-[var(--c-ink)] leading-relaxed">
                {micError}
              </div>
            )}
            {!matters.length && (
              <div className="mt-3 rounded-md border border-[var(--c-accent)] bg-[var(--c-surface2)] px-3 py-2 text-xs leading-relaxed">
                No matters are loaded yet. Upload the Clio Matters CSV from the toolbar so cases can be matched by name.
              </div>
            )}

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

            {/* Green Correct / red Incorrect stay live for the whole step (§9). */}
            {verifying && candidates.length === 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => press(true)} className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-success)] px-4 py-3 text-base font-semibold text-white hover:opacity-90">
                  <Check size={18} /> {labels.yes}
                </button>
                <button onClick={() => press(false)} className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--c-error)] px-4 py-3 text-base font-semibold text-white hover:opacity-90">
                  <X size={18} /> {labels.no}
                </button>
              </div>
            )}

            {/* Every field is editable on the spot, the whole time. */}
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Case / client</label>
                <input list="vte4-matters" value={slots.matter ?? slots.rawClient ?? ""} onChange={(e) => upd({ matter: e.target.value, rawClient: e.target.value })} className={fieldClass} placeholder="Choose a case" />
                <datalist id="vte4-matters">{matters.map((m) => <option key={m.displayNumber} value={m.displayNumber}>{m.description}</option>)}</datalist>
                {descOf(slots.matter) && (
                  <div className="mt-1.5 rounded bg-[var(--c-surface2)] border border-[var(--c-accent)] px-2.5 py-2 text-xs leading-relaxed">
                    <div className="font-semibold mb-0.5">Case Description</div>
                    {docketOf(slots.matter) && <div className="mb-0.5"><span className="text-[var(--c-ink-muted)]">Case / docket no.:</span> {docketOf(slots.matter)}</div>}
                    <div className="text-[var(--c-ink-muted)]">{descOf(slots.matter)}</div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className={labelClass}>Activity user</label>
                  <select value={slots.user ?? defaultUser} onChange={(e) => upd({ user: e.target.value })} className={fieldClass}>
                    {activityUsers.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Hourly rate</label>
                  <input type="number" step="1" value={slots.rate ?? ""} onChange={(e) => upd({ rate: e.target.value === "" ? undefined : parseFloat(e.target.value) })} className={fieldClass} />
                </div>
                <label className="flex items-end gap-2 text-sm pb-1.5">
                  <input type="checkbox" checked={!!slots.nonBillable} onChange={(e) => upd({ nonBillable: e.target.checked })} className="accent-[var(--c-accent)]" />
                  Non-billable
                </label>
              </div>
              <div>
                <label className={labelClass}>Activity note</label>
                <textarea rows={3} value={slots.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })} className={fieldClass} placeholder="What was done" />
              </div>
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
            <p className="mt-2 text-[10px] text-[var(--c-ink-muted)] flex items-center gap-1"><Pencil size={10} /> Every field above is editable — fix anything by hand at any time.</p>
          </div>
        </div>
      )}
    </>
  );
}
