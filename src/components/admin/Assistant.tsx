"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send, Loader2, Trash2, Bot, User, AlertCircle, MessageSquare, FileText, Code2,
  Copy, Check, Download, Mic, MicOff, Volume2, VolumeX, AudioLines,
} from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "general" | "draft" | "code";

const MODE_META: Record<Mode, { label: string; icon: typeof MessageSquare; hint: string; empty: string }> = {
  general: {
    label: "General", icon: MessageSquare,
    hint: "Ask anything…  (Enter to send, Shift+Enter for a new line)",
    empty: "A balanced, all-purpose conversation. Ask questions, think through problems, summarize, explain.",
  },
  draft: {
    label: "Drafting", icon: FileText,
    hint: "Describe the document you need, or paste text to edit…",
    empty: "Letters, memos, clauses, emails, edits. You get a complete document back — copy it out or download it.",
  },
  code: {
    label: "Coding", icon: Code2,
    hint: "Describe what to build, or paste code to debug…",
    empty: "Write and debug code. Fenced, copyable code blocks; root-cause explanations with fixes.",
  },
};

/* ---------------- minimal SpeechRecognition typings (Chrome/Safari) -------- */
type SpeechAlt = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlt; length: number };
type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: SpeechResult } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
function makeRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "en-US";
  r.interimResults = true;
  r.continuous = false;
  return r;
}

/* ------------------------- message rendering ------------------------------ */

/** Split assistant text into prose and fenced ```code``` blocks. */
function splitBlocks(text: string): { type: "text" | "code"; lang: string; body: string }[] {
  const out: { type: "text" | "code"; lang: string; body: string }[] = [];
  const re = /```([\w+-]*)\n([\s\S]*?)```/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", lang: "", body: text.slice(last, m.index) });
    out.push({ type: "code", lang: m[1] || "", body: m[2] });
    last = m.index + m[0].length;
  }
  // An unclosed fence while streaming renders as code so it doesn't flash as prose.
  const rest = text.slice(last);
  const open = rest.indexOf("```");
  if (open >= 0) {
    if (open > 0) out.push({ type: "text", lang: "", body: rest.slice(0, open) });
    const after = rest.slice(open + 3);
    const nl = after.indexOf("\n");
    out.push({ type: "code", lang: nl >= 0 ? after.slice(0, nl) : "", body: nl >= 0 ? after.slice(nl + 1) : "" });
  } else if (rest) {
    out.push({ type: "text", lang: "", body: rest });
  }
  return out;
}

