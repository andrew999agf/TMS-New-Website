import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminShell";
import { db } from "@/db";
import {
  blogPosts,
  intakeSubmissions,
  pageViews as pageViewsTable,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { BLOG_POSTS } from "@/lib/content/defaults/posts";
import { formatDate } from "@/lib/utils";
import { ArrowUpRight, CalendarClock, Inbox, Newspaper, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

async function getStats() {
  if (!db) {
    const scheduled = BLOG_POSTS.filter((p) => p.status === "scheduled").length;
    const published = BLOG_POSTS.filter((p) => p.status === "published").length;
    return {
      published,
      scheduled,
      intakeCount: 0,
      views30: 0,
      recentIntake: [] as { id: number; branch: string; name: string | null; createdAt: Date; isUrgent: boolean }[],
      upcoming: BLOG_POSTS.filter((p) => p.status === "scheduled")
        .sort((a, b) => (a.publishAt ?? "").localeCompare(b.publishAt ?? ""))
        .slice(0, 5)
        .map((p) => ({ title: p.title, publishAt: p.publishAt })),
      topPaths: [] as { path: string; count: number }[],
    };
  }
  try {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [pub] = await db.select({ c: sql<number>`count(*)` }).from(blogPosts).where(eq(blogPosts.status, "published"));
    const [sch] = await db.select({ c: sql<number>`count(*)` }).from(blogPosts).where(eq(blogPosts.status, "scheduled"));
    const [intk] = await db.select({ c: sql<number>`count(*)` }).from(intakeSubmissions);
    const [vw] = await db
      .select({ c: sql<number>`count(*)` })
      .from(pageViewsTable)
      .where(gte(pageViewsTable.createdAt, since));
    const topPaths = await db
      .select({ path: pageViewsTable.path, c: sql<number>`count(*)` })
      .from(pageViewsTable)
      .where(gte(pageViewsTable.createdAt, since))
      .groupBy(pageViewsTable.path)
      .orderBy(sql`count(*) desc`)
      .limit(8);
    const recentIntake = await db
      .select()
      .from(intakeSubmissions)
      .orderBy(desc(intakeSubmissions.createdAt))
      .limit(5);
    const upcoming = await db
      .select({ title: blogPosts.title, publishAt: blogPosts.publishAt })
      .from(blogPosts)
      .where(and(eq(blogPosts.status, "scheduled"), gte(blogPosts.publishAt, new Date())))
      .orderBy(blogPosts.publishAt)
      .limit(5);
    return {
      published: Number(pub?.c ?? 0),
      scheduled: Number(sch?.c ?? 0),
      intakeCount: Number(intk?.c ?? 0),
      views30: Number(vw?.c ?? 0),
      recentIntake: recentIntake.map((r) => ({
        id: r.id,
        branch: r.branch,
        name: r.name,
        createdAt: r.createdAt,
        isUrgent: r.isUrgent,
      })),
      upcoming: upcoming.map((u) => ({ title: u.title, publishAt: u.publishAt?.toISOString() })),
      topPaths: topPaths.map((t) => ({ path: t.path, count: Number(t.c) })),
    };
  } catch {
    return { published: 0, scheduled: 0, intakeCount: 0, views30: 0, recentIntake: [], upcoming: [], topPaths: [] };
  }
}

export default async function DashboardPage() {
  const s = await getStats();

  const cards = [
    { label: "Published posts", value: s.published, icon: Newspaper, href: "/admin/blog" },
    { label: "Scheduled posts", value: s.scheduled, icon: CalendarClock, href: "/admin/blog" },
    { label: "Intake submissions", value: s.intakeCount, icon: Inbox, href: "/admin/intake" },
    { label: "Views (30 days)", value: s.views30, icon: Eye, href: "/admin/analytics" },
  ];

  return (
    <>
      <AdminHeader title="Dashboard" description="At a glance — content, intake, and traffic." />
      <div className="p-8 space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.label}
                href={c.href}
                className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 hover:border-[var(--c-accent)] transition-colors"
              >
                <div className="flex items-center justify-between text-[var(--c-ink-muted)]">
                  <Icon size={18} />
                  <ArrowUpRight size={15} />
                </div>
                <div className="mt-3 font-[family-name:var(--font-display)] text-4xl">{c.value}</div>
                <div className="text-sm text-[var(--c-ink-muted)] mt-1">{c.label}</div>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-ui)] font-semibold">Recent intake</h2>
              <Link href="/admin/intake" className="text-sm text-[var(--c-accent)]">View all</Link>
            </div>
            {s.recentIntake.length === 0 ? (
              <p className="text-sm text-[var(--c-ink-muted)]">No submissions yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--c-border)]">
                {s.recentIntake.map((r) => (
                  <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-medium">{r.name ?? "—"}</span>
                      <span className="text-sm text-[var(--c-ink-muted)] ml-2">{r.branch}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.isUrgent && (
                        <span className="text-xs text-white bg-[var(--c-error)] px-2 py-0.5 rounded">Urgent</span>
                      )}
                      <span className="text-xs text-[var(--c-ink-muted)]">{formatDate(r.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[family-name:var(--font-ui)] font-semibold">Upcoming scheduled posts</h2>
              <Link href="/admin/blog" className="text-sm text-[var(--c-accent)]">Calendar</Link>
            </div>
            {s.upcoming.length === 0 ? (
              <p className="text-sm text-[var(--c-ink-muted)]">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-[var(--c-border)]">
                {s.upcoming.map((u, i) => (
                  <li key={i} className="py-3 flex items-center justify-between gap-3">
                    <span className="text-sm truncate">{u.title}</span>
                    <span className="text-xs text-[var(--c-ink-muted)] whitespace-nowrap">
                      {formatDate(u.publishAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-ui)] font-semibold">Top pages — last 30 days</h2>
            <Link href="/admin/analytics" className="text-sm text-[var(--c-accent)]">Full analytics</Link>
          </div>
          {s.topPaths.length === 0 ? (
            <p className="text-sm text-[var(--c-ink-muted)]">
              No traffic recorded yet. First-party page views accrue once the database is live.
            </p>
          ) : (
            <ul className="space-y-2">
              {s.topPaths.map((t) => {
                const max = s.topPaths[0]?.count || 1;
                return (
                  <li key={t.path} className="flex items-center gap-3 text-sm">
                    <span className="w-48 truncate text-[var(--c-ink-muted)]">{t.path}</span>
                    <span className="flex-1 h-2 rounded-full bg-[var(--c-surface2)] overflow-hidden">
                      <span className="block h-full bg-[var(--c-accent)]" style={{ width: `${(t.count / max) * 100}%` }} />
                    </span>
                    <span className="w-10 text-right tabular-nums">{t.count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
