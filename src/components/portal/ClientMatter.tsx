"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ListChecks, FolderOpen, MessageSquare, Upload, Loader2, Send, FileText, Check } from "lucide-react";
import { clientToggleTask, clientPostMessage, clientRegisterDoc } from "@/app/portal/[token]/actions";

type Task = { id: number; title: string; done: boolean };
type Message = { id: number; author: string; fromClient: boolean; body: string; createdAt: string };
type Doc = { id: number; name: string; sizeBytes: number | null; mine: boolean; createdAt: string };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const card = "rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]";
const fmtSize = (n: number | null) => (n == null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtWhen = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The client's working view of one matter: to-dos, documents, messages. */
export function ClientMatter({ token, matterId, groupId, me, tasks, messages, docs, blobReady, firmName }: {
  token: string; matterId: number; groupId: number; me: string;
  tasks: Task[]; messages: Message[]; docs: Doc[]; blobReady: boolean; firmName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  async function onFiles(list: FileList | null) {
    if (!list?.length || !blobReady) return;
    setError(null); setUploaded(false);
    for (const file of Array.from(list)) {
      setBusy(file.name);
      try {
        const blob = await upload(`client-portal/${groupId}/${matterId}/${file.name}`, file, {
          access: "public", handleUploadUrl: `/api/portal/${token}/upload`, multipart: true,
        });
        const r = await clientRegisterDoc(token, matterId, {
          name: file.name,
          file: { url: blob.url, pathname: blob.pathname, contentType: file.type || blob.contentType, size: file.size },
        });
        if (!r.ok) setError(r.error ?? `Couldn't save ${file.name}.`);
        else setUploaded(true);
      } catch (e) {
        setError(`Couldn't upload ${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    router.refresh();
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const r = await clientPostMessage(token, matterId, t);
      if (!r.ok) setError(r.error ?? "Couldn't send the message.");
      else setText("");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-6">
      {/* To-dos */}
      <section className={`${card} p-5`}>
        <h2 className="mb-1 flex items-center gap-2 font-[family-name:var(--font-ui)] text-sm font-semibold"><ListChecks size={15} className="text-[var(--c-accent)]" /> Things we need from you</h2>
        <p className="mb-3 text-xs text-[var(--c-ink-muted)]">Check items off as you complete them — the office sees your progress.</p>
        {tasks.length === 0 ? (
          <p className="text-sm text-[var(--c-ink-muted)]">Nothing needed from you right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...openTasks, ...doneTasks].map((t) => (
              <li key={t.id} className="flex items-start gap-2.5">
                <input type="checkbox" checked={t.done} onChange={(e) => void clientToggleTask(token, t.id, e.target.checked).then(() => router.refresh())} className="mt-0.5 h-4 w-4 accent-[var(--c-accent)]" />
                <span className={`text-sm leading-relaxed ${t.done ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documents */}
      <section className={`${card} p-5`}>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="flex items-center gap-2 font-[family-name:var(--font-ui)] text-sm font-semibold"><FolderOpen size={15} className="text-[var(--c-accent)]" /> Documents ({docs.length})</h2>
          <button onClick={() => fileRef.current?.click()} disabled={!blobReady || busy != null} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50">
            {busy ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : <><Upload size={13} /> Upload documents</>}
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--c-ink-muted)]">Drop in anything the office asked for — contracts, records, photos. Files shared by the office also appear here.</p>
        {uploaded && <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-green-600/10 px-2.5 py-1.5 text-xs text-green-700"><Check size={13} /> Received — the office can see it now.</p>}
        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
        {docs.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--c-border)] p-5 text-center text-xs text-[var(--c-ink-muted)]">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--c-border)]">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText size={15} className="shrink-0 text-[var(--c-accent)]" />
                <a href={`/portal/${token}/file/${d.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-[var(--c-ink)] hover:text-[var(--c-accent)]">{d.name}</a>
                {d.mine && <span className="shrink-0 rounded-full bg-[var(--c-surface-2)] px-2 py-0.5 text-[10px] text-[var(--c-ink-muted)]">yours</span>}
                <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">{fmtSize(d.sizeBytes)}</span>
                <span className="hidden shrink-0 text-[11px] text-[var(--c-ink-muted)] sm:block">{fmtWhen(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Messages */}
      <section className={`${card} flex flex-col`}>
        <h2 className="flex items-center gap-2 border-b border-[var(--c-border)] px-5 py-3 font-[family-name:var(--font-ui)] text-sm font-semibold"><MessageSquare size={15} className="text-[var(--c-accent)]" /> Messages</h2>
        <div className="max-h-[420px] space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && <p className="py-6 text-center text-sm text-[var(--c-ink-muted)]">No messages yet. Anything you write here goes straight to the {firmName} team on this matter.</p>}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.fromClient ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${msg.fromClient ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border border-[var(--c-border)] bg-[var(--c-bg)]"}`}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                <p className={`mt-1 text-[10px] ${msg.fromClient ? "text-[var(--c-on-accent)]/70" : "text-[var(--c-ink-muted)]"}`}>{msg.fromClient ? (msg.author.toLowerCase() === me.toLowerCase() ? "You" : msg.author) : firmName} · {fmtWhen(msg.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 border-t border-[var(--c-border)] p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a message to the office…" className={`${input} flex-1 resize-y`} />
          <button onClick={send} disabled={pending || !text.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--c-accent)] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </section>
    </div>
  );
}
