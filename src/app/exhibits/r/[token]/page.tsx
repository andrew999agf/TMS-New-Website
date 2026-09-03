import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { resolveExhibitRecipient, isVerifiedAs, recipientDocs } from "@/lib/exhibit-review/recipient";
import { orderPublicDocs } from "@/lib/exhibit-review/public";
import { ExhibitAuthGate } from "@/components/admin/ExhibitAuthGate";
import { SharedExhibitList } from "@/components/site/SharedExhibitList";
import { FIRM } from "@/lib/firm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exhibits", robots: { index: false, follow: false } };

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The share link is turned off, revoked, or no longer exists. Ask whoever sent it for a current link.</p>
    </main>
  );
}

export default async function RecipientIndex({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolveExhibitRecipient(token);
  if (!ctx) return <Unavailable />;
  if (!(await isVerifiedAs(ctx.rec.email))) return <ExhibitAuthGate token={token} email={ctx.rec.email} />;

  const ordered = orderPublicDocs(await recipientDocs(ctx.set.id));

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="border-b border-[var(--c-border)] pb-5">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]"><ShieldCheck size={13} /> Exhibits · shared with {ctx.rec.email}</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--c-ink)]">{ctx.set.name}</h1>
        <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{[ctx.set.causeNumber, ctx.set.court].filter(Boolean).join("  ·  ")}</p>
      </header>

      <SharedExhibitList docs={ordered} viewBase={`/exhibits/r/${token}/e`} fileBase={`/exhibits/r/${token}/file`} zipBase={`/exhibits/r/${token}/zip`} bookBase={`/exhibits/r/${token}/book`} />

      <footer className="mt-10 border-t border-[var(--c-border)] pt-5 text-xs text-[var(--c-ink-muted)]">
        Shared privately by {FIRM.name}. This access is specific to you.
      </footer>
    </main>
  );
}
