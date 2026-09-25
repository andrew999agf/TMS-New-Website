import type { Metadata } from "next";
import { db } from "@/db";
import { productions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FIRM } from "@/lib/firm";
import { FileText, Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Production — ${FIRM.name}`, robots: { index: false, follow: false } };

const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * The opposing-counsel production page: nothing but the cover letter, the
 * Bates-stamped production file, and the range. Reached only through the
 * unguessable link in the production letter.
 */
export default async function ProductionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = db ? (await db.select().from(productions).where(eq(productions.token, token)))[0] : null;

  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <div className="mx-auto max-w-xl px-5 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{FIRM.name}</p>
        <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">Document production</p>

        {!row ? (
          <p className="mt-8 text-sm text-[var(--c-ink-muted)]">This production link is not available. Please contact {FIRM.email}.</p>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">{row.label}</h1>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
              Bates {row.batesPrefix}{String(row.batesStart).padStart(6, "0")} through {row.batesPrefix}{String(row.batesEnd).padStart(6, "0")}
              {row.producedAt ? ` · Produced ${fmt(row.producedAt)}` : ""}
            </p>

            <div className="mt-8 space-y-3">
              {row.letterUrl && (
                <a href={row.letterUrl} className="flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 hover:border-[var(--c-accent)]">
                  <FileText size={18} className="shrink-0 text-[var(--c-accent)]" />
                  <span className="min-w-0 flex-1 text-sm font-medium">Production letter</span>
                  <Download size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
                </a>
              )}
              {row.fileUrl && (
                <a href={row.fileUrl} className="flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 hover:border-[var(--c-accent)]">
                  <FileText size={18} className="shrink-0 text-[var(--c-accent)]" />
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{row.fileName}</span>
                  <Download size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
                </a>
              )}
            </div>
          </>
        )}

        <p className="mt-12 border-t border-[var(--c-border)] pt-4 text-[11px] text-[var(--c-ink-muted)]">
          Questions regarding this production: {FIRM.email} · Fax {FIRM.fax}
        </p>
      </div>
    </main>
  );
}
