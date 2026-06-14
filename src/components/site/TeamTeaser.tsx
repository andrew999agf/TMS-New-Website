"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type TeaserMember = {
  slug: string;
  name: string;
  role: string;
  photo?: string;
  shortBio?: string;
};

/**
 * Home-page team list. Hovering (or focusing) a member reveals a clear popover
 * with their photo (if any) and a short bio summary, plus a "Click for more
 * information" cue. The whole row links to the full profile.
 */
export function TeamTeaser({ members }: { members: TeaserMember[] }) {
  return (
    <ul className="divide-y divide-[var(--c-border)] border-y border-[var(--c-border)]">
      {members.map((m) => {
        const initials = m.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
        return (
          <li key={m.slug} className="relative group">
            <Link href={`/about/${m.slug}`} className="flex items-center justify-between gap-4 py-4">
              <span>
                <span className="font-[family-name:var(--font-display)] text-lg group-hover:text-[var(--c-accent)] transition-colors">
                  {m.name}
                </span>
                <span className="block text-sm text-[var(--c-ink-muted)]">{m.role}</span>
              </span>
              <ArrowRight
                size={16}
                className="text-[var(--c-ink-muted)] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
              />
            </Link>

            {/* Hover/focus popover */}
            <div
              className="pointer-events-none absolute z-30 left-0 right-0 bottom-full mb-2 opacity-0 translate-y-1
                         group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0
                         transition-all duration-150"
            >
              <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl p-4 flex gap-4">
                <div className="h-20 w-16 shrink-0 rounded overflow-hidden bg-[var(--c-surface2)] flex items-center justify-center">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo} alt={m.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-[family-name:var(--font-display)] text-xl text-[var(--c-ink-muted)] opacity-40">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-[family-name:var(--font-display)] leading-tight">{m.name}</div>
                  <div className="text-xs text-[var(--c-accent)] uppercase tracking-[0.1em]">{m.role}</div>
                  {m.shortBio && (
                    <p className="mt-1.5 text-sm text-[var(--c-ink-muted)] leading-snug line-clamp-3">{m.shortBio}</p>
                  )}
                  <span className="mt-1.5 inline-block text-xs font-[family-name:var(--font-ui)] text-[var(--c-accent)]">
                    Click for more information →
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
