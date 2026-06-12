"use client";

import { useEffect, useRef, useState } from "react";

export type GlossEntry = { slug: string; term: string; definition: string; hypothetical: string };

/**
 * Renders post HTML (already annotated with <span class="gloss" data-slug>) and
 * attaches an accessible tooltip showing the definition + a flashcard-style
 * hypothetical, plus a link to the full glossary entry. Term highlights use the
 * --c-term color, which is intentionally distinct from link color.
 */
export function GlossaryBody({
  html,
  entries,
}: {
  html: string;
  entries: GlossEntry[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{
    slug: string;
    x: number;
    y: number;
  } | null>(null);

  const map = new Map(entries.map((e) => [e.slug, e]));

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const show = (el: HTMLElement) => {
      const slug = el.dataset.slug;
      if (!slug) return;
      const rect = el.getBoundingClientRect();
      // Viewport coordinates for position:fixed; clamp so the 320px-wide
      // tooltip stays on screen on narrow viewports.
      const half = 160;
      const x = Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8);
      setActive({ slug, x, y: rect.bottom });
    };
    const hide = () => setActive(null);

    const onOver = (e: Event) => {
      const t = (e.target as HTMLElement).closest(".gloss") as HTMLElement | null;
      if (t) show(t);
    };
    const onOut = (e: Event) => {
      const t = (e.target as HTMLElement).closest(".gloss");
      if (t) hide();
    };
    const onFocus = (e: Event) => {
      const t = (e.target as HTMLElement).closest(".gloss") as HTMLElement | null;
      if (t) show(t);
    };

    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", hide);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("focusout", hide);
    };
  }, []);

  const entry = active ? map.get(active.slug) : null;

  return (
    <>
      <style>{`
        .gloss {
          color: var(--c-term);
          border-bottom: 1px dotted var(--c-term);
          cursor: help;
          font-weight: 500;
        }
        .gloss:hover, .gloss:focus-visible { background: color-mix(in srgb, var(--c-term) 12%, transparent); }
      `}</style>
      <div ref={ref} className="prose-firm" dangerouslySetInnerHTML={{ __html: html }} />
      {entry && active && (
        <div
          role="tooltip"
          className="fixed z-50 w-80 max-w-[90vw] -translate-x-1/2 mt-2 rounded-sm border border-[var(--c-border)] bg-[var(--c-surface)] p-4 shadow-xl text-left"
          style={{ left: active.x, top: active.y }}
        >
          <div className="font-[family-name:var(--font-ui)] text-sm font-semibold text-[var(--c-term)]">
            {entry.term}
          </div>
          <p className="mt-1.5 text-sm text-[var(--c-ink)] leading-snug">{entry.definition}</p>
          {entry.hypothetical && (
            <p className="mt-2 text-xs text-[var(--c-ink-muted)] leading-snug border-t border-[var(--c-border)] pt-2">
              <span className="font-semibold">Hypothetical: </span>
              {entry.hypothetical}
            </p>
          )}
          <a
            href={`/glossary/${entry.slug}`}
            className="mt-2 inline-block text-xs text-[var(--c-link)] underline underline-offset-2"
          >
            Full entry →
          </a>
        </div>
      )}
    </>
  );
}
