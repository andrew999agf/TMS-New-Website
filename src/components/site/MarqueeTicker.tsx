"use client";

import { useEffect, useRef, useState } from "react";

export type TickerItem = {
  practiceTitle?: string;
  stat?: string;
  statLabel?: string;
  title: string;
  summary?: string;
  detail?: string;
  cite?: string;
};

/**
 * Results marquee that shuffles through several featured results with a
 * crossfade. The eyebrow shows the matter's practice area (not a generic
 * "marquee" label). Honors prefers-reduced-motion (no auto-advance) and pauses
 * on hover; dots let visitors step through manually.
 */
export function MarqueeTicker({ items, intervalMs = 6000 }: { items: TickerItem[]; intervalMs?: number }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reduced || paused || items.length <= 1) return;
    timer.current = setInterval(() => setActive((i) => (i + 1) % items.length), intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, paused, items.length, intervalMs]);

  if (items.length === 0) return null;
  const item = items[active];

  // Short numeric stats ($11.2M) get the giant display size; word/phrase stats
  // ("Funds returned", "Both Affirmed") get a much smaller size so a single card
  // never balloons to fill the whole screen.
  const isShortStat = !!item.stat && item.stat.length <= 8 && !/\s/.test(item.stat);
  const statClass = isShortStat
    ? "text-6xl lg:text-8xl"
    : "text-3xl lg:text-4xl";

  return (
    <section
      className="bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)] p-10 lg:p-16"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <div key={active} className="fade-up">
        <p className="eyebrow text-[var(--c-dark-accent)]">{item.practiceTitle ?? "Result"}</p>
        <div className="mt-6 grid gap-8 lg:grid-cols-[auto_1fr] lg:gap-16 lg:items-center">
          {item.stat && (
            <div className={`font-[family-name:var(--font-display)] ${statClass} text-[var(--c-dark-accent)] leading-none`}>
              {item.stat}
            </div>
          )}
          <div>
            <h2 className="h3 text-[var(--c-dark-ink)]">{item.title}</h2>
            {item.summary && (
              <p className="mt-4 text-[var(--c-dark-ink-muted)] leading-relaxed max-w-2xl">{item.summary}</p>
            )}
            {item.detail && (
              <details className="mt-5">
                <summary className="cursor-pointer text-sm text-[var(--c-dark-accent)] font-[family-name:var(--font-ui)] list-none">
                  Case detail &amp; citation →
                </summary>
                <p className="mt-3 text-sm text-[var(--c-dark-ink-muted)] leading-relaxed">{item.detail}</p>
              </details>
            )}
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="mt-10 flex items-center gap-2.5" role="tablist" aria-label="Featured results">
          {items.map((it, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === active}
              aria-label={`Show result ${i + 1}: ${it.practiceTitle ?? it.title}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-8 bg-[var(--c-dark-accent)]" : "w-3 bg-[var(--c-dark-border)] hover:bg-[var(--c-dark-ink-muted)]"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
