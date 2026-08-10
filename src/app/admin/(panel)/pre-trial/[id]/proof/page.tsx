import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PreTrialTabs } from "@/components/admin/PreTrialTabs";
import { TrialProofMatrix } from "@/components/admin/TrialProofMatrix";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { trialCases, trialClaims, trialElements, trialProofs, trialExhibits, trialWitnesses } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProofMatrixPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !db) notFound();

  const [row] = await db.select().from(trialCases).where(eq(trialCases.id, id));
  if (!row) notFound();

  let claims: Awaited<ReturnType<typeof loadClaims>> = [];
  let elements: Awaited<ReturnType<typeof loadElements>> = [];
  let proofs: Awaited<ReturnType<typeof loadProofs>> = [];
  let exhibits: Awaited<ReturnType<typeof loadExhibits>> = [];
  let witnesses: Awaited<ReturnType<typeof loadWitnesses>> = [];
  let needsSync = false;

  async function loadClaims() { return db!.select().from(trialClaims).where(eq(trialClaims.caseId, id)).orderBy(asc(trialClaims.sort)); }
  async function loadElements() { return db!.select().from(trialElements).where(eq(trialElements.caseId, id)).orderBy(asc(trialElements.sort)); }
  async function loadProofs() { return db!.select().from(trialProofs).where(eq(trialProofs.caseId, id)).orderBy(asc(trialProofs.sort)); }
  async function loadExhibits() { return db!.select().from(trialExhibits).where(eq(trialExhibits.caseId, id)).orderBy(asc(trialExhibits.sort)); }
  async function loadWitnesses() { return db!.select().from(trialWitnesses).where(eq(trialWitnesses.caseId, id)).orderBy(asc(trialWitnesses.sort)); }

  try {
    [claims, elements, proofs, exhibits, witnesses] = await Promise.all([loadClaims(), loadElements(), loadProofs(), loadExhibits(), loadWitnesses()]);
  } catch {
    needsSync = true;
  }

  return (
    <>
      <AdminHeader title={`${row.name} — Proof Matrix`} description="Every cause of action, its elements, and the exhibit or testimony that proves each one." />
      <div className="p-6 max-w-4xl space-y-4">
        <Link href="/admin/pre-trial" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ChevronLeft size={15} /> All cases</Link>
        <PreTrialTabs caseId={id} />
        {needsSync ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            This feature needs its database tables. Go to <strong>Settings → Database updates</strong>, run it once, then reload.
          </p>
        ) : (
          <TrialProofMatrix
            caseId={id}
            claims={claims.map((c) => ({ id: c.id, name: c.name, party: c.party, isLead: c.isLead, notes: c.notes }))}
            elements={elements.map((e) => ({ id: e.id, claimId: e.claimId, text: e.text, notes: e.notes }))}
            proofs={proofs.map((p) => ({ id: p.id, elementId: p.elementId, kind: p.kind, exhibitId: p.exhibitId, witnessId: p.witnessId, citation: p.citation, summary: p.summary, anticipated: p.anticipated }))}
            exhibits={exhibits.map((x) => ({ id: x.id, number: x.number, title: x.title, side: x.side, url: x.url }))}
            witnesses={witnesses.map((w) => ({ id: w.id, name: w.name, side: w.side, role: w.role }))}
          />
        )}
      </div>
    </>
  );
}
