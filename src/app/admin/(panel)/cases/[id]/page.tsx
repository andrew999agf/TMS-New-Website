import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, FileSearch, FileStack, FolderLock, Clock } from "lucide-react";
import { CaseDetail } from "@/components/admin/CaseDetail";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { caseHub, trialCases, discoverySets, exhibitSets, shareFolders, type CaseParty } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Where each tool keeps this case's work, resolved by matter number. */
async function resolveToolLinks(matter: string) {
  const links = {
    pretrial: null as number | null,
    discovery: null as number | null,
    exhibits: null as number | null,
    share: null as number | null,
  };
  if (!db || !matter) return links;
  const first = async <T extends { id: number }>(rows: T[]) => rows[0]?.id ?? null;
  try {
    links.pretrial = await first(await db.select({ id: trialCases.id }).from(trialCases).where(and(eq(trialCases.matter, matter), eq(trialCases.archived, false))).orderBy(asc(trialCases.id)).limit(1));
  } catch { /* table absent */ }
  try {
    links.discovery = await first(await db.select({ id: discoverySets.id }).from(discoverySets).where(and(eq(discoverySets.matter, matter), eq(discoverySets.archived, false))).orderBy(asc(discoverySets.id)).limit(1));
  } catch { /* table absent */ }
  try {
    links.exhibits = await first(await db.select({ id: exhibitSets.id }).from(exhibitSets).where(and(eq(exhibitSets.matter, matter), eq(exhibitSets.archived, false))).orderBy(asc(exhibitSets.id)).limit(1));
  } catch { /* table absent */ }
  try {
    links.share = await first(await db.select({ id: shareFolders.id }).from(shareFolders).where(eq(shareFolders.matter, matter)).orderBy(asc(shareFolders.id)).limit(1));
  } catch { /* table absent */ }
  return links;
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/cases", session.role, session.permissions)) notFound();
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isFinite(caseId) || !db) notFound();

  await ensureDiscoveryTables();
  const [c] = await db.select().from(caseHub).where(eq(caseHub.id, caseId));
  if (!c) notFound();

  const links = await resolveToolLinks(c.matter);

  const tools = [
    { label: "Pre-Trial Checklist", icon: CalendarClock, href: links.pretrial ? `/admin/pre-trial/${links.pretrial}` : "/admin/pre-trial", found: !!links.pretrial },
    { label: "Discovery Reviewer", icon: FileStack, href: links.discovery ? `/admin/discovery-reviewer/${links.discovery}` : "/admin/discovery-reviewer", found: !!links.discovery },
    { label: "Exhibit Reviewer", icon: FileSearch, href: links.exhibits ? `/admin/exhibit-reviewer/${links.exhibits}` : "/admin/exhibit-reviewer", found: !!links.exhibits },
    { label: "Share Folders", icon: FolderLock, href: links.share ? `/admin/share-folders/${links.share}` : "/admin/share-folders", found: !!links.share },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 p-6">
      <Link href="/admin/cases" className="inline-flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
        <ArrowLeft size={15} /> All cases
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="min-w-0 break-words font-[family-name:var(--font-display)] text-2xl">{c.name || `Matter ${c.matter}`}</h1>
        <span className="text-sm text-[var(--c-ink-muted)]">Matter {c.matter}</span>
        {c.causeNumber && <span className="text-sm text-[var(--c-ink-muted)]">{c.causeNumber}</span>}
      </div>

      {/* The horizontal tool bar: this case's work everywhere else. */}
      <div className="mt-5 flex flex-wrap items-stretch gap-2 border-y border-[var(--c-border)] py-3">
        {tools.map((t) => (
          <Link key={t.label} href={t.href}
            className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm transition-colors ${t.found ? "border-[var(--c-border)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]" : "border-dashed border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)]"}`}
            title={t.found ? `Open this case in the ${t.label}` : `Nothing for this case there yet — opens the ${t.label} list`}>
            <t.icon size={15} /> {t.label}
            {!t.found && <span className="rounded bg-[var(--c-bg)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">none yet</span>}
          </Link>
        ))}
        <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-[var(--c-border)] px-3.5 py-2 text-sm text-[var(--c-ink-muted)]"
          title="Case-level time & expense tracking is being built — the Time Tracker keeps feeding Clio unchanged in the meantime.">
          <Clock size={15} /> Time / Expenses
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">in progress</span>
        </span>
      </div>

      <CaseDetail
        caseRow={{
          id: c.id, matter: c.matter, name: c.name, causeNumber: c.causeNumber, court: c.court,
          county: c.county, notes: c.notes, parties: (c.parties as CaseParty[]) ?? [],
        }}
      />
    </div>
  );
}