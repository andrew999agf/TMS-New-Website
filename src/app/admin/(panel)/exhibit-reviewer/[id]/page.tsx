import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ExhibitReviewer, type ReviewerDoc, type WitnessLite, type ClaimLite, type ElementLite } from "@/components/admin/ExhibitReviewer";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, exhibitWitnesses, exhibitClaims, exhibitElements } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { isBlobConfigured } from "@/lib/blob";

export const dynamic = "force-dynamic";

export default async function ExhibitSetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/exhibit-reviewer", session.role, session.permissions)) notFound();
  const id = Number((await params).id);
  if (!Number.isFinite(id) || !db) notFound();

  const [set] = await db.select().from(exhibitSets).where(eq(exhibitSets.id, id));
  if (!set) notFound();

  // Note: pageText is intentionally NOT sent to the client — it can be large.
  // Search runs through server actions instead.
  const [rows, witnessRows, claimRows, elementRows] = await Promise.all([
    db
      .select({
        id: exhibitDocs.id, side: exhibitDocs.side, number: exhibitDocs.number, label: exhibitDocs.label,
        title: exhibitDocs.title, description: exhibitDocs.description, priority: exhibitDocs.priority, trialStatus: exhibitDocs.trialStatus, bates: exhibitDocs.bates, url: exhibitDocs.url,
        witnessIds: exhibitDocs.witnessIds, foundation: exhibitDocs.foundation, elementIds: exhibitDocs.elementIds, notes: exhibitDocs.notes,
        pageCount: exhibitDocs.pageCount, sizeBytes: exhibitDocs.sizeBytes, sort: exhibitDocs.sort,
      })
      .from(exhibitDocs)
      .where(eq(exhibitDocs.setId, id))
      .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id)),
    db.select().from(exhibitWitnesses).where(eq(exhibitWitnesses.setId, id)).orderBy(asc(exhibitWitnesses.sort)),
    db.select().from(exhibitClaims).where(eq(exhibitClaims.setId, id)).orderBy(asc(exhibitClaims.sort)),
    db.select().from(exhibitElements).where(eq(exhibitElements.setId, id)).orderBy(asc(exhibitElements.sort)),
  ]);

  const numArr = (v: unknown): number[] => (Array.isArray(v) ? (v as number[]) : []);
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

  const docs: ReviewerDoc[] = rows.map((r) => ({
    id: r.id, side: r.side, number: r.number, label: r.label, title: r.title, description: r.description, priority: r.priority, trialStatus: r.trialStatus, bates: r.bates,
    witnessIds: numArr(r.witnessIds), foundation: strArr(r.foundation), elementIds: numArr(r.elementIds), notes: r.notes,
    hasFile: Boolean(r.url), pageCount: r.pageCount, sizeBytes: r.sizeBytes, sort: r.sort,
  }));
  const witnesses: WitnessLite[] = witnessRows.map((w) => ({ id: w.id, name: w.name }));
  const claims: ClaimLite[] = claimRows.map((c) => ({ id: c.id, name: c.name }));
  const elements: ElementLite[] = elementRows.map((e) => ({ id: e.id, claimId: e.claimId, text: e.text }));

  return (
    <>
      <AdminHeader
        title={set.name}
        description={[set.causeNumber, set.court, set.matter ? `Matter ${set.matter}` : ""].filter(Boolean).join("  ·  ") || "Exhibit reviewer"}
      />
      <div className="p-6 max-w-6xl space-y-4">
        <Link href="/admin/exhibit-reviewer" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <ChevronLeft size={15} /> All sets
        </Link>
        <ExhibitReviewer setId={id} docs={docs} witnesses={witnesses} claims={claims} elements={elements} blobReady={isBlobConfigured()} isPublic={set.isPublic} publicToken={set.publicToken} />
      </div>
    </>
  );
}
