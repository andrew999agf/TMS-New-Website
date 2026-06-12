import { AdminHeader } from "@/components/admin/AdminShell";
import { PostEditor } from "@/components/admin/PostEditor";
import { getPracticeAreas } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const practices = await getPracticeAreas();
  return (
    <>
      <AdminHeader title="New post" description="Write, set status/schedule, and publish." />
      <div className="p-8">
        <PostEditor
          initial={{ status: "draft" }}
          practices={practices.map((p) => ({ slug: p.slug, title: p.title }))}
        />
      </div>
    </>
  );
}
