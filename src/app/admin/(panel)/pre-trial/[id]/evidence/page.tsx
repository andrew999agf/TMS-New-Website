import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PreTrialTabs } from "@/components/admin/PreTrialTabs";
import { TrialEvidence, type WitnessRow, type ExhibitRow, type ClaimLite, type ElementLite } from "@/components/admin/TrialEvidence";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { trialCases, trialWitnesses, trialExhibits, trialClaims, trialElements, trialProofs } from "@/db/schema";
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
  let claims: ClaimLite[] = [];
  let elements: ElementLite[] = [];
  let needsSync = false;
  try {
    const [w, x, c, e, proofs] = await Promise.all([
      db.select().from(trialWitnesses).where(eq(trialWitnesses.caseId, id)).orderBy(asc(trialWitnesses.sort)),
      db.select().from(trialExhibits).where(eq(trialExhibits.caseId, id)).orderBy(asc(trialExhibits.sort)),
      db.select().from(trialClaims).where(eq(trialClaims.caseId, id)).orderBy(asc(trialClaims.sort)),
      db.select().from(trialElements).where(eq(trialElements.caseId, id)).orderBy(asc(trialElements.sort)),
      db.select({ exhibitId: trialProofs.exhibitId, elementId: trialProofs.elementId }).from(trialProofs).where(eq(trialProofs.caseId, id)),
    ]);
    witnesses = w.map((r) => ({ id: r.id, name: r.name, side: r.side, role: r.role, phone: r.phone, email: r.email, available: r.available, appearance: r.appearance, notes: r.notes }));
    // Which elements each exhibit already proves, read back off the proof matrix.
    const linked = new Map<number, number[]>();
    for (const p of proofs) {
      if (p.exhibitId == null) continue;
      linked.set(p.exhibitId, [...(linked.get(p.exhibitId) ?? []), p.elementId]);
    }
    exhibits = x.map((r) => ({
      id: r.id, side: r.side, number: r.number, title: r.title, bates: r.bates, description: r.description,
      status: r.status, url: r.url, sizeBytes: r.sizeBytes, notes: r.notes,
      witnessIds: Array.isArray(r.witnessIds) ? (r.witnessIds as number[]) : [],
      foundation: Array.isArray(r.foundation) ? (r.foundation as string[]) : [],
      elementIds: linked.get(r.id) ?? [],
    }));
    claims = c.map((r) => ({ id: r.id, name: r.name }));
    elements = e.map((r) => ({ id: r.id, claimId: r.claimId, text: r.text }));
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
          <TrialEvidence caseId={id} witnesses={witnesses} exhibits={exhibits} claims={claims} elements={elements} blobReady={isBlobConfigured()} />
        )}
      </div>
    </>
  );
}
