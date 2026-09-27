import Link from "next/link";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { getSharedDiscoveryCase, type SharedDoc } from "@/lib/discovery/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const c = await getSharedDiscoveryCase(token);
  return { title: c ? `Documents — ${c.name}` : "Documents", robots: { index: false, follow: false } };
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The document share link is turned off or no longer exists.</p>
    </main>
  );
}

function Section({ token, title, docs, tone }: { token: string; title: string; docs: SharedDoc[]; tone: string }) {
  if (!docs.length) return null;
  return (
    <section className={`overflow-hidden rounded-lg border ${tone}`}>
      <h2 className="border-b border-[var(--c-border)] bg-[var(--c-bg)]/60 px-4 py-2 text-sm font-semibold">{title} ({docs.length})</h2>
      <div className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
        {docs.map((d) => (
          <Link key={d.key} href={`/discovery/${token}/d/${d.key}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--c-bg)]/60">
            <FileText size={15} className="shrink-0 text-[var(--c-accent)]" />
            <span className="min-w-0 flex-1 break-words">{d.name}</span>
            {d.bates && <span className="font-mono text-xs text-[var(--c-ink-muted)]">{d.bates}</span>}
            {d.pages != null && <span className="text-xs text-[var(--c-ink-muted)]">{d.pages} pp.</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function SharedDiscoveryCase({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await getSharedDiscoveryCase(token);
  if (!c) return <Unavailable />;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">{c.name}</h1>
      {c.causeNumber && <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Cause No. {c.causeNumber}</p>}
      <p className="mt-2 text-sm text-[var(--c-ink-muted)]">Shared documents. Open one to read it; each document has its own link, and a specific page can be linked by adding <code>#page=N</code>.</p>
      <div className="mt-6 space-y-5">
        <Section token={token} title="Documents received from client" docs={c.received} tone="border-red-300/60" />
        <Section token={token} title="Documents to be produced" docs={c.staged} tone="border-yellow-400/60" />
        <Section token={token} title="Documents produced" docs={c.produced} tone="border-green-500/50" />
      </div>
    </main>
  );
}
