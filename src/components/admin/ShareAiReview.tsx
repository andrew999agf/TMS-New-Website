"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, Copy, Link2, Ban } from "lucide-react";
import { createAiReviewLink, setRecipientRevoked } from "@/app/admin/(panel)/share-folders/actions";

type FolderInfo = { id: number; name: string; caseNumber: string; court: string; county: string; plaintiff: string; defendant: string };
type AiLink = { id: number; token: string; expiresAt: string | null; revoked: boolean; lastAccessAt: string | null; invitedAt: string };

const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/**
 * "Review with Claude": mints a view-only reviewer link that Claude can read
 * straight from the web (the listing plus every document inline, no sign-in),
 * lets the firm scope it to particular subfolders, and writes the prompt to
 * paste into a Claude chat alongside the link — so nobody has to download
 * the production first.
 */
export function ShareAiReview({ folder, files, links }: { folder: FolderInfo; files: { filename: string; sizeBytes: number | null }[]; links: AiLink[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "prompt" | null>(null);
  const [days, setDays] = useState(14);
  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [caseKind, setCaseKind] = useState("");

  // Top-level subfolders with counts, for scoping.
  const subfolders = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of files) { const top = f.filename.includes("/") ? f.filename.split("/")[0] : ""; if (top) m.set(top, (m.get(top) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([path, count]) => ({ path, count }));
  }, [files]);
  const loose = files.filter((f) => !f.filename.includes("/")).length;

  const active = links.filter((l) => !l.revoked && (!l.expiresAt || new Date(l.expiresAt) > new Date()));
  const current = active[0] ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = current ? `${origin}/share/${current.token}` : "";
  const listingUrl = current ? `${link}/manifest.json${picked.length ? `?${picked.map((p) => `folder=${encodeURIComponent(p)}`).join("&")}` : ""}` : "";

  const caseLine = [folder.name, folder.caseNumber ? `Case ${folder.caseNumber}` : "", folder.court, folder.county ? `${folder.county} County` : ""].filter(Boolean).join(", ");
  const scopeList = (picked.length ? subfolders.filter((s) => picked.includes(s.path)) : subfolders).map((s) => `\t•\t${s.path} (${s.count} file${s.count === 1 ? "" : "s"})`).join("\n");
  const prompt = !current ? "" : [
    `${role.trim() ? role.trim() : "I'm working on"} ${caseLine}. Counsel shared a document set with me through a private link. You can read it directly from the web — nothing needs to be downloaded.`,
    ``,
    `The listing is here (JSON):`,
    listingUrl,
    ``,
    `Each entry in "documents" has the file's name, folder, page count and Bates range where known, and a "url" that opens the document itself for you to read. ${picked.length ? "The listing is already narrowed to the folders I care about:" : "The folders in the share:"}`,
    scopeList || (loose ? `\t•\t${loose} file${loose === 1 ? "" : "s"} at the top level` : ""),
    picked.length ? `Work only on those folders; ignore everything else in the share.` : ``,
    ``,
    `Please do the following:`,
    `\t1.\tFetch the listing and, folder by folder, list every file with its filename, page count, and Bates range. Open each document and read the Bates stamps off the pages to confirm the range — don't guess from filenames.`,
    `\t2.\tRead each document and classify it — e.g., driver qualification file, hours-of-service/ELD records, vehicle maintenance and inspection records, company safety policies, training records, drug/alcohol testing, insurance, dispatch/trip records, post-accident investigation, discovery responses, correspondence, other.`,
    `\t3.\tBuild a single inventory table (production date, Bates range, document type, short description, page count) and give it to me as a spreadsheet.`,
    `\t4.\tThen walk through it with me production by production: what's substantive, what's boilerplate, and — for ${caseKind.trim() ? `a ${caseKind.trim()} case` : "this kind of case"} — what categories of records you'd normally expect to see that aren't here.`,
    ``,
    `If a document is too long to read in one pass, read it in parts and say so rather than skipping it. The link stops working on ${fmtDate(current.expiresAt)}.`,
  ].filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");

  const copy = (what: "link" | "prompt", text: string) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); };
  const create = () => start(async () => { setError(null); const r = await createAiReviewLink(folder.id, days); if (!r.ok) setError(r.error); router.refresh(); });

  return (
    <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="ai-review">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--c-accent)]" />
        <h3 className="text-sm font-semibold text-[var(--c-ink)]">Review with Claude</h3>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
        Creates a <strong>view-only reviewer link</strong> that a Claude chat can read straight from the web: the document listing and each document, opened inline, with no sign-in step and no downloads. Paste the link and the prompt below into Claude (claude.ai, the desktop app, or Claude Code). The link is logged in the access log like any recipient, expires on its own, and can be revoked here any time. Downloads and ZIPs are never allowed on it.
      </p>

      {!current ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--c-ink-muted)]">Valid for
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} ml-1.5 !py-1 text-xs`}>
              {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <button onClick={create} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50" data-testid="ai-create">{pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={14} />} Create reviewer link</button>
          {error && <span className="text-xs text-[var(--c-error)]">{error}</span>}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-xs">
            <Link2 size={13} className="shrink-0 text-[var(--c-accent)]" />
            <code className="min-w-0 flex-1 truncate font-mono text-[11px]" data-testid="ai-link">{link}</code>
            <span className="shrink-0 text-[11px] text-[var(--c-ink-muted)]">expires {fmtDate(current.expiresAt)}{current.lastAccessAt ? ` · last read ${fmtDate(current.lastAccessAt)}` : " · not read yet"}</span>
            <button onClick={() => copy("link", link)} className="shrink-0 rounded border border-[var(--c-border)] px-2 py-1 text-[11px] hover:border-[var(--c-accent)]">{copied === "link" ? <><Check size={11} className="mr-1 inline text-green-600" />Copied</> : <><Copy size={11} className="mr-1 inline" />Copy link</>}</button>
            <button onClick={() => { if (confirm("Revoke the Claude reviewer link? Any chat using it stops being able to read the documents.")) start(async () => { await setRecipientRevoked(current.id, true); router.refresh(); }); }} disabled={pending} className="shrink-0 rounded border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-ink-muted)] hover:border-red-500 hover:text-red-600" data-testid="ai-revoke"><Ban size={11} className="mr-1 inline" />Revoke</button>
          </div>

          {subfolders.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium text-[var(--c-ink)]">Limit the review to: <span className="font-normal text-[var(--c-ink-muted)]">{picked.length ? `${picked.length} of ${subfolders.length} folders` : "the whole share (tick folders to narrow it)"}</span></p>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {subfolders.map((s) => (
                  <label key={s.path} className="flex cursor-pointer items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5 accent-[var(--c-accent)]" checked={picked.includes(s.path)} onChange={() => setPicked((p) => (p.includes(s.path) ? p.filter((x) => x !== s.path) : [...p, s.path]))} />
                    <span className="min-w-0 truncate">{s.path} <span className="text-[var(--c-ink-muted)]">({s.count})</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="How the prompt opens — e.g. I'm a retained expert in" className={`${input} w-full !py-1.5 text-xs`} />
            <input value={caseKind} onChange={(e) => setCaseKind(e.target.value)} placeholder="Kind of case — e.g. commercial truck crash" className={`${input} w-full !py-1.5 text-xs`} />
          </div>
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-medium text-[var(--c-ink)]">Prompt to paste into Claude</p>
              <button onClick={() => copy("prompt", prompt)} className="rounded border border-[var(--c-border)] px-2 py-1 text-[11px] hover:border-[var(--c-accent)]" data-testid="ai-copy-prompt">{copied === "prompt" ? <><Check size={11} className="mr-1 inline text-green-600" />Copied</> : <><Copy size={11} className="mr-1 inline" />Copy prompt</>}</button>
            </div>
            <textarea readOnly value={prompt} rows={14} className={`${input} w-full resize-y font-mono text-[11px] leading-relaxed`} data-testid="ai-prompt" />
            <p className="mt-1 text-[10px] text-[var(--c-ink-muted)]">Edit the wording after pasting if you like — the link lines are what matter. Very large PDFs may be read in parts.</p>
          </div>
        </>
      )}
    </section>
  );
}
