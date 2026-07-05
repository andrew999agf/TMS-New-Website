import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Newspaper, ChevronRight } from "lucide-react";
import { PatriotShell } from "../PatriotShell";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { getSetting } from "@/lib/content";
import { PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS, type PatriotArticle } from "@/lib/patriot/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News · Patriot Series",
  description: "Tournament coverage from the Patriot Series.",
  robots: { index: false, follow: false },
};

export default async function PatriotNewsPage() {
  const vis = await getPageVisibility();
  if (!vis.news) redirect("/");

  const articles = await getSetting<PatriotArticle[]>(PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS);

  return (
    <PatriotShell active="/news" title="News" subtitle="Coverage from the tournament.">
      <div className="mx-auto max-w-3xl space-y-4">
        {articles.length === 0 && (
          <p className="text-center text-sm text-[color:var(--psx-muted)]">No stories yet — check back during the tournament.</p>
        )}
        {articles.map((a) => (
          <Link
            key={a.id}
            href={`/news/${a.id}`}
            className="group block overflow-hidden rounded-2xl border border-[color:var(--psx-border)] bg-[var(--psx-surface)] transition-colors hover:border-[color:var(--psx-accent)]"
          >
            {a.banner && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.banner} alt="" className="h-44 w-full object-cover sm:h-56" />
            )}
            <div className="p-5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--psx-accent)]">
                <Newspaper size={12} />
                {a.tournamentYear ? `${a.tournamentYear} Tournament` : "Patriot Series"} · {a.date}
              </p>
              <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-xl font-bold leading-snug text-[color:var(--psx-fg)]">
                {a.title}
              </h2>
              {a.dek && <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--psx-muted)]">{a.dek}</p>}
              <p className="mt-3 flex items-center gap-0.5 text-xs font-medium text-[color:var(--psx-accent)]">
                Read story <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </p>
            </div>
          </Link>
        ))}
      </div>
    </PatriotShell>
  );
}
