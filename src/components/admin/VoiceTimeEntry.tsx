"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import { Mic, X, Loader2, Check } from "lucide-react";
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
  const cancelRef = useRef(false);
  const recRef = useRef<any>(null);
  const runningRef = useRef(false);

  const supported = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && Boolean(window.speechSynthesis);

  function speak(text: string): Promise<void> {
    setStatus(text);
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
  const isSkip = (s: string) => !s.trim() || /\b(no|none|skip|nope|nothing|that's all)\b/i.test(s);

  // ---- matter matching against the uploaded Clio matters ----
  const STOP = new Set(["the", "and", "for", "matter", "client", "case", "file", "our"]);
  const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const mToks = (m: string) => m.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  /** Top candidate matters for spoken text, ranked, each with whether it covers
   *  every spoken word (a strong/confident signal). */
  function rankMatters(spoken: string): { matter: string; score: number; coversAll: boolean }[] {
    const st = toks(spoken);
    if (!st.length) return [];
    return matters
      .map((m) => {
        const mt = mToks(m);
        const hits = st.filter((t) => mt.some((w) => w.includes(t) || t.includes(w)));
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

  /** Resolve the matter conversationally: use a single sure hit; otherwise walk
   *  the top candidates ("Did you mean …?"); if none fit, ask them to repeat. */
  async function resolveMatter(spoken: string, attempt = 1): Promise<string | undefined> {
    if (cancelRef.current) return undefined;
    const ranked = rankMatters(spoken);
    if (ranked.length === 0) {
      if (attempt >= 3) return spoken.trim() || undefined;
      const again = await ask("I couldn't find that one. Please say the matter or client name again.", (x) => x.trim(), true);
      return resolveMatter(again ?? "", attempt + 1);
    }
    const covering = ranked.filter((r) => r.coversAll);
    if (covering.length === 1) return covering[0].matter; // 100% sure
    const order = [...covering, ...ranked.filter((r) => !r.coversAll)].slice(0, 5);
    for (const r of order) {
      if (cancelRef.current) return undefined;
      await speak(`Did you mean ${r.matter}?`);
      const ans = await listen();
      if (cancelRef.current) return undefined;
      if (isYes(ans)) return r.matter;
      if (!isNo(ans) && ans.trim() && !/\bnext\b/i.test(ans)) {
        // They said a different name instead of yes/no — re-resolve on that.
        return resolveMatter(ans, attempt + 1);
      }
    }
    if (attempt >= 3) return spoken.trim() || undefined;
    const again = await ask("None of those matched. Please say the matter or client name again.", (x) => x.trim(), true);
    return resolveMatter(again ?? "", attempt + 1);
  }

  function parseInitial(s: string): Slots {
    const out: Slots = {};
    const h = parseHours(s); if (h != null) out.hours = h;
    const cat = matchCategory(s, true); if (cat) out.category = cat;
    const mt = confidentMatter(s); if (mt) out.matter = mt;
    if (/non[- ]?billable|no charge|not billable/i.test(s)) out.nonBillable = true;
    if (/yesterday/i.test(s)) out.date = yesterdayISO();
    // Capture the note: an explicit "note …", otherwise whatever description is
    // left after removing the time/category/billing words they rattled off.
    const note = extractNoteValue(s) || noteFromDump(s, out.category);
    if (note) out.notes = note;
    return out;
  }

  /** Pull a note value when the speaker explicitly flags it ("the note is …"). */
  function extractNoteValue(t: string): string {
    const m = t.match(/notes?\s+(?:should (?:be|say|read)|that says|saying|reads?|is|are|to be|to|of|:)\s*(.+)/i);
    return m ? m[1].trim() : "";
  }

  /** The leftover description after stripping the recognized fields. */
  function noteFromDump(s: string, category?: string): string {
    let n = " " + s + " ";
    const rm = (re: RegExp) => { n = n.replace(re, " "); };
    rm(/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\b/gi);
    rm(/\b(?:a |an |one )?half(?: an?)? hour\b/gi);
    rm(/\bquarter(?: of an)? hour\b/gi);
    rm(/\bpoint\s+\w+(?:\s+\w+)?\b/gi);
    rm(/\b\d+\s*\/\s*10\b/gi);
    rm(/\b(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+tenths?\b/gi);
    rm(/\bnon[- ]?billable\b/gi); rm(/\bno charge\b/gi); rm(/\byesterday\b/gi);
    if (category) rm(new RegExp("\\b" + category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"));
    rm(/\bnotes?\b/gi);
    n = n.replace(/\s{2,}/g, " ").trim();
    n = n.replace(/^(?:and|for|of|on|the|um|uh|so|then|with|a|an)\b\s*/i, "").trim();
    n = n.replace(/[\s,]+$/, "");
    return n.split(/\s+/).filter(Boolean).length >= 2 ? n : "";
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

  function summaryText(s: Slots): string {
    const dateLabel = s.date && s.date !== todayISO() ? "yesterday" : "today";
    const parts = [
      `${s.hours ?? 0} hour${s.hours === 1 ? "" : "s"}`,
      `of ${s.category || "no category"}`,
      `on ${s.matter || "no matter"}`,
    ];
    if (s.notes) parts.push(`note: ${s.notes}`);
    parts.push(s.nonBillable ? "non-billable" : "billable");
    parts.push(`dated ${dateLabel}`);
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
      await speak("Go ahead. Describe the time entry.");
      const s: Slots = parseInitial(await listen());
      set(s);
      if (cancelRef.current) return;

      if (!s.matter) {
        const spoken = (await ask("Which matter or client?", (x) => x.trim())) ?? "";
        if (cancelRef.current) return;
        s.matter = await resolveMatter(spoken);
        set(s);
      }
      if (cancelRef.current) return;
      if (s.hours == null) { s.hours = await ask("How long did it take?", parseHours); set(s); }
      if (cancelRef.current) return;
      if (!s.category) { s.category = matchCategory((await ask("What category?", (x) => x.trim())) ?? "", false); set(s); }
      if (cancelRef.current) return;
      if (s.notes == null) { const n = await ask("Any notes? Say skip if none.", (x) => x, false); s.notes = isSkip(n ?? "") ? "" : (n ?? ""); set(s); }
      if (cancelRef.current) return;

      const user = defaultUser;
      let confirmed = false;
      for (let i = 0; i < 6 && !cancelRef.current; i++) {
        const ans = (await ask(`${summaryText(s)}. Is that correct?`, (x) => x, true)) ?? "";
        if (cancelRef.current) return;
        if (isYes(ans)) { confirmed = true; break; }
        if (/\b(cancel|discard|delete it|throw it out|never mind|forget it|start over|scrap)\b/i.test(ans)) {
          await speak("Okay, discarded.");
          setStatus("Discarded.");
          return;
        }
        // Anything else is treated as an edit request, not a discard.
        await applyEdit(s, ans);
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
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    runningRef.current = false; setListening(false); setOpen(false);
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
              <button onClick={cancel} aria-label="Close"><X size={18} className="text-[var(--c-ink-muted)]" /></button>
            </div>
            <p className="text-sm min-h-[40px]">{status}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--c-ink-muted)] min-h-[18px]">
              {listening ? <><Loader2 size={14} className="animate-spin" /> Listening…</> : heard ? `“${heard}”` : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {([["Matter", slots.matter], ["Hours", slots.hours], ["Category", slots.category], ["Notes", slots.notes], ["Non-billable", slots.nonBillable ? "Yes" : ""]] as [string, unknown][])
                .map(([k, v]) => (v ? <div key={k}><span className="text-[var(--c-ink-muted)]">{k}: </span>{String(v)}</div> : null))}
            </div>
            {saved && <p className="mt-4 text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Added to your board.</p>}
            <div className="mt-5 flex justify-end">
              <button onClick={cancel} className="btn btn-outline text-sm py-2 px-4">{saved ? "Close" : "Cancel"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
