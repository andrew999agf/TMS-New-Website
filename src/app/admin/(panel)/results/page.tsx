import { AdminHeader } from "@/components/admin/AdminShell";
import { getResults } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function ResultsAdmin() {
  const results = await getResults();
  const byCat = (c: string) => results.filter((r) => r.category === c);
  const groups: { id: string; label: string }[] = [
    { id: "marquee", label: "Marquee" },
    { id: "appellate", label: "Appellate record" },
    { id: "settlement", label: "Settlements & recoveries" },
    { id: "jury", label: "Jury-trial record" },
  ];

  return (
    <>
      <AdminHeader
        title="Results"
        description="Every result is a record: title, category, stat, summary, detail, cite, visibility, sort."
      />
      <div className="p-8 space-y-8 max-w-3xl">
        {groups.map((g) => (
          <section key={g.id}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)] mb-3">{g.label}</h2>
            <div className="rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
              {byCat(g.id).map((r, i) => (
                <div key={i} className="px-5 py-3.5 bg-[var(--c-surface)] flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    {r.cite && <div className="text-xs text-[var(--c-ink-muted)]">{r.cite}</div>}
                  </div>
                  {r.stat && <span className="text-sm text-[var(--c-accent)] font-medium whitespace-nowrap">{r.stat}</span>}
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="text-sm text-[var(--c-ink-muted)]">
          Results are seeded from verified firm facts. Full CRUD writes to the
          <code className="mx-1">case_results</code> table; the public Results page and per-area
          sidebars read from it automatically.
        </p>
      </div>
    </>
  );
}