function CopyBtn({ text, title = "Copy", className = "" }: { text: string; title?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      title={title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${ok ? "text-green-500" : "text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"} ${className}`}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? "Copied" : title}
    </button>
  );
}

function AssistantBody({ content, mode }: { content: string; mode: Mode }) {
  const blocks = splitBlocks(content);
  return (
    <div className="min-w-0 space-y-2">
      {blocks.map((b, i) =>
        b.type === "code" ? (
          <div key={i} className="overflow-hidden rounded-md border border-[var(--c-border)] bg-[#16130f] text-[#e8e2d6]">
            <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1">
              <span className="text-[10px] uppercase tracking-wide opacity-60">{b.lang || "code"}</span>
              <CopyBtn text={b.body} className="!text-[#e8e2d6]/70 hover:!text-white" />
            </div>
            <pre className="overflow-x-auto p-3 text-xs leading-relaxed"><code>{b.body}</code></pre>
          </div>
        ) : (
          b.body.trim() && <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{b.body.trim()}</p>
        ),
      )}
      {mode === "draft" && content.trim() && (
        <div className="flex gap-2 pt-0.5">
          <CopyBtn text={content} title="Copy draft" />
          <button
            onClick={() => {
              const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `draft-${new Date().toISOString().slice(0, 10)}.txt`;
              document.body.appendChild(a); a.click(); a.remove();
              URL.revokeObjectURL(a.href);
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
          >
            <Download size={12} /> Download
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- main ------------------------------------- */

/**
 * The admin AI Assistant: three tools in one panel — General conversation,
 * Drafting, and Coding — each with its own history and server-side
 * instructions, plus voice: dictate into any mode, or a hands-free loop that
 * listens, sends, speaks the reply, and listens again. Browser speech engines
 * only (no extra services, no extra cost). Admin-only; never on the public site.
 */
export function Assistant({ configured, label }: { configured: boolean; label: string | null }) {
  const [mode, setMode] = useState<Mode>("general");
  const [threads, setThreads] = useState<Record<Mode, Msg[]>>({ general: [], draft: [], code: [] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice: dictation fills the box; voice-chat auto-sends and speaks replies.
  const [speechOk, setSpeechOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceChat, setVoiceChat] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const voiceChatRef = useRef(false);
  const busyRef = useRef(false);
  const speakRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const messages = threads[mode];

  useEffect(() => { setSpeechOk(makeRecognition() !== null); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [threads, busy, mode]);
  useEffect(() => { voiceChatRef.current = voiceChat; }, [voiceChat]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { speakRef.current = speakReplies; }, [speakReplies]);
  // Leaving the tab or switching modes stops any audio cleanly.
  useEffect(() => () => { recRef.current?.abort(); window.speechSynthesis?.cancel(); }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    const synth = window.speechSynthesis;
    if (!synth) { onDone?.(); return; }
    synth.cancel();
    // Strip code blocks — nobody wants a function read out loud.
    const clean = text.replace(/```[\s\S]*?```/g, " …code omitted… ").replace(/\s+/g, " ").trim();
    if (!clean) { onDone?.(); return; }
    const u = new SpeechSynthesisUtterance(clean.slice(0, 4000));
    u.rate = 1.05;
    u.onend = () => { setSpeaking(false); onDone?.(); };
    u.onerror = () => { setSpeaking(false); onDone?.(); };
    setSpeaking(true);
    synth.speak(u);
  }, []);

  const send = useCallback(async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;
    setError(null);
    const m = mode;
    const next: Msg[] = [...threads[m], { role: "user", content: text }];
    setThreads((t) => ({ ...t, [m]: [...next, { role: "assistant", content: "" }] }));
    setInput("");
    setBusy(true);

    let acc = "";
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, mode: m }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              const snapshot = acc;
              setThreads((th) => { const copy = th[m].slice(); copy[copy.length - 1] = { role: "assistant", content: snapshot }; return { ...th, [m]: copy }; });
            }
          } catch { /* keep-alive lines */ }
        }
      }
      if (!acc) setThreads((th) => { const copy = th[m].slice(); copy[copy.length - 1] = { role: "assistant", content: "(No response.)" }; return { ...th, [m]: copy }; });
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
      setThreads((th) => { const copy = th[m].slice(); if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop(); return { ...th, [m]: copy }; });
    } finally {
      setBusy(false);
    }
    // "Read replies aloud" for typed exchanges; the voice-chat loop does its
    // own speaking so it can chain back into listening.
    if (acc && speakRef.current && !voiceChatRef.current) speak(acc);
    return acc;
  }, [input, mode, threads, speak]);

  /** One listening pass. In voice-chat the final transcript auto-sends, the
   *  reply is spoken, and we listen again — a hands-free conversation. */
  const listenOnce = useCallback(() => {
    const rec = makeRecognition();
    if (!rec) return;
    recRef.current?.abort();
    recRef.current = rec;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((finalText + interim).trimStart());
    };
    rec.onerror = () => { setListening(false); setVoiceChat(false); };
    rec.onend = async () => {
      setListening(false);
      const text = finalText.trim();
      if (!voiceChatRef.current) return; // plain dictation: leave it in the box
      if (!text) { setVoiceChat(false); return; } // silence ends the session
      setInput("");
      const reply = await send(text);
      if (!voiceChatRef.current) return;
      speak(reply || "", () => { if (voiceChatRef.current) listenOnce(); });
    };
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }, [send, speak]);

  function toggleDictation() {
    if (listening) { recRef.current?.stop(); return; }
    setVoiceChat(false);
    listenOnce();
  }
  function toggleVoiceChat() {
    if (voiceChat) { setVoiceChat(false); recRef.current?.abort(); window.speechSynthesis?.cancel(); setSpeaking(false); setListening(false); return; }
    setSpeakReplies(true);
    setVoiceChat(true);
    voiceChatRef.current = true;
    listenOnce();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  if (!configured) {
    return (
      <div className="max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-800 dark:text-amber-200">
        <div className="mb-2 flex items-center gap-2 font-semibold"><AlertCircle size={16} /> The assistant isn&apos;t connected yet</div>
        <p className="leading-relaxed">
          It&apos;s built and ready — it just needs a model to talk to. In the hosting environment
          (Vercel → Project → Settings → Environment Variables), set:
        </p>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          <li><strong>AI_BASE_URL</strong> — e.g. <code>https://api.together.xyz/v1</code></li>
          <li><strong>AI_API_KEY</strong> — your provider key (kept server-side)</li>
          <li><strong>AI_MODEL</strong> — e.g. <code>meta-llama/Llama-3.3-70B-Instruct-Turbo</code></li>
          <li><strong>AI_MODEL_LABEL</strong> — optional friendly name</li>
        </ul>
        <p className="mt-3 leading-relaxed">Redeploy after saving them and this tab lights up. Nothing here is on the public site.</p>
      </div>
    );
  }

  const meta = MODE_META[mode];
  return (
    <div className="flex h-[calc(100vh-11rem)] max-w-4xl flex-col rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      {/* Header: the three tools + voice + model chip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--c-border)]">
          {(Object.keys(MODE_META) as Mode[]).map((m) => {
            const Icon = MODE_META[m].icon;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${m !== "general" ? "border-l border-[var(--c-border)]" : ""} ${mode === m ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"}`}
              >
                <Icon size={13} /> {MODE_META[m].label}
                {threads[m].length > 0 && mode !== m && <span className="rounded-full bg-[var(--c-surface2)] px-1 text-[9px]">{threads[m].length}</span>}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {speechOk && (
            <button
              onClick={toggleVoiceChat}
              title={voiceChat ? "End the voice conversation" : "Voice conversation — talk back and forth, hands-free"}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${voiceChat ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}`}
            >
              <AudioLines size={13} className={voiceChat ? "animate-pulse" : ""} /> {voiceChat ? (speaking ? "Speaking…" : listening ? "Listening…" : "Voice on") : "Voice"}
            </button>
          )}
          <button
            onClick={() => { setSpeakReplies((v) => { if (v) { window.speechSynthesis?.cancel(); setSpeaking(false); } return !v; }); }}
            title={speakReplies ? "Stop reading replies aloud" : "Read replies aloud"}
            className={`rounded-md border border-[var(--c-border)] p-1.5 ${speakReplies ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"}`}
          >
            {speakReplies ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          {label && <span className="hidden rounded bg-[var(--c-surface2)] px-1.5 py-0.5 text-[10px] text-[var(--c-ink-muted)] sm:inline">{label}</span>}
          {messages.length > 0 && (
            <button onClick={() => { setThreads((t) => ({ ...t, [mode]: [] })); setError(null); }} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--c-ink-muted)] hover:text-red-600" title={`Clear the ${meta.label} conversation`}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center text-sm text-[var(--c-ink-muted)]">
            <meta.icon size={28} className="mx-auto mb-2 text-[var(--c-accent)]/60" />
            <p className="font-medium text-[var(--c-ink)]">{meta.label}</p>
            <p className="mt-1 leading-relaxed">{meta.empty}</p>
            {speechOk && <p className="mt-3 text-xs">Tip: the mic dictates into the box; <strong>Voice</strong> is a hands-free back-and-forth.</p>}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-surface2)] text-[var(--c-accent)]"}`}>
              {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </span>
            <div className={`min-w-0 max-w-[88%] rounded-lg px-3 py-2 ${m.role === "user" ? "whitespace-pre-wrap bg-[var(--c-accent)] text-sm leading-relaxed text-white" : "bg-[var(--c-bg)] text-[var(--c-ink)]"}`}>
              {m.role === "assistant"
                ? (m.content ? <AssistantBody content={m.content} mode={mode} /> : (busy && i === messages.length - 1 ? <Loader2 size={14} className="animate-spin" /> : null))
                : m.content}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
        </p>
      )}

      <div className="border-t border-[var(--c-border)] p-3">
        <div className="flex items-end gap-2">
          {speechOk && (
            <button
              onClick={toggleDictation}
              disabled={voiceChat}
              title={listening && !voiceChat ? "Stop dictating" : "Dictate into the box"}
              className={`rounded-md border p-2.5 ${listening && !voiceChat ? "border-red-500 bg-red-500/10 text-red-600" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"} disabled:opacity-40`}
            >
              {listening && !voiceChat ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={voiceChat ? "Voice conversation is on — just talk…" : meta.hint}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-y rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
          />
          <button onClick={() => void send()} disabled={busy || !input.trim()} className="btn btn-accent inline-flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
