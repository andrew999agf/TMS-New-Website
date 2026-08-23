"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Trash2, Bot, User, AlertCircle } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * The admin AI Assistant. It streams from the firm's configured model through a
 * server route (the provider key stays on the server). This lives only in the
 * admin panel and does not touch the public site.
 */
export function Assistant({ configured, label }: { configured: boolean; label: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    // Placeholder assistant message we stream into.
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      // Parse the OpenAI-style server-sent-events stream.
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
              setMessages((m) => { const copy = m.slice(); copy[copy.length - 1] = { role: "assistant", content: acc }; return copy; });
            }
          } catch { /* ignore keep-alive / non-JSON lines */ }
        }
      }
      if (!acc) setMessages((m) => { const copy = m.slice(); copy[copy.length - 1] = { role: "assistant", content: "(No response.)" }; return copy; });
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
      // Drop the empty placeholder on failure.
      setMessages((m) => (m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].content ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
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

  return (
    <div className="flex h-[calc(100vh-11rem)] max-w-3xl flex-col rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-2.5">
        <Bot size={16} className="text-[var(--c-accent)]" />
        <span className="text-sm font-semibold text-[var(--c-ink)]">Assistant</span>
        {label && <span className="rounded bg-[var(--c-surface2)] px-1.5 py-0.5 text-[10px] text-[var(--c-ink-muted)]">{label}</span>}
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setError(null); }} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--c-ink-muted)] hover:text-red-600" title="Clear conversation">
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center text-sm text-[var(--c-ink-muted)]">
            <Bot size={28} className="mx-auto mb-2 text-[var(--c-accent)]/60" />
            Ask for code, a draft, or a question. Conversations stay on this screen and aren&apos;t saved.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-surface2)] text-[var(--c-accent)]"}`}>
              {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </span>
            <div className={`min-w-0 max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-bg)] text-[var(--c-ink)]"}`}>
              {m.content || (busy && i === messages.length - 1 ? <Loader2 size={14} className="animate-spin" /> : "")}
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
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Ask for code, a draft, or a question…  (Enter to send, Shift+Enter for a new line)"
            className="max-h-40 min-h-[2.5rem] flex-1 resize-y rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
          />
          <button onClick={send} disabled={busy || !input.trim()} className="btn btn-accent inline-flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
