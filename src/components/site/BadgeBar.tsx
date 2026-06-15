import type { BadgeView } from "@/lib/content";
import { media } from "@/lib/media";

/**
 * Trust strip below the hero: organization, bar-association, and award logos
 * (PNG, ideally transparent). Badges without a logo are skipped — this bar is
 * image-only. The set slowly scrolls and loops; it pauses on hover and freezes
 * under prefers-reduced-motion.
 */
export function BadgeBar({ badges }: { badges: BadgeView[] }) {
  const withLogos = badges.filter((b) => b.logo);
  if (withLogos.length === 0) return null;

  // Duplicate the set so the marquee can loop seamlessly.
  const loop = [...withLogos, ...withLogos];
  // Half speed = double the duration.
  const durationS = Math.max(48, withLogos.length * 14);

  return (
    <section className="border-b border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden">
      <div className="py-6 lg:py-10 group">
        <div
          className="badge-marquee flex items-center gap-12 lg:gap-28 w-max"
          style={{ animationDuration: `${durationS}s` }}
        >
          {loop.map((b, i) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media(b.logo)}
                alt={b.name}
                title={b.name}
                className="h-20 sm:h-28 lg:h-[8.4rem] w-auto max-w-[200px] sm:max-w-[320px] lg:max-w-[432px] object-contain"
              />
            );
            return b.url ? (
              <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {img}
              </a>
            ) : (
              <span key={i} className="shrink-0">
                {img}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
