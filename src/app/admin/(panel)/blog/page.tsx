import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { BlogList, type AdminPost } from "@/components/admin/BlogList";
import { db, hasDb } from "@/db";
import { blogPosts } from "@/db/schema";
import { desc } from "drizzle-orm";
import { BLOG_POSTS } from "@/lib/content/defaults/posts";

export const dynamic = "force-dynamic";

export default async function BlogAdminPage() {
  let posts: AdminPost[] = [];

  if (db) {
    try {
      const rows = await db.select().from(blogPosts).orderBy(desc(blogPosts.publishAt));
      posts = rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        category: r.category,
        status: r.status as AdminPost["status"],
        isFirmNews: r.isFirmNews,
        publishAt: r.publishAt?.toISOString() ?? null,
      }));
    } catch {
      posts = [];
    }
  }

  if (posts.length === 0) {
    // Preview from seed when no DB yet.
    posts = BLOG_POSTS.map((p, i) => ({
      id: -(i + 1),
      slug: p.slug,
      title: p.title,
      category: p.category ?? null,
      status: p.status,
      isFirmNews: p.isFirmNews ?? false,
      publishAt: p.publishAt ?? null,
    }));
  }

  return (
    <>
      <AdminHeader
        title="Blog / Insights"
        description={`${posts.length} posts. Toggle visibility, review scheduled content, manage firm news.`}
        actions={
          <Link href="/admin/blog/new" className="btn btn-accent text-sm py-2.5 px-4">
            <Plus size={16} /> New post
          </Link>
        }
      />
      <div className="p-8">
        <BlogList posts={posts} dbEnabled={hasDb} />
      </div>
    </>
  );
}
