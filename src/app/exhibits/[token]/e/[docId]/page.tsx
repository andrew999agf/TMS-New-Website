import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { getPublicSet, orderPublicDocs, type PublicDoc } from "@/lib/exhibit-review/public";
import { PhoneExhibitViewer } from "@/components/site/PhoneExhibitViewer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string; docId: string }> }): Promise<Metadata> {
  const { token, docId } = await params;
  const set = await getPublicSet(token);
  const d = set?.docs.find((x) => x.id === Number(docId));
  return { title: d ? `${d.label || d.title || "Exhibit"} — ${set!.name}` : "Exhibit", robots: { index: false, follow: false } };
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The exhibit share link is turned off or no longer exists.</p>
    </main>
  );
}

export default async function PublicExhibitView({ params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const set = await getPublicSet(token);
  if (!set) return <Unavailable />;
  const ordered: PublicDoc[] = orderPublicDocs(set.docs);
  const idx = ordered.findIndex((d) => d.id === Number(docId));
  if (idx < 0) return <Unavailable />;
  const d = ordered[idx];
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];

  return (
    <main className="flex h-screen flex-col bg-[var(--c-bg)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <Link href={`/exhibits/${token}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="All exhibits">
          <List size={14} /> All exhibits
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--c-ink)]">
            <span className="text-[var(--c-accent)]">{d.label || (d.number ?? "")}</span>{d.label || d.number != null ? " — " : ""}{d.title || "Exhibit"}
          </div>
          {d.bates && <div className="truncate text-[11px] text-[var(--c-ink-muted)]">{d.bates}</div>}
        </div>
        <div className="flex items-center gap-1">
          {prev ? (
            <Link href={`/exhibits/${token}/e/${prev.id}`} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title={`Previous: ${prev.label || prev.title}`}><ChevronLeft size={16} /></Link>
          ) : <span className="rounded-md border border-[var(--c-border)] p-1.5 opacity-30"><ChevronLeft size={16} /></span>}
          <span className="px-1 text-xs text-[var(--c-ink-muted)]">{idx + 1} / {ordered.length}</span>
          {next ? (
            <Link href={`/exhibits/${token}/e/${next.id}`} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title={`Next: ${next.label || next.title}`}><ChevronRight size={16} /></Link>
          ) : <span className="rounded-md border border-[var(--c-border)] p-1.5 opacity-30"><ChevronRight size={16} /></span>}
        </div>
      </header>
      {d.isVideo ? (
        /* Video exhibit: the native player everywhere — seekable via the
           Range-forwarding file route. */
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          <video src={`/exhibits/${token}/file/${d.id}`} controls playsInline preload="metadata" className="max-h-full max-w-full" />
        </div>
      ) : (
        <>
          {/* Phones get a fit-to-screen page viewer (whole page visible, arrows +
              swipe); desktop keeps the browser's own PDF frame unchanged. */}
          <div className="flex min-h-0 flex-1 flex-col lg:hidden">
            <PhoneExhibitViewer src={`/exhibits/${token}/file/${d.id}`} title={d.label || d.title || "Exhibit"} />
          </div>
          <iframe src={`/exhibits/${token}/file/${d.id}#zoom=page-width`} title={d.label || d.title || "Exhibit"} className="hidden min-h-0 flex-1 w-full bg-white lg:block" />
        </>
      )}
    </main>
  );
}
