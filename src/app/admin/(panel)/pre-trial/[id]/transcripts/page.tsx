import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PreTrialTabs } from "@/components/admin/PreTrialTabs";
import { TrialTranscripts, type TranscriptRow, type WitnessLite } from "@/components/admin/TrialTranscripts";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { trialCases, trialTranscripts, trialWitnesses } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";

export const dynamic = "force-dynamic";

export default async function TranscriptsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !db) notFound();

  const [row] = await db.select().from(trialCases).where(eq(trialCases.id, id));
  if (!row) notFound();

  let rows: TranscriptRow[] = [];
  let witnesses: WitnessLite[] = [];
  let needsSync = false;
  try {
    const [t, w] = await Promise.all([
      db.select().from(trialTranscripts).where(eq(trialTranscripts.caseId, id)).orderBy(asc(trialTranscripts.sort)),
      db.select().from(trialWitnesses).where(eq(trialWitnesses.caseId, id)).orderBy(asc(trialWitnesses.sort)),
    ]);
    rows = t.map((r) => ({ id: r.id, kind: r.kind, title: r.title, witnessId: r.witnessId, takenOn: r.takenOn, url: r.url, sizeBytes: r.sizeBytes, notes: r.notes }));
    witnesses = w.map((r) => ({ id: r.id, name: r.name, side: r.side, role: r.role }));
  } catch {
    needsSync = true;
  }

  return (
    <>
      <AdminHeader title={`${row.name} — Transcripts`} description="Deposition transcripts and witness statements backing the page/line citations in the proof matrix." />
      <div className="p-6 max-w-4xl space-y-4">
        <Link href="/admin/pre-trial" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronLeft size={15} /> All cases</Link>
        <PreTrialTabs caseId={id} />
        {needsSync ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong>, run it once, then reload.
          </p>
        ) : (
          <TrialTranscripts caseId={id} rows={rows} witnesses={witnesses} blobReady={isBlobConfigured()} />
        )}
      </div>
    </>
  );
}
