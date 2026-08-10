import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PreTrialTabs } from "@/components/admin/PreTrialTabs";
import { TrialEvidence, type WitnessRow, type ExhibitRow } from "@/components/admin/TrialEvidence";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { trialCases, trialWitnesses, trialExhibits } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";

export const dynamic = "force-dynamic";

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !db) notFound();

  const [row] = await db.select().from(trialCases).where(eq(trialCases.id, id));
  if (!row) notFound();

  let witnesses: WitnessRow[] = [];
  let exhibits: ExhibitRow[] = [];
  let needsSync = false;
  try {
    const [w, x] = await Promise.all([
      db.select().from(trialWitnesses).where(eq(trialWitnesses.caseId, id)).orderBy(asc(trialWitnesses.sort)),
      db.select().from(trialExhibits).where(eq(trialExhibits.caseId, id)).orderBy(asc(trialExhibits.sort)),
    ]);
    witnesses = w.map((r) => ({ id: r.id, name: r.name, side: r.side, role: r.role, phone: r.phone, email: r.email, available: r.available, appearance: r.appearance, notes: r.notes }));
    exhibits = x.map((r) => ({ id: r.id, side: r.side, number: r.number, title: r.title, bates: r.bates, description: r.description, status: r.status, url: r.url, sizeBytes: r.sizeBytes, notes: r.notes }));
  } catch {
    needsSync = true;
  }

  return (
    <>
      <AdminHeader title={`${row.name} — Witnesses & Exhibits`} description="Who's available to testify, and the exhibit lists for both sides. Attach the actual exhibit files here." />
      <div className="p-6 max-w-4xl space-y-4">
        <Link href="/admin/pre-trial" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronLeft size={15} /> All cases</Link>
        <PreTrialTabs caseId={id} />
        {needsSync ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong>, run it once, then reload.
          </p>
        ) : (
          <TrialEvidence caseId={id} witnesses={witnesses} exhibits={exhibits} blobReady={isBlobConfigured()} />
        )}
      </div>
    </>
  );
}
