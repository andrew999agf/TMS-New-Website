import Link from "next/link";
import type { Metadata } from "next";
import { FileText, List } from "lucide-react";
import { getSharedDiscoveryCase } from "@/lib/discovery/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const c = await getSharedDiscoveryCase(token);
  return { title: c ? `${c.scopeTitle} — ${c.name}` : "Documents", robots: { index: false, follow: false } };
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The document share link is turned off or no longer exists.</p>
    </main>
  );
}

/** One tab's documents — this link shows nothing outside its own pile. */
export default async function SharedDiscoveryCase({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await getSharedDiscoveryCase(token);
  if (!c) return <Unavailable />;
  const tone = c.scope === "received" ? "border-red-300/60" : c.scope === "staged" ? "border-yellow-400/60" : "border-green-500/50";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">{c.name}</h1>
      {c.causeNumber && <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Cause No. {c.causeNumber}</p>}
      <p className="mt-2 text-sm text-[var(--c-ink-muted)]">Open a document to read it, or use <em>page links</em> for a link to every individual page.</p>
      <section className={`mt-6 overflow-hidden rounded-lg border ${tone}`}>
        <h2 className="border-b border-[var(--c-border)] bg-[var(--c-bg)]/60 px-4 py-2 text-sm font-semibold">{c.scopeTitle} ({c.docs.length})</h2>
        <div className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
          {c.docs.map((d) => (
            <div key={d.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <FileText size={15} className="shrink-0 text-[var(--c-accent)]" />
              <Link href={`/discovery/${token}/d/${d.key}`} className="min-w-0 flex-1 break-words hover:text-[var(--c-accent)]">{d.name}</Link>
              {d.bates && <span className="font-mono text-xs text-[var(--c-ink-muted)]">{d.bates}</span>}
              {d.pages != null && d.pages > 0 && (
                <Link href={`/discovery/${token}/d/${d.key}/pages`} className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--c-accent)] hover:underline" title="One link per page">
                  <List size={12} /> page links ({d.pages})
                </Link>
              )}
            </div>
          ))}
          {c.docs.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--c-ink-muted)]">Nothing here yet.</p>}
        </div>
      </section>
    </main>
  );
}
