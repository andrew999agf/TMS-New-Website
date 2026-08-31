import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Briefcase, ListChecks, FolderOpen } from "lucide-react";
import { db } from "@/db";
import { portalMatters, portalCompanies, portalTasks, portalDocs } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { resolvePortalMember, isVerifiedPortalMember } from "@/lib/portal-access";
import { PortalGate } from "@/components/portal/PortalGate";
import { FIRM } from "@/lib/firm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Client Portal", robots: { index: false, follow: false } };

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The portal link is turned off or no longer exists. Ask your attorney&apos;s office for a current link.</p>
    </main>
  );
}

/** The client's home: their active matters, each with what needs their attention. */
export default async function PortalHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolvePortalMember(token);
  if (!ctx || !db) return <Unavailable />;
  if (!(await isVerifiedPortalMember(ctx))) return <PortalGate token={token} email={ctx.member.email} firmName={FIRM.name} />;

  const [matters, companies] = await Promise.all([
    db.select().from(portalMatters).where(eq(portalMatters.groupId, ctx.group.id)).orderBy(asc(portalMatters.title)),
    db.select().from(portalCompanies).where(eq(portalCompanies.groupId, ctx.group.id)),
  ]);
  const open = matters.filter((m) => m.status === "open");
  const closedCount = matters.length - open.length;
  const ids = open.map((m) => m.id);
  const [tasks, docs] = ids.length
    ? await Promise.all([
        db.select({ matterId: portalTasks.matterId, done: portalTasks.done }).from(portalTasks).where(and(inArray(portalTasks.matterId, ids), eq(portalTasks.kind, "client"))),
        db.select({ matterId: portalDocs.matterId }).from(portalDocs).where(and(inArray(portalDocs.matterId, ids), eq(portalDocs.tab, "client"))),
      ])
    : [[], []];

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="border-b border-[var(--c-border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">{FIRM.name} — Client Portal</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--c-ink)]">{ctx.group.name}</h1>
        <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
          Welcome{ctx.member.name ? `, ${ctx.member.name}` : ""}. {companies.length ? companies.map((c) => c.name).join("  ·  ") : ""}
        </p>
      </header>

      <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-ink-muted)]">Active matters ({open.length})</h2>
      {open.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--c-border)] p-6 text-center text-sm text-[var(--c-ink-muted)]">No active matters right now.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((m) => {
            const todo = tasks.filter((t) => t.matterId === m.id && !t.done).length;
            const nDocs = docs.filter((d) => d.matterId === m.id).length;
            const company = companies.find((c) => c.id === m.companyId)?.name;
            return (
              <li key={m.id}>
                <Link href={`/portal/${token}/m/${m.id}`} className="flex items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 transition-colors hover:border-[var(--c-accent)]">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--c-accent)]/10 text-[var(--c-accent)]"><Briefcase size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--c-ink)]">{m.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--c-ink-muted)]">
                      {company && <span>{company}</span>}
                      <span className="inline-flex items-center gap-1"><FolderOpen size={11} /> {nDocs} document{nDocs === 1 ? "" : "s"}</span>
                      {todo > 0 && <span className="inline-flex items-center gap-1 font-semibold text-[var(--c-accent)]"><ListChecks size={11} /> {todo} item{todo === 1 ? "" : "s"} need{todo === 1 ? "s" : ""} your attention</span>}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-[var(--c-ink-muted)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {closedCount > 0 && <p className="mt-4 text-xs text-[var(--c-ink-muted)]">{closedCount} closed matter{closedCount === 1 ? "" : "s"} not shown.</p>}

      <footer className="mt-12 border-t border-[var(--c-border)] pt-5 text-xs leading-relaxed text-[var(--c-ink-muted)]">
        This portal is provided by {FIRM.name} for communication and document exchange on your matters. If something urgent comes up, call the office — the portal is not monitored around the clock.
      </footer>
    </main>
  );
}
