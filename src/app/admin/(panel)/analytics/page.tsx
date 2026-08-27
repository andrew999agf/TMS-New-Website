import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { db } from "@/db";
import { pageViews } from "@/db/schema";
import { gte, sql } from "drizzle-orm";
import { FIRM } from "@/lib/firm";
import { Eye, TrendingUp, CalendarDays, ExternalLink, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

/** UTC YYYY-MM-DD, matching how /api/pv stores the `day` column. */
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Bucket a stored referrer into a readable traffic source. */
function referrerSource(ref: string | null): string {
  const r = (ref ?? "").trim();
  if (!r) return "Direct / bookmarked";
  try {
    const host = new URL(r).hostname.replace(/^www\./, "");
    if (host === FIRM.domain || host.endsWith(`.${FIRM.domain}`)) return "Within the site";
    if (/(google|bing|duckduckgo|yahoo|ecosia|brave)\./.test(host)) return `Search — ${host}`;
    if (/(facebook|instagram|twitter|x\.com|t\.co|linkedin|reddit|youtube|tiktok)/.test(host)) return `Social — ${host}`;
    return host;
  } catch {
    return "Other";
  }
}

async function getAnalytics(days: WindowDays) {
  const since = new Date(Date.now() - days * 86400_000);
  const [tot] = await db!.select({ c: sql<number>`count(*)` }).from(pageViews).where(gte(pageViews.createdAt, since));
  const daily = await db!
    .select({ day: pageViews.day, c: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since))
    .groupBy(pageViews.day);
  const paths = await db!
    .select({ path: pageViews.path, c: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since))
    .groupBy(pageViews.path)
    .orderBy(sql`count(*) desc`)
    .limit(15);
  const refRows = await db!
    .select({ referrer: pageViews.referrer, c: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since))
    .groupBy(pageViews.referrer);

  // Fill every day in the window so the trend has no gaps.
  const counts = new Map(daily.map((d) => [d.day, Number(d.c)]));
  const series: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = utcDay(new Date(Date.now() - i * 86400_000));
    series.push({ day: key, count: counts.get(key) ?? 0 });
  }

  // Re-aggregate referrers into readable sources.
  const srcMap = new Map<string, number>();
  for (const r of refRows) {
    const key = referrerSource(r.referrer);
    srcMap.set(key, (srcMap.get(key) ?? 0) + Number(r.c));
  }
  const sources = [...srcMap.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const total = Number(tot?.c ?? 0);
  const busiest = series.reduce((m, d) => (d.count > m.count ? d : m), { day: "", count: 0 });
  return {
    total,
    perDay: Math.round(total / days),
    busiest,
    series,
    paths: paths.map((p) => ({ path: p.path, count: Number(p.c) })),
    sources,
  };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/analytics", session.role, session.permissions)) notFound();

  const dParam = Number((await searchParams).d);
  const days: WindowDays = (WINDOWS as readonly number[]).includes(dParam) ? (dParam as WindowDays) : 30;

  const a = db ? await getAnalytics(days).catch(() => null) : null;
  const maxDay = a ? Math.max(1, ...a.series.map((s) => s.count)) : 1;
  const fmtDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <AdminHeader title="Analytics" description="First-party site traffic — page views over time, top pages, and how people arrived." />
      <div className="p-8 space-y-8">
        {/* Window selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--c-ink-muted)]">Window:</span>
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/admin/analytics?d=${w}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${w === days ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)]"}`}
            >
              {w} days
            </Link>
          ))}
        </div>

        {!a ? (
          <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm text-[var(--c-ink-muted)]">
            No traffic recorded yet. First-party page views accrue as visitors browse the public site.
          </p>
        ) : (
          <>
            {/* Headline numbers */}
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: `Page views (${days} days)`, value: a.total.toLocaleString(), icon: Eye },
                { label: "Average per day", value: a.perDay.toLocaleString(), icon: TrendingUp },
                { label: "Busiest day", value: a.busiest.count ? `${a.busiest.count.toLocaleString()}` : "—", sub: a.busiest.count ? fmtDay(a.busiest.day) : "", icon: CalendarDays },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.label} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                    <div className="flex items-center justify-between text-[var(--c-ink-muted)]"><Icon size={18} /></div>
                    <div className="mt-3 font-[family-name:var(--font-display)] text-4xl">{c.value}</div>
                    <div className="mt-1 text-sm text-[var(--c-ink-muted)]">{c.label}{c.sub ? ` · ${c.sub}` : ""}</div>
                  </div>
                );
              })}
            </div>

            {/* Daily trend */}
            <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
              <h2 className="mb-4 font-[family-name:var(--font-ui)] font-semibold">Views per day</h2>
              <div className="flex h-48 items-end gap-px overflow-x-auto">
                {a.series.map((s) => (
                  <div key={s.day} className="group relative flex min-w-[6px] flex-1 flex-col items-center justify-end" title={`${fmtDay(s.day)}: ${s.count} view${s.count === 1 ? "" : "s"}`}>
                    <span className="w-full rounded-t bg-[var(--c-accent)]" style={{ height: `${(s.count / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[var(--c-ink-muted)]">
                <span>{fmtDay(a.series[0].day)}</span>
                <span>{fmtDay(a.series[a.series.length - 1].day)}</span>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top pages */}
              <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
                <h2 className="mb-4 inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><FileText size={16} className="text-[var(--c-accent)]" /> Top pages</h2>
                {a.paths.length === 0 ? (
                  <p className="text-sm text-[var(--c-ink-muted)]">No pages recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {a.paths.map((t) => {
                      const max = a.paths[0]?.count || 1;
                      return (
                        <li key={t.path} className="flex items-center gap-3 text-sm">
                          <span className="w-44 truncate text-[var(--c-ink-muted)]" title={t.path}>{t.path}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--c-surface-2)]"><span className="block h-full bg-[var(--c-accent)]" style={{ width: `${(t.count / max) * 100}%` }} /></span>
                          <span className="w-12 text-right tabular-nums">{t.count.toLocaleString()}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Traffic sources */}
              <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
                <h2 className="mb-4 inline-flex items-center gap-2 font-[family-name:var(--font-ui)] font-semibold"><ExternalLink size={16} className="text-[var(--c-accent)]" /> How people arrived</h2>
                {a.sources.length === 0 ? (
                  <p className="text-sm text-[var(--c-ink-muted)]">No sources recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {a.sources.map((t) => {
                      const max = a.sources[0]?.count || 1;
                      return (
                        <li key={t.source} className="flex items-center gap-3 text-sm">
                          <span className="w-44 truncate text-[var(--c-ink-muted)]" title={t.source}>{t.source}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--c-surface-2)]"><span className="block h-full bg-[var(--c-accent)]" style={{ width: `${(t.count / max) * 100}%` }} /></span>
                          <span className="w-12 text-right tabular-nums">{t.count.toLocaleString()}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            {/* What the numbers mean */}
            <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm leading-relaxed text-[var(--c-ink-muted)]">
              <h2 className="mb-2 font-[family-name:var(--font-ui)] font-semibold text-[var(--c-ink)]">What this measures</h2>
              <p>These are <strong className="text-[var(--c-ink)]">first-party page views</strong> of the public site — one count each time a visitor opens or navigates to a page. It uses no cookies and stores no personal information, only the page path and the referring site.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Counts <strong className="text-[var(--c-ink)]">page views, not unique visitors</strong> — one person reading five pages is five views.</li>
                <li>The admin panel and internal tools are <strong className="text-[var(--c-ink)]">excluded</strong>; only your public website is counted.</li>
                <li>Automated crawlers that run JavaScript may add a small number of views; most bots don&apos;t.</li>
                <li>For visitor-level detail (unique users, sessions, geography), connect Google Analytics under <Link href="/admin/settings" className="text-[var(--c-accent)] hover:underline">Settings</Link>.</li>
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
