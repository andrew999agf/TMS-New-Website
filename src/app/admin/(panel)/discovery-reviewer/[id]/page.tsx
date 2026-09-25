import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { discoverySets, discoveryDocs, discoveryMarks, exhibitSets, exhibitDocs, caseHub, shareFolders, shareFiles, shareRecipients, productionDocs, productions, type CaseParty } from "@/db/schema";
import { DiscoveryWorkspace } from "@/components/admin/DiscoveryWorkspace";
import { RequestTracker, type ClientFile, type StagedDoc, type ProductionRow, type RequestRow } from "@/components/admin/ProductionPipeline";
import { RequestClientDocs, type ClientFolderChip } from "@/components/admin/RequestClientDocs";
import { ensureDiscoveryTables } from "@/db/ensure";
import { and, asc, eq, inArray } from "drizzle-orm";

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

  const allDocs = await db.select().from(discoveryDocs).where(eq(discoveryDocs.setId, setId)).orderBy(asc(discoveryDocs.sort), asc(discoveryDocs.id));
  // The opposing-production reviewer shows only its own bucket; documents
  // moved to the client bucket surface under "Documents received from Client".
  const docs = allDocs.filter((d) => d.bucket !== "client");
  const movedDocs = allDocs.filter((d) => d.bucket === "client");
  let marks = await db.select().from(discoveryMarks).where(eq(discoveryMarks.setId, setId)).orderBy(asc(discoveryMarks.id));

  // Self-heal designations whose exhibit was deleted before badge-sync
  // existed: a mark pointing at a vanished exhibit doc is stale — drop it so
  // no ghost P-/D- bubble lingers on the grid.
  const exDocIds = marks.map((m) => m.exhibitDocId).filter((n): n is number => n != null);
  if (exDocIds.length) {
    try {
      const alive = new Set((await db.select({ id: exhibitDocs.id }).from(exhibitDocs).where(inArray(exhibitDocs.id, exDocIds))).map((r) => r.id));
      const stale = marks.filter((m) => m.exhibitDocId != null && !alive.has(m.exhibitDocId));
      if (stale.length) {
        await db.delete(discoveryMarks).where(inArray(discoveryMarks.id, stale.map((m) => m.id)));
        marks = marks.filter((m) => !stale.some((x) => x.id === m.id));
      }
    } catch { /* best-effort */ }
  }

  // The case's parties from the central record, for the service-info dialog.
  let parties: CaseParty[] = [];
  if (set.matter) {
    try {
      const [hubRow] = await db.select({ parties: caseHub.parties }).from(caseHub).where(eq(caseHub.matter, set.matter));
      parties = ((hubRow?.parties as CaseParty[]) ?? []).filter((party) => party?.name);
    } catch { /* hub table pending */ }
  }

  // Client document-request folders, their recipients and files — the request
  // tracker, and the "received from client" production pipeline feed.
  let clientFolders: ClientFolderChip[] = [];
  let requests: RequestRow[] = [];
  let clientFiles: ClientFile[] = [];
  if (set.matter) {
    try {
      const folders = await db.select().from(shareFolders)
        .where(and(eq(shareFolders.matter, set.matter), eq(shareFolders.type, "client"), eq(shareFolders.archived, false)));
      clientFolders = folders.map((f) => ({ id: f.id, name: f.name, rfp: !!f.discoveryPrefix }));
      if (folders.length) {
        const fids = folders.map((f) => f.id);
        const recs = await db.select().from(shareRecipients).where(inArray(shareRecipients.folderId, fids));
        const files = await db.select().from(shareFiles).where(inArray(shareFiles.folderId, fids));
        requests = folders.map((f) => {
          const rec = recs.find((r) => r.folderId === f.id);
          return {
            folderId: f.id,
            who: rec ? (rec.name || rec.email) : "(no recipient yet)",
            sentAt: f.createdAt.toISOString().slice(0, 10),
            responseDue: f.responseDue,
            clientDue: f.clientDue,
            files: files.filter((x) => x.folderId === f.id).length,
            rfp: !!f.discoveryPrefix,
          };
        });
        const byId = new Map(folders.map((f) => [f.id, f.name]));
        clientFiles = files
          .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
          .map((x) => {
            const parts = x.filename.split("/");
            return {
              key: `share:${x.id}`,
              name: parts[parts.length - 1] || x.filename,
              dir: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
              folderId: x.folderId,
              folderName: byId.get(x.folderId) ?? "",
              createdAt: x.createdAt.toISOString(),
              status: "" as const,
            };
          });
      }
    } catch { /* share tables optional */ }
  }

  // Production pipeline state.
  let staged: StagedDoc[] = [];
  let prods: ProductionRow[] = [];
  let batesDefaults = { prefix: (set.matter.includes("-") ? set.matter.slice(set.matter.indexOf("-") + 1) : set.name.split(/\s+/)[0] || "BATES").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "BATES", nextStart: 1 };
  for (const d of movedDocs) {
    clientFiles.push({
      key: `doc:${d.id}`,
      name: d.name,
      dir: "",
      folderId: null,
      folderName: "Opposing production",
      createdAt: d.createdAt.toISOString(),
      status: "",
      movedFromOpposing: true,
    });
  }

  try {
    const pdocs = await db.select().from(productionDocs).where(eq(productionDocs.setId, setId));
    staged = pdocs.map((d) => ({ id: d.id, name: d.name, requestLabel: d.requestLabel, url: d.url, batesPrefix: d.batesPrefix, batesStart: d.batesStart, batesEnd: d.batesEnd, productionId: d.productionId }));
    const sourceStatus = new Map(pdocs.map((d) => [d.sourceKey, d.status === "produced" ? "produced" as const : "staged" as const]));
    clientFiles = clientFiles.map((f) => ({ ...f, status: sourceStatus.get(f.key) ?? "" }));
    if (pdocs.length) {
      const latest = pdocs.reduce((a, b) => (b.id > a.id ? b : a));
      batesDefaults = { prefix: latest.batesPrefix || batesDefaults.prefix, nextStart: Math.max(0, ...pdocs.map((d) => d.batesEnd)) + 1 };
    }
    prods = (await db.select().from(productions).where(eq(productions.setId, setId)))
      .map((r) => ({ id: r.id, label: r.label, batesPrefix: r.batesPrefix, batesStart: r.batesStart, batesEnd: r.batesEnd, producedAt: r.producedAt ? r.producedAt.toISOString() : null, letterUrl: r.letterUrl, fileUrl: r.fileUrl, fileName: r.fileName, token: r.token }));
  } catch { /* production tables optional */ }

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
        <div className="ml-auto flex flex-col items-end gap-2">
          <RequestClientDocs setId={setId} existing={clientFolders} />
          <RequestTracker requests={requests} />
        </div>
      </div>
      <DiscoveryWorkspace
        reviewerProps={{
          setId,
          docs: docs.map((d) => ({ id: d.id, name: d.name, pageCount: d.pageCount, sizeBytes: d.sizeBytes, servedAt: d.servedAt, servedBy: d.servedBy, servedTo: d.servedTo })),
          marks: marks.map((m) => ({ id: m.id, party: m.party as "P" | "D", number: m.number, label: m.label, title: m.title, pages: (m.pages as { docId: number; page: number }[]) ?? [], exhibitSetId: m.exhibitSetId })),
          usedNumbers,
          parties,
          caseName: set.name,
          matter: set.matter,
        }}
        clientFiles={clientFiles}
        staged={staged}
        prods={prods}
        batesDefaults={batesDefaults}
      />
    </div>
  );
}
