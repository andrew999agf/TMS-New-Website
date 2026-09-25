"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { Check, Copy, ExternalLink, FileQuestion, FileText, FolderPlus, Loader2, UserRoundPlus, X } from "lucide-react";
import { parseDiscoveryRequestDoc, createClientDocRequest } from "@/app/admin/(panel)/discovery-reviewer/actions";

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

export type ClientFolderChip = { id: number; name: string; rfp: boolean };

/** "1-14" / "15-22, 25" → sorted unique numbers. */
function parseNumberList(text: string): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) if (n >= 1 && n <= 999) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function toRangeText(numbers: number[]): string {
  if (!numbers.length) return "";
  const parts: string[] = [];
  let start = numbers[0], prev = numbers[0];
  for (const n of numbers.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(", ");
}

export function RequestClientDocs({ setId, existing }: { setId: number; existing: ClientFolderChip[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "rfp" | "general">("choose");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [reqFile, setReqFile] = useState<{ url: string; pathname: string; name: string; size: number } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [prefix, setPrefix] = useState("RFP");
  const [numText, setNumText] = useState("");
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ shareUrl: string; folderUrl: string; folders: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const numbers = parseNumberList(numText);

  function reset() {
    setOpen(false); setMode("choose"); setEmail(""); setName(""); setReqFile(null);
    setPrefix("RFP"); setNumText(""); setParseNote(null); setError(null); setDone(null); setCopied(false);
  }

  async function onPickRequestDoc(file: File) {
    setError(null);
    setParsing(true);
    try {
      const blob = await upload(`discovery-requests/${setId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`, file, {
        access: "public", handleUploadUrl: "/api/admin/trial-upload", clientPayload: String(setId), multipart: true,
        contentType: "application/pdf",
      });
      setReqFile({ url: blob.url, pathname: blob.pathname, name: file.name, size: file.size });
      const r = await parseDiscoveryRequestDoc({ url: blob.url, size: file.size });
      if (r.ok) {
        setPrefix(r.prefix);
        setNumText(toRangeText(r.numbers));
        setParseNote(r.note ?? (r.numbers.length ? `Found ${r.numbers.length} request${r.numbers.length === 1 ? "" : "s"} (${r.prefix} ${toRangeText(r.numbers)}). Adjust below if that's not right.` : null));
      }
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await createClientDocRequest(setId, {
      mode: mode === "rfp" ? "rfp" : "general",
      clientEmail: email,
      clientName: name,
      requestFile: reqFile ?? undefined,
      prefix,
      numbers,
    });
    setBusy(false);
    if (r.ok) {
      setDone({ shareUrl: r.shareUrl, folderUrl: r.folderUrl, folders: r.folders });
      router.refresh();
    } else {
      setError(r.error ?? "Couldn't create the request.");
    }
  }

  async function copyLink() {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${done.shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-1.5 px-3">
        <UserRoundPlus size={14} /> Request documents from client
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy && !parsing) reset(); }}>
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-[family-name:var(--font-display)] text-lg">Request documents from the client</h3>
              <button onClick={reset} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
            </div>

            {done ? (
              <div className="mt-4 space-y-3">
                <p className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <Check size={15} /> Request created{done.folders.length ? ` with ${done.folders.length} folders (${done.folders[0]} … ${done.folders[done.folders.length - 1]})` : ""}.
                </p>
                <div className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                  <p className="text-xs font-semibold">Client upload link (private to {email})</p>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--c-ink-muted)]">{typeof window !== "undefined" ? window.location.origin : ""}{done.shareUrl}</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={copyLink} className="btn btn-accent inline-flex items-center gap-1.5 text-xs py-1.5 px-3">
                      <Copy size={13} /> {copied ? "Copied!" : "Copy link"}
                    </button>
                    <Link href={done.folderUrl} className="btn btn-outline inline-flex items-center gap-1.5 text-xs py-1.5 px-3">
                      <ExternalLink size={13} /> Open folder (send the invite email from there)
                    </Link>
                  </div>
                </div>
              </div>
            ) : mode === "choose" ? (
              <div className="mt-4 space-y-3">
                <button onClick={() => setMode("rfp")} className="flex w-full items-start gap-3 rounded-lg border-2 border-[var(--c-border)] p-4 text-left transition-colors hover:border-[var(--c-accent)]">
                  <FileQuestion size={22} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
                  <span>
                    <span className="block font-semibold">Request documents responsive to discovery requests</span>
                    <span className="mt-0.5 block text-sm text-[var(--c-ink-muted)]">Upload the served requests; the system counts them and builds one folder per request (RFP 1, RFP 2, …) so the client files each document under the request it answers.</span>
                  </span>
                </button>
                <button onClick={() => setMode("general")} className="flex w-full items-start gap-3 rounded-lg border-2 border-[var(--c-border)] p-4 text-left transition-colors hover:border-[var(--c-accent)]">
                  <FolderPlus size={22} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />
                  <span>
                    <span className="block font-semibold">Request other documents</span>
                    <span className="mt-0.5 block text-sm text-[var(--c-ink-muted)]">A secure drop link where the client can upload documents, create their own folders, and label everything.</span>
                  </span>
                </button>
                {existing.length > 0 && (
                  <div className="border-t border-[var(--c-border)] pt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Already set up for this case</p>
                    {existing.map((f) => (
                      <Link key={f.id} href={`/admin/share-folders/${f.id}`} className="flex items-center gap-2 py-1 text-sm text-[var(--c-accent)] hover:underline">
                        <FileText size={13} /> {f.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {mode === "rfp" && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold">The served discovery requests (PDF) *</span>
                      {reqFile ? (
                        <p className="flex items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm">
                          <FileText size={14} className="text-[var(--c-accent)]" /> {reqFile.name}
                          <button onClick={() => { setReqFile(null); setNumText(""); setParseNote(null); }} className="ml-auto text-[var(--c-ink-muted)]"><X size={14} /></button>
                        </p>
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--c-border)] px-3 py-4 text-sm text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
                          {parsing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                          {parsing ? "Uploading & reading the requests…" : "Upload the requests document"}
                          <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={parsing}
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPickRequestDoc(f); }} />
                        </label>
                      )}
                    </label>
                    {parseNote && <p className="rounded-md bg-[var(--c-accent)]/10 px-3 py-2 text-xs">{parseNote}</p>}
                    <div className="grid grid-cols-3 gap-3">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-semibold">Type</span>
                        <select value={prefix} onChange={(e) => setPrefix(e.target.value)} className={input}>
                          {["RFP", "ROG", "RFA", "RFD", "REQ"].map((k) => <option key={k}>{k}</option>)}
                        </select>
                      </label>
                      <label className="col-span-2 block text-sm">
                        <span className="mb-1 block text-xs font-semibold">Request numbers (e.g. 15-22 or 1-12, 14)</span>
                        <input value={numText} onChange={(e) => setNumText(e.target.value)} placeholder="1-14" className={input} />
                      </label>
                    </div>
                    {numbers.length > 0 && (
                      <p className="text-xs text-[var(--c-ink-muted)]">
                        {numbers.length} folder{numbers.length === 1 ? "" : "s"} will be created: <strong>{prefix} {numbers[0]}</strong>{numbers.length > 1 ? <> … <strong>{prefix} {numbers[numbers.length - 1]}</strong></> : null}
                      </p>
                    )}
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold">Client email *</span>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" type="email" className={input} />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold">Client name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" className={input} />
                  </label>
                </div>

                {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setMode("choose")} className="btn btn-outline text-sm py-2 px-4">Back</button>
                  <button onClick={() => void submit()}
                    disabled={busy || parsing || !email.trim() || (mode === "rfp" && (!reqFile || numbers.length === 0))}
                    className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {mode === "rfp" ? `Create ${numbers.length || ""} folder${numbers.length === 1 ? "" : "s"} & client link` : "Create client link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}