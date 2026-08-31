import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { portalMatters, portalCompanies, portalTasks, portalMessages, portalDocs } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { resolvePortalMember, isVerifiedPortalMember } from "@/lib/portal-access";
import { PortalGate } from "@/components/portal/PortalGate";
import { ClientMatter } from "@/components/portal/ClientMatter";
import { isBlobConfigured } from "@/lib/blob";
import { FIRM } from "@/lib/firm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Client Portal", robots: { index: false, follow: false } };

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This matter isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">It may be closed, or the link is no longer active.</p>
    </main>
  );
}

/**
 * One matter, as the CLIENT sees it: their to-do list, the shared client
 * documents (view + upload), and the correspondence thread. Nothing else —
 * pleadings, discovery, exhibits, the firm checklist, and time/dollars are
 * never sent to this page.
 */
export default async function PortalMatterPage({ params }: { params: Promise<{ token: string; matterId: string }> }) {
  const { token, matterId } = await params;
  const ctx = await resolvePortalMember(token);
  if (!ctx || !db) return <Unavailable />;
  if (!(await isVerifiedPortalMember(ctx))) return <PortalGate token={token} email={ctx.member.email} firmName={FIRM.name} />;

  const id = Number(matterId);
  if (!Number.isFinite(id)) return <Unavailable />;
  const [m] = await db.select().from(portalMatters).where(and(eq(portalMatters.id, id), eq(portalMatters.groupId, ctx.group.id)));
  if (!m || m.status !== "open") return <Unavailable />;

  const [companies, tasks, messages, docs] = await Promise.all([
    db.select().from(portalCompanies).where(eq(portalCompanies.groupId, ctx.group.id)),
    db.select().from(portalTasks).where(and(eq(portalTasks.matterId, id), eq(portalTasks.kind, "client"))).orderBy(asc(portalTasks.done), asc(portalTasks.createdAt)),
    db.select().from(portalMessages).where(eq(portalMessages.matterId, id)).orderBy(asc(portalMessages.createdAt)),
    db.select().from(portalDocs).where(and(eq(portalDocs.matterId, id), eq(portalDocs.tab, "client"))).orderBy(desc(portalDocs.createdAt)),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href={`/portal/${token}`} className="inline-flex items-center gap-1 text-sm text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
        <ChevronLeft size={15} /> All matters
      </Link>
      <header className="mt-3 border-b border-[var(--c-border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">{FIRM.name} — Client Portal</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--c-ink)]">{m.title}</h1>
        <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{companies.find((c) => c.id === m.companyId)?.name ?? ctx.group.name}</p>
      </header>

      <ClientMatter
        token={token}
        matterId={m.id}
        groupId={ctx.group.id}
        me={ctx.member.email}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, done: t.done }))}
        messages={messages.map((x) => ({ id: x.id, author: x.author, fromClient: x.fromClient, body: x.body, createdAt: x.createdAt.toISOString() }))}
        docs={docs.map((d) => ({ id: d.id, name: d.name, sizeBytes: d.sizeBytes, mine: d.uploadedBy.toLowerCase() === ctx.member.email.toLowerCase(), createdAt: d.createdAt.toISOString() }))}
        blobReady={isBlobConfigured()}
        firmName={FIRM.name}
      />
    </main>
  );
}
