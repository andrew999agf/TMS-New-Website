"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type PostCard = {
  slug: string;
  title: string;
  excerpt: string;
  category?: string;
  publishAt?: string;
};

export function BlogIndex({
  posts,
  categories,
}: {
  posts: PostCard[];
  categories: { slug: string; title: string }[];
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        p.excerpt.toLowerCase().includes(needle)
      );
    });
  }, [posts, q, cat]);

  const catTitle = (slug?: string) =>
    categories.find((c) => c.slug === slug)?.title ?? slug;

  return (
    <div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search insights"
            className="w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-2.5 pl-10 pr-4 text-sm focus:border-[var(--c-accent)] outline-none"
            aria-label="Search insights"
          />
        </div>
        <Link href="/glossary" className="text-sm text-[var(--c-accent)] font-[family-name:var(--font-ui)]">
          Browse the Glossary →
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Chip active={cat === null} onClick={() => setCat(null)}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip key={c.slug} active={cat === c.slug} onClick={() => setCat(c.slug)}>
            {c.title}
          </Chip>
        ))}
      </div>

      <div className="mt-10 grid gap-px bg-[var(--c-border)] border border-[var(--c-border)] sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="group bg-[var(--c-surface)] p-7 flex flex-col hover:bg-[var(--c-surface2)] transition-colors"
          >
            <div className="flex items-center gap-3 text-xs text-[var(--c-ink-muted)] font-[family-name:var(--font-ui)]">
              {p.category && (
                <span className="text-[var(--c-accent)] uppercase tracking-[0.12em]">
                  {catTitle(p.category)}
                </span>
              )}
            </div>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-xl leading-tight group-hover:text-[var(--c-accent)] transition-colors">
              {p.title}
            </h2>
            <p className="mt-3 text-sm text-[var(--c-ink-muted)] leading-relaxed line-clamp-3 flex-1">
              {p.excerpt}
            </p>
            {p.publishAt && (
              <span className="mt-5 text-xs text-[var(--c-ink-muted)]">
                {formatDate(p.publishAt)}
              </span>
            )}
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-12 text-center text-[var(--c-ink-muted)]">
          No insights match your search.
        </p>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 text-sm rounded-full border font-[family-name:var(--font-ui)] transition-colors ${
        active
          ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]"
          : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
