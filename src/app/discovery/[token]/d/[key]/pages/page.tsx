import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, FileText } from "lucide-react";
import { resolveSharedFile } from "@/lib/discovery/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string; key: string }> }): Promise<Metadata> {
  const { token, key } = await params;
  const f = await resolveSharedFile(token, key);
  return { title: f ? `Pages — ${f.name}` : "Pages", robots: { index: false, follow: false } };
}

/** One link per page: "name — page N (BATES)". Each opens that single page
 *  in the browser's PDF viewer, selectable text and all. */
export default async function SharedDocPages({ params }: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await params;
  const f = await resolveSharedFile(token, key);
  if (!f || !f.pages) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
        <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The share link is off, or this document has no page index.</p>
      </main>
    );
  }
  const batesFor = (n: number) => (f.batesPrefix && f.batesStart != null ? `${f.batesPrefix}${String(f.batesStart + n - 1).padStart(6, "0")}` : null);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/discovery/${token}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronLeft size={15} /> All documents</Link>
      <h1 className="mt-2 break-words font-[family-name:var(--font-display)] text-xl text-[var(--c-ink)]">{f.name}</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{f.pages} pages — each has its own link.</p>
      <div className="mt-5 divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
        {Array.from({ length: f.pages }, (_, i) => i + 1).map((n) => (
          <Link key={n} href={`/discovery/${token}/d/${key}/p/${n}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--c-bg)]/60">
            <FileText size={14} className="shrink-0 text-[var(--c-accent)]" />
            <span className="min-w-0 flex-1 truncate">{f.name} — page {n}</span>
            {batesFor(n) && <span className="font-mono text-xs text-[var(--c-ink-muted)]">{batesFor(n)}</span>}
          </Link>
        ))}
      </div>
    </main>
  );
}
