import type { BadgeView } from "@/lib/content";

/**
 * Strip of organizations, bar associations, and awards shown directly below the
 * hero. Renders each badge's logo when uploaded, otherwise a clean text chip.
 */
export function BadgeBar({ badges }: { badges: BadgeView[] }) {
  if (badges.length === 0) return null;
  return (
    <section className="border-b border-[var(--c-border)] bg-[var(--c-surface)]">
      <div className="container-page py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {badges.map((b) => {
            const inner = b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.logo}
                alt={b.name}
                title={b.name}
                className="h-12 w-auto max-w-[160px] object-contain opacity-80 grayscale hover:grayscale-0 hover:opacity-100 transition"
              />
            ) : (
              <span className="text-sm font-[family-name:var(--font-ui)] uppercase tracking-[0.1em] text-[var(--c-ink-muted)]">
                {b.name}
              </span>
            );
            return b.url ? (
              <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {inner}
              </a>
            ) : (
              <span key={b.id} className="shrink-0">
                {inner}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
