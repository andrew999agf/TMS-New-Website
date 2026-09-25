import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DiscoveryReviewer } from "@/components/admin/DiscoveryReviewer";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { discoverySets, discoveryDocs, discoveryMarks, exhibitSets, exhibitDocs, caseHub, shareFolders, type CaseParty } from "@/db/schema";
import { RequestClientDocs, type ClientFolderChip } from "@/components/admin/RequestClientDocs";
import { ensureDiscoveryTables } from "@/db/ensure";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DiscoverySetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/discovery-reviewer", session.role, session.permissions)) notFound();
  const { id } = await params;
  const setId = Number(id);
  if (!Number.isFinite(setId) || !db) notFound();

  await ensureDiscoveryTables();
  const [set] = await db.select().from(discoverySets).where(eq(discoverySets.id, setId));
  if (!set) notFound();

  const docs = await db.select().from(discoveryDocs).where(eq(discoveryDocs.setId, setId)).orderBy(asc(discoveryDocs.sort), asc(discoveryDocs.id));
  const marks = await db.select().from(discoveryMarks).where(eq(discoveryMarks.setId, setId)).orderBy(asc(discoveryMarks.id));

  // The case's parties from the central record, for the service-info dialog.
  let parties: CaseParty[] = [];
  if (set.matter) {
    try {
      const [hubRow] = await db.select({ parties: caseHub.parties }).from(caseHub).where(eq(caseHub.matter, set.matter));
      parties = ((hubRow?.parties as CaseParty[]) ?? []).filter((party) => party?.name);
    } catch { /* hub table pending */ }
  }

  // Client document-request folders already set up for this matter.
  let clientFolders: ClientFolderChip[] = [];
  if (set.matter) {
    try {
      clientFolders = (await db.select({ id: shareFolders.id, name: shareFolders.name, discoveryPrefix: shareFolders.discoveryPrefix })
        .from(shareFolders)
        .where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client"), eq(shareFolders.archived, false))))
        .map((f) => ({ id: f.id, name: f.name, rfp: !!f.discoveryPrefix }));
    } catch { /* share tables optional */ }
  }

  // The linked exhibit set (same matter, not archived, oldest first) and its
  // current numbering, so the save dialog can offer the next free number.
  let linked: { id: number; name: string } | null = null;
  let usedNumbers: { plaintiff: number[]; defendant: number[] } = { plaintiff: [], defendant: [] };
  if (set.matter) {
    const [ex] = await db.select({ id: exhibitSets.id, name: exhibitSets.name }).from(exhibitSets)
      .where(and(eq(exhibitSets.matter, set.matter), eq(exhibitSets.archived, false)))
      .orderBy(asc(exhibitSets.id)).limit(1);
    if (ex) {
      linked = ex;
      const nums = await db.select({ side: exhibitDocs.side, number: exhibitDocs.number }).from(exhibitDocs).where(eq(exhibitDocs.setId, ex.id));
      usedNumbers = {
        plaintiff: nums.filter((n) => n.side === "plaintiff" && n.number != null).map((n) => n.number!),
        defendant: nums.filter((n) => n.side === "defendant" && n.number != null).map((n) => n.number!),
      };
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-6 py-3">
        <Link href="/admin/discovery-reviewer" className="inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
          <ArrowLeft size={15} /> Discovery cases
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-lg">{set.name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-[var(--c-ink-muted)]">
          {set.causeNumber && <span>{set.causeNumber}</span>}
          {set.matter && <span>Matter {set.matter}</span>}
          {linked ? (
            <Link href={`/admin/exhibit-reviewer/${linked.id}`} className="text-emerald-600 hover:underline dark:text-emerald-400">
              Linked exhibit set: {linked.name} →
            </Link>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              {set.matter ? "No exhibit set for this matter yet — you'll be asked to create one on the first exhibit." : "No matter number — exhibits can't be linked until one is set."}
            </span>
          )}
        </div>
        <div className="ml-auto">
          <RequestClientDocs setId={setId} existing={clientFolders} />
        </div>
      </div>
      <DiscoveryReviewer
        setId={setId}
        docs={docs.map((d) => ({ id: d.id, name: d.name, pageCount: d.pageCount, sizeBytes: d.sizeBytes, servedAt: d.servedAt, servedBy: d.servedBy, servedTo: d.servedTo }))}
        marks={marks.map((m) => ({ id: m.id, party: m.party as "P" | "D", number: m.number, label: m.label, title: m.title, pages: (m.pages as { docId: number; page: number }[]) ?? [], exhibitSetId: m.exhibitSetId }))}
        usedNumbers={usedNumbers}
        parties={parties}
        caseName={set.name}
        matter={set.matter}
      />
    </div>
  );
}
