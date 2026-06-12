import { AdminHeader } from "@/components/admin/AdminShell";
import { ResultsManager } from "@/components/admin/ResultsManager";
import { getResults, getPracticeAreas } from "@/lib/content";
import { db, hasDb } from "@/db";
import { caseResults } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ResultsAdmin() {
  const practices = await getPracticeAreas();

  let results: Array<{
    id: number;
    category: "marquee" | "appellate" | "settlement" | "jury" | "other";
    title: string;
    stat?: string;
    statLabel?: string;
    year?: string;
    summary?: string;
    detail?: string;
    cite?: string;
    link?: string;
    practiceSlug?: string;
    featuredHome: boolean;
  }> = [];

  if (db) {
    try {
      const rows = await db.select().from(caseResults).orderBy(asc(caseResults.sort));
      results = rows.map((r) => ({
        id: r.id,
        category: r.category as "marquee" | "appellate" | "settlement" | "jury" | "other",
        title: r.title,
        stat: r.stat ?? undefined,
        statLabel: r.statLabel ?? undefined,
        year: r.year ?? undefined,
        summary: r.summary ?? undefined,
        detail: r.detail ?? undefined,
        cite: r.cite ?? undefined,
        link: r.link ?? undefined,
        practiceSlug: r.practiceSlug ?? undefined,
        featuredHome: r.featuredHome,
      }));
    } catch {
      results = [];
    }
  }
  if (results.length === 0) {
    const seed = await getResults();
    results = seed.map((r, i) => ({
      id: -(i + 1),
      category: r.category,
      title: r.title,
      stat: r.stat,
      statLabel: r.statLabel,
      year: r.year,
      summary: r.summary,
      detail: r.detail,
      cite: r.cite,
      link: r.link,
      practiceSlug: r.practiceSlug,
      featuredHome: r.featuredHome ?? false,
    }));
  }

  return (
    <>
      <AdminHeader
        title="Results"
        description="Every result is editable: category, stat, summary, citation, home-feature toggle."
      />
      <div className="p-8">
        <ResultsManager
          results={results}
          practices={practices.map((p) => ({ slug: p.slug, title: p.title }))}
          dbEnabled={hasDb}
        />
      </div>
    </>
  );
}
