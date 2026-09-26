"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send, Loader2, Trash2, Bot, User, AlertCircle, MessageSquare, FileText, Code2,
  Copy, Check, Download, Mic, MicOff, Volume2, VolumeX, AudioLines, History,
  Plus, Pencil, Square, RefreshCw, X, Scale, Activity, Power, Share2, Settings2,
} from "lucide-react";
import {
  listAssistantThreads, getAssistantThread, renameAssistantThread, deleteAssistantThread,
  getAssistantSettings, saveAssistantPrefs, deleteAssistantMemory, listShareTargets, shareAssistantThread,
  type ThreadRow, type MemoryRow, type ShareTarget,
} from "@/app/admin/(panel)/assistant/actions";

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "general" | "draft" | "code";

/** Live state of the firm's rented GPU server, from /api/admin/ai-server. */
type ServerInfo = {
  configured: boolean;
  state?: "ready" | "starting" | "stopped" | "missing" | "error";
  costPerHr?: number;
  podCostPerHr?: number;
  gpu?: string;
  balance?: number | null;
  monthUsd?: number;
  idleMinutes?: number;
  autoSleep?: boolean;
  error?: string;
};

const MODE_META: Record<Mode, { label: string; icon: typeof MessageSquare; hint: string; empty: string; starters: string[] }> = {
  general: {
    label: "General", icon: MessageSquare,
    hint: "Ask AI.fred anything…  (Enter to send, Shift+Enter for a new line)",
    empty: "AI.fred, at your service — questions, research, and the firm's own systems: cases, discovery, exhibits, deadlines, intake. It can also show you around this admin panel.",
    starters: [
      "Give me a status report on a case — I'll give you the matter number",
      "What deadlines does the firm have coming up in the next 30 days?",
      "Summarize the key points of the text I'm about to paste",
    ],
  },
  draft: {
    label: "Drafting", icon: FileText,
    hint: "Describe the document you need, or paste text to edit…",
    empty: "Letters, memos, clauses, emails, edits. You get a complete document back — copy it out or download it. Attach a case and it pulls the real style, court, and parties.",
    starters: [
      "Draft a professional letter — I'll give you the details",
      "Draft a letter to opposing counsel in one of our cases — I'll give the matter number",
      "Tighten and polish the paragraph I'm about to paste",
    ],
  },
  code: {
    label: "Coding", icon: Code2,
    hint: "Describe what to build, or paste code to debug…",
    empty: "Write and debug code. Fenced, copyable code blocks; root-cause explanations with fixes.",
    starters: [
      "Write a function that — I'll describe what it should do",
      "Debug this error — I'll paste the code and the message",
      "Explain what a piece of code does, line by line",
    ],
  },
};
const MODE_ICON: Record<string, typeof MessageSquare> = { general: MessageSquare, draft: FileText, code: Code2 };

