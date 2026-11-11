import type { Metadata } from "next";
import { consultByToken } from "@/lib/intake/consults";
import { ConfirmCard } from "./ConfirmCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Confirm a consultation" }, robots: { index: false, follow: false, nocache: true }, alternates: { canonical: null }, openGraph: null, twitter: null };

/** The page behind the "Confirm this date and time" button. Opening it changes nothing. */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await consultByToken(token);
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      {c ? <ConfirmCard token={token} {...c} /> : (
        <div className="mx-auto max-w-xl px-5 py-12">
          <h1 className="font-[family-name:var(--font-display)] text-3xl" data-testid="c-title">This link is no longer open.</h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--c-ink-muted)]" data-testid="c-gone">If a new time was offered, use the link in the most recent email.</p>
        </div>
      )}
    </main>
  );
}
