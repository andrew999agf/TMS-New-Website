import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { resolveSharedFile } from "@/lib/discovery/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string; key: string; n: string }> }): Promise<Metadata> {
  const { token, key, n } = await params;
  const f = await resolveSharedFile(token, key);
  return { title: f ? `${f.name} — page ${n}` : "Page", robots: { index: false, follow: false } };
}

/** One single page of a shared document, served as its own one-page PDF in
 *  the browser's viewer — selectable/copyable text when the page has any. */
export default async function SharedSinglePage({ params }: { params: Promise<{ token: string; key: string; n: string }> }) {
  const { token, key, n } = await params;
  const page = Math.floor(Number(n));
  const f = await resolveSharedFile(token, key);
  if (!f || !Number.isFinite(page) || page < 1 || (f.pages != null && page > f.pages)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
        <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The share link is off or the page doesn&apos;t exist.</p>
      </main>
    );
  }
  const bates = f.batesPrefix && f.batesStart != null ? `${f.batesPrefix}${String(f.batesStart + page - 1).padStart(6, "0")}` : null;
  return (
    <main className="flex h-screen flex-col bg-[var(--c-bg)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <Link href={`/discovery/${token}/d/${key}/pages`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <List size={14} /> All pages
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--c-ink)]">{f.name} — page {page}{f.pages ? ` of ${f.pages}` : ""}</span>
        {bates && <span className="font-mono text-xs text-[var(--c-ink-muted)]">{bates}</span>}
        {page > 1 && <Link href={`/discovery/${token}/d/${key}/p/${page - 1}`} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronLeft size={14} /></Link>}
        {f.pages != null && page < f.pages && <Link href={`/discovery/${token}/d/${key}/p/${page + 1}`} className="rounded-md border border-[var(--c-border)] p-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronRight size={14} /></Link>}
      </header>
      <iframe src={`/discovery/${token}/file/${key}/page/${page}`} title={`Page ${page}`} className="min-h-0 w-full flex-1 border-0 bg-white" />
    </main>
  );
}
