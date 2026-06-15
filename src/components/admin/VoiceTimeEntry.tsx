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
    let m: RegExpMatchArray | null;
    if ((m = t.match(/(\d+)\s*(?:and a half|½)\s*hours?/))) return parseInt(m[1]) + 0.5;
    if (/(?:^|\s)(?:a |an )?half(?: an?)? hour/.test(t)) return 0.5;
    if (/quarter (?:of an )?hour/.test(t)) return 0.25;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/))) return parseFloat(m[1]);
    if ((m = t.match(/(\d+)\s*(?:minutes?|mins?)\b/))) return parseInt(m[1]) / 60;
    if (/\b(?:an|one)\s+hour\b/.test(t)) return 1;
    if ((m = t.match(/^\s*(\d+(?:\.\d+)?)\s*$/))) return parseFloat(m[1]);
    return undefined;
  }
  function matchMatter(s: string, strict: boolean): string | undefined {
    const t = s.toLowerCase().trim();
    if (!t) return undefined;
    let best: string | null = null, bestScore = 0;
    for (const mt of matters) {
      const words = mt.toLowerCase().split(/[\s\-_,/]+/).filter((w) => w.length > 2);
      let score = 0;
      for (const w of words) if (t.includes(w)) score++;
      if (score > bestScore) { bestScore = score; best = mt; }
    }
    if (bestScore > 0) return best!;
    return strict ? undefined : s.trim();
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
  const isSkip = (s: string) => !s.trim() || /\b(no|none|skip|nope|nothing|that's all)\b/i.test(s);

  function parseInitial(s: string): Slots {
    const out: Slots = {};
    const h = parseHours(s); if (h != null) out.hours = h;
    const cat = matchCategory(s, true); if (cat) out.category = cat;
    const mt = matchMatter(s, true); if (mt) out.matter = mt;
    if (/non[- ]?billable|no charge|not billable/i.test(s)) out.nonBillable = true;
    if (/yesterday/i.test(s)) out.date = yesterdayISO();
    const nm = s.match(/notes?\s+(?:that says\s+|saying\s+|is\s+|of\s+)?(.+)$/i);
    if (nm) out.notes = nm[1].trim();
    return out;
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

      if (!s.matter) { s.matter = matchMatter((await ask("Which matter or client?", (x) => x.trim())) ?? "", false); set(s); }
      if (cancelRef.current) return;
      if (s.hours == null) { s.hours = await ask("How long did it take?", parseHours); set(s); }
      if (cancelRef.current) return;
      if (!s.category) { s.category = matchCategory((await ask("What category?", (x) => x.trim())) ?? "", false); set(s); }
      if (cancelRef.current) return;
      if (s.notes == null) { const n = await ask("Any notes? Say skip if none.", (x) => x, false); s.notes = isSkip(n ?? "") ? "" : (n ?? ""); set(s); }
      if (cancelRef.current) return;

      const user = defaultUser;
      const dateLabel = s.date && s.date !== todayISO() ? "yesterday" : "today";
      const summary = `${s.hours ?? 0} hour${s.hours === 1 ? "" : "s"} of ${s.category || "no category"} on ${s.matter || "no matter"}${s.nonBillable ? ", non-billable" : ""}, dated ${dateLabel}. Is that correct?`;
      const ans = (await ask(summary, (x) => x, true)) ?? "";
      if (cancelRef.current) return;

      if (isYes(ans)) {
        const rate = activityUsers.find((u) => u.name === user)?.rate ?? 145;
        const hoursR = fix(Math.ceil((s.hours || 0) * 10) / 10, 1);
        const note = s.notes ? createDesc(s.category || "", s.notes, user) : `${s.category || ""} - ${user.split(" (")[0]} (${getUserRole(user)})`;
        onAdd({
          matter: s.matter || "", entryDate: s.date || todayISO(), activityDescription: "", note,
          price: fix(rate, 2), quantity: hoursR, activityUserName: user, nonBillable: !!s.nonBillable,
        });
        setSaved(true);
        await speak("Saved to your board.");
      } else {
        await speak("Okay, discarded.");
        setStatus("Discarded.");
      }
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
