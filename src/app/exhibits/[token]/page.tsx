import type { Metadata } from "next";
import { getPublicSet, orderPublicDocs } from "@/lib/exhibit-review/public";
import { SharedExhibitList } from "@/components/site/SharedExhibitList";
import { FIRM } from "@/lib/firm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const set = await getPublicSet(token);
  return { title: set ? `Exhibits — ${set.name}` : "Exhibits", robots: { index: false, follow: false } };
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The exhibit share link is turned off or no longer exists. Ask whoever sent it for a current link.</p>
    </main>
  );
}

export default async function PublicExhibitIndex({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const set = await getPublicSet(token);
  if (!set) return <Unavailable />;

  const ordered = orderPublicDocs(set.docs);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="border-b border-[var(--c-border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">Exhibits</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--c-ink)]">{set.name}</h1>
        <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
          {[set.causeNumber, set.court].filter(Boolean).join("  ·  ")}
        </p>
      </header>

      <SharedExhibitList docs={ordered} viewBase={`/exhibits/${token}/e`} fileBase={`/exhibits/${token}/file`} zipBase={`/exhibits/${token}/zip`} bookBase={`/exhibits/${token}/book`} />

      <footer className="mt-10 border-t border-[var(--c-border)] pt-5 text-xs text-[var(--c-ink-muted)]">
        Shared by {FIRM.name}. These materials are provided for review only.
      </footer>
    </main>
  );
}
