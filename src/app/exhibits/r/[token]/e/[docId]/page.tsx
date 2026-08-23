import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { resolveExhibitRecipient, isVerifiedAs, recipientDocs } from "@/lib/exhibit-review/recipient";
import { orderPublicDocs, type PublicDoc } from "@/lib/exhibit-review/public";
import { ExhibitAuthGate } from "@/components/admin/ExhibitAuthGate";
import { PhoneExhibitViewer } from "@/components/site/PhoneExhibitViewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exhibit", robots: { index: false, follow: false } };

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The share link is turned off, revoked, or no longer exists.</p>
    </main>
  );
}

export default async function RecipientView({ params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const ctx = await resolveExhibitRecipient(token);
  if (!ctx) return <Unavailable />;
  if (!(await isVerifiedAs(ctx.rec.email))) return <ExhibitAuthGate token={token} email={ctx.rec.email} />;

  const ordered: PublicDoc[] = orderPublicDocs(await recipientDocs(ctx.set.id));
  const idx = ordered.findIndex((d) => d.id === Number(docId));
  if (idx < 0) return <Unavailable />;
  const d = ordered[idx];
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];

  return (
    <main className="flex h-screen flex-col bg-[var(--c-bg)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <Link href={`/exhibits/r/${token}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="All exhibits"><List size={14} /> All exhibits</Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--c-ink)]"><span className="text-[var(--c-accent)]">{d.label || (d.number ?? "")}</span>{d.label || d.number != null ? " — " : ""}{d.title || "Exhibit"}</div>
          {d.bates && <div className="truncate text-[11px] text-[var(--c-ink-muted)]">{d.bates}</div>}
        </div>
        <div className="flex items-center gap-1">
          {prev ? <Link href={`/exhibits/r/${token}/e/${prev.id}`} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Previous"><ChevronLeft size={16} /></Link> : <span className="rounded-md border border-[var(--c-border)] p-1.5 opacity-30"><ChevronLeft size={16} /></span>}
          <span className="px-1 text-xs text-[var(--c-ink-muted)]">{idx + 1} / {ordered.length}</span>
          {next ? <Link href={`/exhibits/r/${token}/e/${next.id}`} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Next"><ChevronRight size={16} /></Link> : <span className="rounded-md border border-[var(--c-border)] p-1.5 opacity-30"><ChevronRight size={16} /></span>}
        </div>
      </header>
      {/* Phones get a fit-to-screen page viewer (whole page visible, arrows +
          swipe); desktop keeps the browser's own PDF frame unchanged. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <PhoneExhibitViewer src={`/exhibits/r/${token}/file/${d.id}`} title={d.label || d.title || "Exhibit"} />
      </div>
      <iframe src={`/exhibits/r/${token}/file/${d.id}#zoom=page-width`} title={d.label || d.title || "Exhibit"} className="hidden min-h-0 flex-1 w-full bg-white lg:block" />
    </main>
  );
}