/** Compact "2h ago"-style stamp for the history rail. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

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

/** Inline markdown: **bold**, *italic*, `code`, [links](/safe/urls). */
function inlineMd(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={out.length} className="font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={out.length} className="rounded bg-[var(--c-surface-2)] px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
      if (lm) out.push(<a key={out.length} href={lm[2]} target={lm[2].startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="font-medium text-[var(--c-accent)] underline underline-offset-2">{lm[1]}</a>);
      else out.push(t);
    } else out.push(<em key={out.length}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const MD_TABLE_LINE = /^\s*\|.*\|\s*$/;
const MD_TABLE_SEP = /^\s*\|[\s:|-]+\|\s*$/;
const MD_LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;
const MD_HEADING = /^(#{1,4})\s+(.*)$/;
const MD_RULE = /^\s*([-_*])\1{2,}\s*$/;

/**
 * Render the model's markdown as real formatting — bold, tables, lists,
 * headings — instead of raw ** and | characters. Small on purpose: it covers
 * what chat replies actually use, with plain text as the safe fallback.
 */
function MarkdownText({ body }: { body: string }) {
  const lines = body.replace(/<br\s*\/?>/gi, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (MD_TABLE_LINE.test(line)) {
      const rows: string[][] = [];
      let sawSep = false;
      while (i < lines.length && MD_TABLE_LINE.test(lines[i])) {
        if (MD_TABLE_SEP.test(lines[i])) { sawSep = true; i++; continue; }
        rows.push(lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
        i++;
      }
      const head = sawSep && rows.length > 1 ? rows[0] : null;
      const bodyRows = head ? rows.slice(1) : rows;
      nodes.push(
        <div key={key++} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {head && (
              <thead>
                <tr>{head.map((c, ci) => <th key={ci} className="border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-left font-semibold">{inlineMd(c)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-[var(--c-border)] px-2.5 py-1.5 align-top">{inlineMd(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const h = MD_HEADING.exec(line);
    if (h) {
      nodes.push(<p key={key++} className={`font-semibold leading-snug ${h[1].length <= 2 ? "text-base" : "text-sm"}`}>{inlineMd(h[2].trim())}</p>);
      i++;
      continue;
    }

    if (MD_RULE.test(line)) {
      nodes.push(<hr key={key++} className="border-[var(--c-border)]" />);
      i++;
      continue;
    }

    if (MD_LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && MD_LIST_ITEM.test(lines[i])) {
        items.push(lines[i].replace(MD_LIST_ITEM, "").trim());
        i++;
      }
      const cls = "space-y-1 pl-5 text-sm leading-relaxed";
      nodes.push(
        ordered
          ? <ol key={key++} className={`list-decimal ${cls}`}>{items.map((t, ti) => <li key={ti}>{inlineMd(t)}</li>)}</ol>
          : <ul key={key++} className={`list-disc ${cls}`}>{items.map((t, ti) => <li key={ti}>{inlineMd(t)}</li>)}</ul>,
      );
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !MD_TABLE_LINE.test(lines[i]) && !MD_HEADING.test(lines[i]) && !MD_LIST_ITEM.test(lines[i]) && !MD_RULE.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    nodes.push(<p key={key++} className="whitespace-pre-wrap text-sm leading-relaxed">{inlineMd(para.join("\n"))}</p>);
  }
  return <div className="min-w-0 space-y-2">{nodes}</div>;
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

/** Download an AI.fred reply as a real Word document. */
function WordBtn({ content, title }: { content: string; title?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/admin/assistant/docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, title }),
          });
          if (!res.ok) return;
          const blob = await res.blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = (res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]) ?? "AIfred-draft.docx";
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(a.href);
        } finally {
          setBusy(false);
        }
      }}
      title="Download as a Word document (.docx)"
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Word (.docx)
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
          b.body.trim() && <MarkdownText key={i} body={b.body.trim()} />
        ),
      )}
      {content.trim() && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <CopyBtn text={content} title={mode === "draft" ? "Copy draft" : "Copy"} />
          <WordBtn content={content} title={mode === "draft" ? "Draft" : "AI.fred reply"} />
          {mode === "draft" && (
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
              <Download size={12} /> Plain text
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- main ------------------------------------- */

/**
 * The admin AI Assistant: three tools in one panel — General conversation,
 * Drafting, and Coding — each with its own history and server-side
 * instructions. Conversations save to the firm's own database (resume any
 * time from the History rail), replies can be stopped mid-stream and
 * regenerated, and voice works two ways: dictation, or a hands-free loop that
 * listens, sends, speaks the reply, and listens again. Browser speech engines
 * only. Admin-only; never on the public site.
 */
export function Assistant({ configured, label, initialThreads, saveable, codeAllowed = true, matters = [] }: {
  configured: boolean; label: string | null; initialThreads: ThreadRow[]; saveable: boolean;
  /** Whether this account holds the Coding-tool grant (owners always do). */
  codeAllowed?: boolean;
  /** Matter numbers from the Matters/Cases hub, for the attach-a-case picker. */
  matters?: string[];
}) {
  const [mode, setMode] = useState<Mode>("general");
  // A case attached to the conversation: the model treats "the case" as this
  // matter and pulls its real details through the firm-data tools.
  const [caseMatter, setCaseMatter] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  // "Test connection": pings the configured AI endpoint and reports back —
  // reachability, speed, and whether firm-data tool calling is supported.
  // The GPU server's power strip: live state, costs, and the on/off switch.
  const [srv, setSrv] = useState<ServerInfo | null>(null);
  const [srvBusy, setSrvBusy] = useState(false);
  const srvStateRef = useRef<string | undefined>(undefined);
  useEffect(() => { srvStateRef.current = srv?.state; }, [srv]);

  const refreshServer = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-server");
      if (res.ok) setSrv(await res.json());
    } catch { /* keep last known */ }
  }, []);

  useEffect(() => {
    void refreshServer();
    // Poll gently; faster while the server is waking so the strip flips to
    // Ready without a manual refresh.
    const slow = setInterval(() => { if (srvStateRef.current !== "starting") void refreshServer(); }, 30000);
    const fast = setInterval(() => { if (srvStateRef.current === "starting") void refreshServer(); }, 8000);
    return () => { clearInterval(slow); clearInterval(fast); };
  }, [refreshServer]);

  const powerAction = useCallback(async (action: "start" | "stop") => {
    setSrvBusy(true);
    try {
      const res = await fetch("/api/admin/ai-server", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error || "Server control failed.");
      else setSrv((s) => (s ? { ...s, state: action === "start" ? "starting" : "stopped", costPerHr: action === "start" ? s.podCostPerHr : 0 } : s));
    } catch {
      setError("Couldn't reach the server controls.");
    } finally {
      setSrvBusy(false);
      setTimeout(() => void refreshServer(), 1500);
    }
  }, [refreshServer]);

  const saveIdle = useCallback(async (value: string) => {
    const autoSleep = value !== "off";
    const idleMinutes = autoSleep ? Number(value) : undefined;
    setSrv((s) => (s ? { ...s, autoSleep, ...(idleMinutes ? { idleMinutes } : {}) } : s));
    try {
      await fetch("/api/admin/ai-server", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "config", autoSleep, ...(idleMinutes ? { idleMinutes } : {}) }) });
    } catch { /* next refresh corrects */ }
  }, []);

  // Preferences & memories dialog (the gear).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsAbout, setPrefsAbout] = useState("");
  const [prefsStyle, setPrefsStyle] = useState("");
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [fullAdmin, setFullAdmin] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    setPrefsSaved(false);
    try {
      const r = await getAssistantSettings();
      setPrefsAbout(r.prefs.about);
      setPrefsStyle(r.prefs.style);
      setMemories(r.memories);
      setFullAdmin(r.fullAdmin);
    } catch { /* dialog still usable */ }
  }, []);

  const savePrefs = useCallback(async () => {
    setPrefsBusy(true);
    try {
      const r = await saveAssistantPrefs({ about: prefsAbout, style: prefsStyle });
      setPrefsSaved(r.ok);
    } finally {
      setPrefsBusy(false);
    }
  }, [prefsAbout, prefsStyle]);

  const forgetMemory = useCallback(async (id: number) => {
    setMemories((m) => m.filter((x) => x.id !== id));
    await deleteAssistantMemory(id);
  }, []);

  // Share-a-chat dialog.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([]);
  const [shareQuery, setShareQuery] = useState("");
  const [shareSel, setShareSel] = useState<string[]>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const openShare = useCallback(async () => {
    setShareOpen(true);
    setShareNote(null);
    setShareSel([]);
    setShareQuery("");
    try { setShareTargets(await listShareTargets()); } catch { /* empty list renders */ }
  }, []);

  const [healthBusy, setHealthBusy] = useState(false);
  const [health, setHealth] = useState<{
    configured: boolean; reachable: boolean; latencyMs?: number | null; model?: string;
    baseUrlHost?: string; toolSupport?: boolean | null; firmDataReady?: boolean;
    dbConfigured?: boolean; errorDetail?: string; note?: string;
  } | null>(null);

  const testConnection = useCallback(async () => {
    setHealthBusy(true);
    setHealth(null);
    try {
      const res = await fetch("/api/admin/assistant/health", { method: "POST" });
      setHealth(await res.json());
    } catch {
      setHealth({ configured: true, reachable: false, errorDetail: "The test request itself failed — check your connection and try again." });
    } finally {
      setHealthBusy(false);
    }
  }, []);
  const [threads, setThreads] = useState<Record<Mode, Msg[]>>({ general: [], draft: [], code: [] });
  const [threadIds, setThreadIds] = useState<Record<Mode, number | null>>({ general: null, draft: null, code: null });

  const doShare = useCallback(async () => {
    const tid = threadIds[mode];
    if (tid == null || !shareSel.length) return;
    setShareBusy(true);
    try {
      const r = await shareAssistantThread(tid, shareSel);
      setShareNote(r.ok ? `Shared with ${r.shared} ${r.shared === 1 ? "person" : "people"}.` : (r.error ?? "Couldn't share."));
      if (r.ok) setShareSel([]);
    } finally {
      setShareBusy(false);
    }
  }, [threadIds, mode, shareSel]);

  const [history, setHistory] = useState<ThreadRow[]>(initialThreads);
  const [histOpen, setHistOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
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
  const abortRef = useRef<AbortController | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const messages = threads[mode];

  useEffect(() => { setSpeechOk(makeRecognition() !== null); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [threads, busy, mode]);
  useEffect(() => { voiceChatRef.current = voiceChat; }, [voiceChat]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { speakRef.current = speakReplies; }, [speakReplies]);
  // Leaving the tab or switching modes stops any audio cleanly.
  useEffect(() => () => { recRef.current?.abort(); window.speechSynthesis?.cancel(); abortRef.current?.abort(); }, []);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await listAssistantThreads()); } catch { /* keep current */ }
  }, []);

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

  /** Send `history` (already ending in a user turn) and stream the reply. */
  const run = useCallback(async (m: Mode, next: Msg[], regen: boolean) => {
    setError(null);
    setThreads((t) => ({ ...t, [m]: [...next, { role: "assistant", content: "" }] }));
    setBusy(true);

    let acc = "";
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, mode: m, threadId: threadIds[m], regen, matter: caseMatter.trim() || undefined }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status}).`);
      }
      const tid = Number(res.headers.get("X-Thread-Id"));
      if (Number.isFinite(tid) && tid > 0 && threadIds[m] !== tid) setThreadIds((t) => ({ ...t, [m]: tid }));

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
            // Firm-data lookups in progress ("Reading the exhibit list…").
            if (typeof json.tool_status === "string") { setToolStatus(json.tool_status || null); continue; }
            if (typeof json.stream_error === "string") { setError(json.stream_error); continue; }
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              setToolStatus(null);
              acc += delta;
              const snapshot = acc;
              setThreads((th) => { const copy = th[m].slice(); copy[copy.length - 1] = { role: "assistant", content: snapshot }; return { ...th, [m]: copy }; });
            }
          } catch { /* keep-alive lines */ }
        }
      }
      if (!acc) setThreads((th) => { const copy = th[m].slice(); copy[copy.length - 1] = { role: "assistant", content: "(No response.)" }; return { ...th, [m]: copy }; });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // Stopped on purpose — keep whatever streamed in; drop an empty bubble.
        if (!acc) setThreads((th) => { const copy = th[m].slice(); if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop(); return { ...th, [m]: copy }; });
      } else {
        setError((e as Error).message || "Something went wrong.");
        setThreads((th) => { const copy = th[m].slice(); if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop(); return { ...th, [m]: copy }; });
      }
    } finally {
      setBusy(false);
      setToolStatus(null);
      abortRef.current = null;
    }
    if (saveable) void refreshHistory();
    // "Read replies aloud" for typed exchanges; the voice-chat loop does its
    // own speaking so it can chain back into listening.
    if (acc && speakRef.current && !voiceChatRef.current) speak(acc);
    return acc;
  }, [threadIds, saveable, refreshHistory, speak, caseMatter]);

  const send = useCallback(async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;
    // Asleep server: don't burn the message — point at the power switch.
    if (srv?.configured && (srv.state === "stopped" || srv.state === "starting")) {
      setError(srv.state === "stopped"
        ? "The AI server is asleep. Press the power button above to wake it (about 3 minutes), then send again."
        : "The AI server is still waking up — give it a couple of minutes, then send again.");
      return;
    }
    setInput("");
    return run(mode, [...threads[mode], { role: "user", content: text }], false);
  }, [input, mode, threads, run, srv]);

  const regenerate = useCallback(() => {
    if (busyRef.current) return;
    const cur = threads[mode];
    const trimmed = cur[cur.length - 1]?.role === "assistant" ? cur.slice(0, -1) : cur;
    if (!trimmed.length || trimmed[trimmed.length - 1].role !== "user") return;
    void run(mode, trimmed, true);
  }, [mode, threads, run]);

  const stop = () => { abortRef.current?.abort(); };

  /* ------------------------------ threads ------------------------------- */

  async function openThread(t: ThreadRow) {
    const m: Mode = t.mode === "draft" || t.mode === "code" ? (t.mode as Mode) : "general";
    if (m === "code" && !codeAllowed) { setError("That's a Coding conversation — the Coding tool hasn't been turned on for your account."); return; }
    const r = await getAssistantThread(t.id);
    if (!r.ok) { setError("Couldn't load that conversation."); return; }
    setMode(m);
    setThreads((th) => ({ ...th, [m]: r.messages }));
    setThreadIds((ids) => ({ ...ids, [m]: t.id }));
    setHistOpen(false);
  }

  function newConversation() {
    setThreads((t) => ({ ...t, [mode]: [] }));
    setThreadIds((ids) => ({ ...ids, [mode]: null }));
    setError(null);
  }

  async function saveRename(id: number) {
    const title = renameText.trim();
    setRenamingId(null);
    if (!title) return;
    setHistory((h) => h.map((t) => (t.id === id ? { ...t, title } : t)));
    await renameAssistantThread(id, title);
  }

  async function removeThread(t: ThreadRow) {
    if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    setHistory((h) => h.filter((x) => x.id !== t.id));
    (Object.keys(threadIds) as Mode[]).forEach((m) => {
      if (threadIds[m] === t.id) { setThreadIds((ids) => ({ ...ids, [m]: null })); setThreads((th) => ({ ...th, [m]: [] })); }
    });
    await deleteAssistantThread(t.id);
  }

  /* -------------------------------- voice -------------------------------- */

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
          <li className="opacity-80"><strong>AI_MODEL_CODE / AI_MODEL_DRAFT / AI_MODEL_GENERAL</strong> — optional per-tool overrides</li>
        </ul>
        <p className="mt-3 leading-relaxed">Redeploy after saving them and this tab lights up. Nothing here is on the public site.</p>
      </div>
    );
  }

  const meta = MODE_META[mode];

  return (
    <div className="relative flex h-[calc(100dvh-10rem)] max-w-6xl overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-sm sm:h-[calc(100vh-11rem)]">
      {/* History rail — saved conversations. Always present on desktop; a
          toggled overlay panel on phones. Cream inset so it reads as the
          "shelf" beside the white conversation surface. */}
      {saveable && (
        <div className={`${histOpen ? "absolute inset-0 z-40 flex bg-[var(--c-bg)] lg:static lg:z-auto" : "hidden"} w-full shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-bg)] lg:flex lg:w-64`}>
          <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-3">
            <History size={14} className="text-[var(--c-accent)]" />
            <span className="font-[family-name:var(--font-display)] text-sm text-[var(--c-ink)]">Conversations</span>
            <button onClick={newConversation} className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--c-accent)]/40 px-2 py-1 text-[11px] font-medium text-[var(--c-accent)] transition-colors hover:bg-[var(--c-accent)] hover:text-[var(--c-on-accent)]" title="Start a new conversation in the current tool">
              <Plus size={12} /> New
            </button>
            <button onClick={() => setHistOpen(false)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] lg:hidden"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {history.length === 0 && (
              <div className="px-3 py-8 text-center">
                <History size={20} className="mx-auto mb-2 text-[var(--c-ink-muted)] opacity-40" />
                <p className="text-xs leading-relaxed text-[var(--c-ink-muted)]">Conversations save here automatically as you work.</p>
              </div>
            )}
            {history.filter((t) => codeAllowed || t.mode !== "code").map((t) => {
              const Icon = MODE_ICON[t.mode] ?? MessageSquare;
              const active = threadIds[mode] === t.id;
              return (
                <div key={t.id} className={`group/th mb-0.5 flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors ${active ? "bg-[var(--c-accent)]/10 ring-1 ring-inset ring-[var(--c-accent)]/25" : "hover:bg-[var(--c-surface)]"}`}>
                  {renamingId === t.id ? (
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => void saveRename(t.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveRename(t.id); if (e.key === "Escape") setRenamingId(null); }}
                      className="w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--c-accent)]"
                    />
                  ) : (
                    <>
                      <Icon size={13} className={`shrink-0 ${active ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)]"}`} />
                      <button onClick={() => void openThread(t)} className="min-w-0 flex-1 text-left" title={t.title}>
                        <span className={`block truncate text-xs ${active ? "font-semibold text-[var(--c-accent)]" : "font-medium text-[var(--c-ink)]"}`}>{t.title}</span>
                        <span className="block truncate text-[10px] text-[var(--c-ink-muted)]">{t.sharedFrom ? `↪ from ${t.sharedFrom} · ` : ""}{timeAgo(t.updatedAt)}</span>
                      </button>
                      <span className="hidden shrink-0 items-center gap-0.5 group-hover/th:flex">
                        <button onClick={() => { setRenamingId(t.id); setRenameText(t.title); }} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename"><Pencil size={11} /></button>
                        <button onClick={() => void removeThread(t)} className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Delete"><Trash2 size={11} /></button>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Power strip: the GPU server's live state, cost meter, and switch. */}
        {srv?.configured && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className={`h-2 w-2 rounded-full ${srv.state === "ready" ? "bg-green-500" : srv.state === "starting" ? "animate-pulse bg-amber-500" : srv.state === "error" ? "bg-red-500" : "bg-[var(--c-ink-muted)]/40"}`} />
              {srv.state === "ready" && <>AI server on · ${srv.costPerHr?.toFixed(2)}/hr</>}
              {srv.state === "starting" && <>Waking up — loading the model (~3 min)…</>}
              {srv.state === "stopped" && <>AI server asleep · $0/hr</>}
              {srv.state === "missing" && <>Server not found — check RUNPOD_POD_ID</>}
              {srv.state === "error" && <span className="text-red-600">{srv.error || "Can't reach server controls"}</span>}
            </span>
            <button
              onClick={() => void powerAction(srv.state === "stopped" ? "start" : "stop")}
              disabled={srvBusy || srv.state === "missing" || srv.state === "error"}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors disabled:opacity-40 ${srv.state === "stopped" ? "border-green-600/50 text-green-700 hover:bg-green-600 hover:text-white dark:text-green-400" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-red-500 hover:text-red-600"}`}
              title={srv.state === "stopped" ? "Wake the AI server (billing starts; ready in ~3 minutes)" : "Put the AI server to sleep (billing stops; the model stays saved)"}
            >
              {srvBusy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
              {srv.state === "stopped" ? "Turn on" : "Turn off"}
            </button>
            <label className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]">
              Auto-sleep after
              <select
                value={srv.autoSleep === false ? "off" : String(srv.idleMinutes ?? 5)}
                onChange={(e) => void saveIdle(e.target.value)}
                className="rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-1 py-0.5 text-xs"
              >
                {[2, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} min</option>)}
                <option value="off">never</option>
              </select>
              idle
            </label>
            <span className="basis-full text-[var(--c-ink-muted)] sm:ml-auto sm:basis-auto" title="Estimated from the server's start/stop log — RunPod's billing page is the authority.">
              Est. this month: <strong className="text-[var(--c-ink)]">${(srv.monthUsd ?? 0).toFixed(2)}</strong>
              {typeof srv.balance === "number" && <> · Credit left: <strong className={srv.balance < 15 ? "text-red-600" : "text-[var(--c-ink)]"}>${srv.balance.toFixed(2)}</strong></>}
            </span>
          </div>
        )}

        {/* Header: the three tools + voice + model chip */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5">
          {saveable && (
            <button onClick={() => setHistOpen(true)} className="rounded-md border border-[var(--c-border)] p-2 text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] lg:hidden" title="Conversations">
              <History size={14} />
            </button>
          )}
          <div className="inline-flex rounded-lg bg-[var(--c-surface-2)] p-0.5">
            {(Object.keys(MODE_META) as Mode[]).filter((m) => m !== "code" || codeAllowed).map((m) => {
              const Icon = MODE_META[m].icon;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={MODE_META[m].label}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${mode === m ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] shadow-sm" : "text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`}
                >
                  <Icon size={13} /> <span className="hidden sm:inline">{MODE_META[m].label}</span>
                  {threads[m].length > 0 && mode !== m && <span className="hidden rounded-full bg-[var(--c-surface)] px-1.5 text-[9px] text-[var(--c-ink-muted)] sm:inline">{threads[m].length}</span>}
                </button>
              );
            })}
          </div>

          {/* Attach a case: the model treats "the case" as this matter and
              pulls its real details (parties, court, discovery, exhibits)
              through the firm-data tools. */}
          <div className={`order-last inline-flex basis-full items-center gap-1 rounded-md border px-2 py-1 sm:order-none sm:basis-auto ${caseMatter.trim() ? "border-[var(--c-accent)]/50 bg-[var(--c-accent)]/5" : "border-[var(--c-border)]"}`} title="Attach a case — the assistant will pull this matter's details from Matters/Cases, Discovery, Exhibits, and Pre-Trial">
            <Scale size={12} className={caseMatter.trim() ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)]"} />
            <input
              value={caseMatter}
              onChange={(e) => setCaseMatter(e.target.value)}
              list="assistant-matter-list"
              placeholder="Attach case (matter no.)"
              className="min-w-0 flex-1 bg-transparent text-xs text-[var(--c-ink)] outline-none placeholder:text-[var(--c-ink-muted)]/70 sm:w-44 sm:flex-none"
            />
            {caseMatter && (
              <button onClick={() => setCaseMatter("")} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" title="Detach the case"><X size={12} /></button>
            )}
            <datalist id="assistant-matter-list">
              {matters.map((mt) => <option key={mt} value={mt} />)}
            </datalist>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {speechOk && (
              <button
                onClick={toggleVoiceChat}
                title={voiceChat ? "End the voice conversation" : "Voice conversation — talk back and forth, hands-free"}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${voiceChat ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"}`}
              >
                <AudioLines size={13} className={voiceChat ? "animate-pulse" : ""} /> <span className={voiceChat ? "" : "hidden sm:inline"}>{voiceChat ? (speaking ? "Speaking…" : listening ? "Listening…" : "Voice on") : "Voice"}</span>
              </button>
            )}
            <button
              onClick={() => { setSpeakReplies((v) => { if (v) { window.speechSynthesis?.cancel(); setSpeaking(false); } return !v; }); }}
              title={speakReplies ? "Stop reading replies aloud" : "Read replies aloud"}
              className={`rounded-md border border-[var(--c-border)] p-1.5 ${speakReplies ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"}`}
            >
              {speakReplies ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            {label && <span className="hidden rounded bg-[var(--c-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--c-ink-muted)] sm:inline">{label}</span>}
            {saveable && threadIds[mode] != null && (
              <button
                onClick={() => void openShare()}
                title="Share this conversation — each person gets their own copy"
                className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
              >
                <Share2 size={14} />
              </button>
            )}
            <button
              onClick={() => void openSettings()}
              title="AI.fred settings — who you are, how it should respond, and what it remembers"
              className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
            >
              <Settings2 size={14} />
            </button>
            <button
              onClick={() => void testConnection()}
              disabled={healthBusy}
              title="Test the AI connection — reachability, speed, and firm-data tool support"
              className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] disabled:opacity-50"
            >
              {healthBusy ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            </button>
            {messages.length > 0 && (
              <button onClick={newConversation} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--c-ink-muted)] hover:text-red-600" title={`Clear and start a new ${meta.label} conversation`}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {(health || healthBusy) && (
          <div className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-4 py-2.5 text-xs">
            {healthBusy ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)]"><Loader2 size={12} className="animate-spin" /> Testing the AI connection…</span>
            ) : health && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {!health.configured ? (
                  <span className="text-amber-700 dark:text-amber-300">Not configured yet — {health.note}</span>
                ) : health.reachable ? (
                  <>
                    <span className="font-medium text-green-700 dark:text-green-400">✓ Connected to {health.baseUrlHost}</span>
                    <span className="text-[var(--c-ink-muted)]">Model: {health.model}</span>
                    {typeof health.latencyMs === "number" && <span className="text-[var(--c-ink-muted)]">First reply in {(health.latencyMs / 1000).toFixed(1)}s</span>}
                    {health.toolSupport === true && health.dbConfigured && <span className="text-green-700 dark:text-green-400">✓ Firm-data lookups supported</span>}
                    {health.toolSupport === false && <span className="text-amber-700 dark:text-amber-300">⚠ This provider doesn&apos;t support tool calling — chat works, but case-file lookups are off</span>}
                    {health.toolSupport == null && <span className="text-[var(--c-ink-muted)]">Tool-support check was inconclusive — try again</span>}
                  </>
                ) : (
                  <span className="text-red-700 dark:text-red-400">✗ Can&apos;t reach the AI server{health.errorDetail ? ` — ${health.errorDetail}` : ""}</span>
                )}
                <button onClick={() => setHealth(null)} className="ml-auto rounded p-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" title="Dismiss"><X size={12} /></button>
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
          {messages.length === 0 && (
            <div className="mx-auto mt-8 max-w-lg text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--c-accent)]/10">
                <meta.icon size={22} className="text-[var(--c-accent)]" />
              </span>
              <p className="font-[family-name:var(--font-display)] text-xl text-[var(--c-ink)]">{meta.label}</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--c-ink-muted)]">{meta.empty}</p>
              {/* One-click starters: drop a prompt into the box, ready to edit. */}
              <div className="mt-5 flex flex-col items-center gap-2">
                {meta.starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); taRef.current?.focus(); }}
                    className="w-full max-w-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3.5 py-2.5 text-left text-xs text-[var(--c-ink)] transition-colors hover:border-[var(--c-accent)] hover:bg-[var(--c-accent)]/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {speechOk && <p className="mt-5 text-xs text-[var(--c-ink-muted)]">Tip: the mic dictates into the box; <strong className="text-[var(--c-ink)]">Voice</strong> is a hands-free back-and-forth.</p>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-accent)]"}`}>
                {m.role === "user" ? <User size={14} /> : <Bot size={15} />}
              </span>
              <div className={`min-w-0 max-w-[92%] rounded-xl px-3.5 py-2.5 sm:max-w-[85%] ${m.role === "user" ? "whitespace-pre-wrap rounded-tr-sm bg-[var(--c-accent)] text-sm leading-relaxed text-[var(--c-on-accent)]" : "rounded-tl-sm border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-ink)]"}`}>
                {m.role === "assistant"
                  ? (m.content
                      ? <>
                          <AssistantBody content={m.content} mode={mode} />
                          {busy && i === messages.length - 1 && toolStatus && (
                            <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><Loader2 size={12} className="animate-spin text-[var(--c-accent)]" /> {toolStatus}</span>
                          )}
                          {i === messages.length - 1 && !busy && (
                            <button onClick={regenerate} className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Regenerate this reply">
                              <RefreshCw size={11} /> Regenerate
                            </button>
                          )}
                        </>
                      : (busy && i === messages.length - 1
                          ? <span className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><Loader2 size={13} className="animate-spin text-[var(--c-accent)]" /> {toolStatus ?? "Thinking…"}</span>
                          : null))
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

        <div className="border-t border-[var(--c-border)] bg-[var(--c-bg)] p-3 sm:px-4">
          <div className={`flex items-end gap-1.5 rounded-xl border bg-[var(--c-surface)] p-1.5 transition-colors ${voiceChat ? "border-[var(--c-accent)]" : "border-[var(--c-border)] focus-within:border-[var(--c-accent)]"}`}>
            {speechOk && (
              <button
                onClick={toggleDictation}
                disabled={voiceChat}
                title={listening && !voiceChat ? "Stop dictating" : "Dictate into the box"}
                className={`rounded-lg p-2.5 transition-colors ${listening && !voiceChat ? "bg-red-500/10 text-red-600" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-accent)]/10 hover:text-[var(--c-accent)]"} disabled:opacity-40`}
              >
                {listening && !voiceChat ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder={voiceChat ? "Voice conversation is on — just talk…" : meta.hint}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[var(--c-ink)] outline-none placeholder:text-[var(--c-ink-muted)]/70"
            />
            {busy ? (
              <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700" title="Stop generating">
                <Square size={13} /> Stop
              </button>
            ) : (
              <button onClick={() => void send()} disabled={!input.trim()} title="Send" className="rounded-lg bg-[var(--c-accent)] p-2.5 text-[var(--c-on-accent)] transition-colors hover:bg-[var(--c-accent-2)] disabled:opacity-35">
                <Send size={16} />
              </button>
            )}
          </div>
          {!saveable && <p className="mt-1.5 text-[10px] text-[var(--c-ink-muted)]">Conversations aren&apos;t being saved — run Settings → Database updates once to turn on saved history.</p>}
        </div>
      </div>

      {/* Settings: custom instructions + what AI.fred remembers. */}
      {settingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSettingsOpen(false)}>
          <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-3">
              <Settings2 size={15} className="text-[var(--c-accent)]" />
              <span className="font-[family-name:var(--font-display)] text-sm">AI.fred settings</span>
              <button onClick={() => setSettingsOpen(false)} className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={15} /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">About you</label>
                <p className="mb-1.5 text-[11px] text-[var(--c-ink-muted)]">Who you are and what you work on — AI.fred keeps it in mind. Only applies to your own chats.</p>
                <textarea value={prefsAbout} onChange={(e) => setPrefsAbout(e.target.value)} rows={3} maxLength={800} placeholder="e.g. I'm the firm's paralegal; I mostly handle discovery and client intake." className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--c-ink)]">How AI.fred should respond to you</label>
                <textarea value={prefsStyle} onChange={(e) => setPrefsStyle(e.target.value)} rows={3} maxLength={800} placeholder="e.g. Keep answers short. Lead with the deadline. Explain legal terms plainly." className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void savePrefs()} disabled={prefsBusy} className="btn btn-accent px-4 py-2 text-sm">{prefsBusy ? <Loader2 size={14} className="animate-spin" /> : "Save preferences"}</button>
                {prefsSaved && <span className="text-xs text-green-600">Saved.</span>}
              </div>
              <div className="border-t border-[var(--c-border)] pt-3">
                <p className="mb-1 text-xs font-semibold text-[var(--c-ink)]">What AI.fred remembers</p>
                <p className="mb-2 text-[11px] text-[var(--c-ink-muted)]">Notes it chose to keep — say “remember that…” in a chat to add one. Delete anything you don&apos;t want kept.</p>
                {memories.length === 0 && <p className="text-xs text-[var(--c-ink-muted)]">Nothing remembered yet.</p>}
                <ul className="space-y-1.5">
                  {memories.map((m) => (
                    <li key={m.id} className="flex items-start gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-xs">
                      <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${m.scope === "firm" ? "bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "bg-[var(--c-surface-2)] text-[var(--c-ink-muted)]"}`}>{m.scope === "firm" ? "Firm" : "You"}</span>
                      <span className="min-w-0 flex-1">{m.content}</span>
                      {(m.scope === "user" || fullAdmin) && (
                        <button onClick={() => void forgetMemory(m.id)} className="shrink-0 rounded p-0.5 text-[var(--c-ink-muted)] hover:text-red-600" title="Forget this"><Trash2 size={12} /></button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share this conversation with other staff (each gets their own copy). */}
      {shareOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShareOpen(false)}>
          <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-3">
              <Share2 size={15} className="text-[var(--c-accent)]" />
              <span className="font-[family-name:var(--font-display)] text-sm">Share this conversation</span>
              <button onClick={() => setShareOpen(false)} className="ml-auto rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={15} /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <p className="text-[11px] text-[var(--c-ink-muted)]">Each person gets their own copy in their Conversations list, marked as shared by you. They can keep chatting in it without affecting yours.</p>
              <input
                value={shareQuery}
                onChange={(e) => setShareQuery(e.target.value)}
                placeholder="Search people…"
                className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {shareTargets
                  .filter((t) => `${t.name} ${t.email}`.toLowerCase().includes(shareQuery.trim().toLowerCase()))
                  .map((t) => (
                    <label key={t.email} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--c-surface-2)]">
                      <input
                        type="checkbox"
                        className="accent-[var(--c-accent)]"
                        checked={shareSel.includes(t.email)}
                        onChange={(e) => setShareSel((s) => (e.target.checked ? [...s, t.email] : s.filter((x) => x !== t.email)))}
                      />
                      <span className="min-w-0 flex-1 truncate">{t.name} <span className="text-[11px] text-[var(--c-ink-muted)]">{t.email}</span></span>
                    </label>
                  ))}
                {shareTargets.length === 0 && <p className="px-2 text-xs text-[var(--c-ink-muted)]">No other staff accounts found.</p>}
              </div>
              {shareNote && <p className={`text-xs ${shareNote.startsWith("Shared") ? "text-green-600" : "text-red-600"}`}>{shareNote}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3">
              <button onClick={() => setShareOpen(false)} className="btn btn-outline px-3 py-1.5 text-sm">Close</button>
              <button onClick={() => void doShare()} disabled={shareBusy || !shareSel.length} className="btn btn-accent px-4 py-1.5 text-sm disabled:opacity-40">
                {shareBusy ? <Loader2 size={14} className="animate-spin" /> : `Share${shareSel.length ? ` (${shareSel.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
