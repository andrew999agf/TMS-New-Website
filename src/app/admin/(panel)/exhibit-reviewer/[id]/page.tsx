import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ExhibitReviewer, type ReviewerDoc, type WitnessLite, type ClaimLite, type ElementLite, type RecipientLite } from "@/components/admin/ExhibitReviewer";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { exhibitSets, exhibitDocs, exhibitWitnesses, exhibitClaims, exhibitElements, exhibitRecipients } from "@/db/schema";
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
        title: exhibitDocs.title, description: exhibitDocs.description, priority: exhibitDocs.priority, trialStatus: exhibitDocs.trialStatus, bates: exhibitDocs.bates, batesEnd: exhibitDocs.batesEnd, url: exhibitDocs.url, pathname: exhibitDocs.pathname, hiResUrl: exhibitDocs.hiResUrl, hiResPathname: exhibitDocs.hiResPathname,
        witnessIds: exhibitDocs.witnessIds, foundation: exhibitDocs.foundation, elementIds: exhibitDocs.elementIds, notes: exhibitDocs.notes, omitted: exhibitDocs.omitted,
        colorStatus: exhibitDocs.colorStatus, colorPages: exhibitDocs.colorPages, reviewPages: exhibitDocs.reviewPages,
        pageCount: exhibitDocs.pageCount, sizeBytes: exhibitDocs.sizeBytes, sort: exhibitDocs.sort,
      })
      .from(exhibitDocs)
      .where(eq(exhibitDocs.setId, id))
      .orderBy(asc(exhibitDocs.sort), asc(exhibitDocs.id)),
    db.select().from(exhibitWitnesses).where(eq(exhibitWitnesses.setId, id)).orderBy(asc(exhibitWitnesses.sort)),
    db.select().from(exhibitClaims).where(eq(exhibitClaims.setId, id)).orderBy(asc(exhibitClaims.sort)),
    db.select().from(exhibitElements).where(eq(exhibitElements.setId, id)).orderBy(asc(exhibitElements.sort)),
  ]);
  const recipientRows = await db.select().from(exhibitRecipients).where(eq(exhibitRecipients.setId, id)).orderBy(asc(exhibitRecipients.createdAt));

  const numArr = (v: unknown): number[] => (Array.isArray(v) ? (v as number[]) : []);
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  // A short token that changes when the file behind an exhibit changes (the blob
  // pathname is unique per upload), so the viewer and browser cache reload it.
  const tagOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  const docs: ReviewerDoc[] = rows.map((r) => ({
    id: r.id, side: r.side, number: r.number, label: r.label, title: r.title, description: r.description, priority: r.priority, trialStatus: r.trialStatus, bates: r.bates, batesEnd: r.batesEnd,
    witnessIds: numArr(r.witnessIds), foundation: strArr(r.foundation), elementIds: numArr(r.elementIds), notes: r.notes, omitted: r.omitted,
    hasFile: Boolean(r.url), pageCount: r.pageCount, sizeBytes: r.sizeBytes, sort: r.sort,
    fileTag: tagOf(r.pathname ?? r.url ?? String(r.id)),
    hasHiRes: Boolean(r.hiResUrl), hiResTag: tagOf(r.hiResPathname ?? r.hiResUrl ?? ""),
    colorStatus: r.colorStatus, colorPageCount: numArr(r.colorPages).length, reviewPages: numArr(r.reviewPages),
  }));
  const witnesses: WitnessLite[] = witnessRows.map((w) => ({ id: w.id, name: w.name }));
  const claims: ClaimLite[] = claimRows.map((c) => ({ id: c.id, name: c.name }));
  const elements: ElementLite[] = elementRows.map((e) => ({ id: e.id, claimId: e.claimId, text: e.text }));
  const recipients: RecipientLite[] = recipientRows.map((r) => ({ id: r.id, email: r.email, name: r.name, token: r.token, revoked: r.revoked }));

  return (
    <>
      <AdminHeader
        title={set.name}
        description={[set.causeNumber, set.court, set.matter ? `Matter ${set.matter}` : ""].filter(Boolean).join("  ·  ") || "Exhibit reviewer"}
      />
      {/* Full width — the reviewer's list + viewer use the whole monitor rather
          than leaving a wide empty gutter on the right. */}
      <div className="p-6 space-y-4">
        <Link href="/admin/exhibit-reviewer" className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <ChevronLeft size={15} /> All sets
        </Link>
        <ExhibitReviewer setId={id} docs={docs} witnesses={witnesses} claims={claims} elements={elements} blobReady={isBlobConfigured()} access={set.access} publicToken={set.publicToken} recipients={recipients} ocEnabled={set.ocEnabled} ocToken={set.ocToken} hasList={Boolean(set.listUrl)} listName={set.listName} listTag={tagOf(set.listPathname ?? set.listUrl ?? "")} />
      </div>
    </>
  );
}
