"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { togglePostVisibility } from "@/app/admin/(panel)/blog/actions";
import { formatDate } from "@/lib/utils";

export type AdminPost = {
  id: number;
  slug: string;
  title: string;
  category: string | null;
  status: "draft" | "hidden" | "scheduled" | "published";
  isFirmNews: boolean;
  publishAt: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  published: "bg-[var(--c-success)] text-white",
  scheduled: "bg-[var(--c-accent)] text-[var(--c-on-accent)]",
  hidden: "bg-[var(--c-ink-muted)] text-white",
  draft: "bg-[var(--c-surface2)] text-[var(--c-ink-muted)]",
};

export function BlogList({ posts, dbEnabled }: { posts: AdminPost[]; dbEnabled: boolean }) {
  const [filter, setFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const filtered = posts.filter((p) => {
    if (filter === "all") return true;
    if (filter === "firm-news") return p.isFirmNews;
    return p.status === filter;
  });

  function toggle(p: AdminPost) {
    if (!dbEnabled) return;
    startTransition(() => {
      void togglePostVisibility(p.id, p.status !== "published");
    });
  }

  const filters = ["all", "published", "scheduled", "hidden", "firm-news"];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-full border capitalize ${
              filter === f
                ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]"
                : "border-[var(--c-border)] text-[var(--c-ink-muted)]"
            }`}
          >
            {f.replace("-", " ")}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--c-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--c-surface2)] text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-border)]">
            {filtered.map((p) => (
              <tr key={p.id} className="bg-[var(--c-surface)] hover:bg-[var(--c-surface2)]">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-[var(--c-ink-muted)]">
                    {p.category}
                    {p.isFirmNews && <span className="ml-2 text-[var(--c-accent)]">Firm news</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_STYLES[p.status]}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--c-ink-muted)]">{formatDate(p.publishAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    {dbEnabled && p.id > 0 && (
                      <Link href={`/admin/blog/${p.id}`} className="text-xs text-[var(--c-accent)]">
                        Edit
                      </Link>
                    )}
                    {(p.status === "published" || p.status === "hidden") && (
                      <button
                        onClick={() => toggle(p)}
                        disabled={pending || !dbEnabled}
                        className="text-xs text-[var(--c-accent)] disabled:opacity-50"
                      >
                        {p.status === "published" ? "Hide" : "Publish"}
                      </button>
                    )}
                    {p.status === "published" && (
                      <Link href={`/blog/${p.slug}`} target="_blank" className="text-[var(--c-ink-muted)]">
                        <ExternalLink size={14} />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!dbEnabled && (
        <p className="mt-4 text-sm text-[var(--c-ink-muted)]">
          Connect the database to publish, hide, schedule, and edit posts.
        </p>
      )}
    </div>
  );
}
