import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PostEditor } from "@/components/admin/PostEditor";
import { getPracticeAreas } from "@/lib/content";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!db || Number.isNaN(numId)) notFound();

  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, numId));
  if (!post) notFound();

  const practices = await getPracticeAreas();

  return (
    <>
      <AdminHeader title="Edit post" description={post.title} />
      <div className="p-8">
        <PostEditor
          initial={{
            id: post.id,
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt ?? "",
            body: post.body ?? "",
            bannerImage: post.bannerImage ?? "",
            bannerFocal: post.bannerFocal ?? "center",
            category: post.category ?? "",
            status: post.status as "draft" | "hidden" | "scheduled" | "published",
            publishAt: post.publishAt?.toISOString(),
            seoTitle: post.seoTitle ?? "",
            seoDescription: post.seoDescription ?? "",
            isFirmNews: post.isFirmNews,
            relatedPractices: (post.relatedPractices as string[]) ?? [],
          }}
          practices={practices.map((p) => ({ slug: p.slug, title: p.title }))}
        />
      </div>
    </>
  );
}
