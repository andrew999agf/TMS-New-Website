import Link from "next/link";
import type { Metadata } from "next";
import { getPublicSet, orderPublicDocs } from "@/lib/exhibit-review/public";
import { FIRM } from "@/lib/firm";

export const dynamic = "force-dynamic";

const SIDE_LABEL: Record<string, string> = { plaintiff: "Plaintiff's Exhibits", defendant: "Defendant's Exhibits", joint: "Joint Exhibits" };

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const set = await getPublicSet(token);
  return { title: set ? `Exhibits — ${set.name}` : "Exhibits", robots: { index: false, follow: false } };
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
      <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The exhibit share link is turned off or no longer exists. Ask whoever sent it for a current link.</p>
    </main>
  );
}

export default async function PublicExhibitIndex({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const set = await getPublicSet(token);
  if (!set) return <Unavailable />;

  const ordered = orderPublicDocs(set.docs);
  const groups = ["plaintiff", "defendant", "joint"]
    .map((s) => ({ side: s, items: ordered.filter((d) => d.side === s) }))
    .filter((g) => g.items.length);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="border-b border-[var(--c-border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">Exhibits</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--c-ink)]">{set.name}</h1>
        <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
          {[set.causeNumber, set.court].filter(Boolean).join("  ·  ")}
        </p>
      </header>

      {ordered.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--c-ink-muted)]">No exhibits have been shared yet.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.side}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)]">{SIDE_LABEL[g.side] ?? "Exhibits"}</h2>
              <ul className="divide-y divide-[var(--c-border)] overflow-hidden rounded-lg border border-[var(--c-border)]">
                {g.items.map((d) => (
                  <li key={d.id}>
                    <Link href={`/exhibits/${token}/e/${d.id}`} className="flex items-start gap-3 bg-[var(--c-surface)] px-4 py-3 hover:bg-[var(--c-surface2)]">
                      <span className="mt-0.5 inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded bg-[var(--c-accent)]/10 px-1.5 py-1 text-xs font-bold text-[var(--c-accent)]">{d.label || (d.number ?? "—")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-[var(--c-ink)]">{d.title || "Exhibit"}</span>
                        {d.description && <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--c-ink-muted)]">{d.description}</span>}
                        {(d.bates || d.pageCount) && <span className="mt-0.5 block text-[11px] text-[var(--c-ink-muted)]">{d.bates}{d.bates && d.pageCount ? " · " : ""}{d.pageCount ? `${d.pageCount} pp` : ""}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-10 border-t border-[var(--c-border)] pt-5 text-xs text-[var(--c-ink-muted)]">
        Shared by {FIRM.name}. These materials are provided for review only.
      </footer>
    </main>
  );
}
