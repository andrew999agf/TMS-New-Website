import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { PracticeAreaEditor } from "@/components/admin/PracticeAreaEditor";
import { getPracticeArea } from "@/lib/content";
import { hasDb } from "@/db";

export const dynamic = "force-dynamic";

export default async function EditPracticeArea({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pa = await getPracticeArea(slug);
  if (!pa) notFound();

  return (
    <>
      <AdminHeader title={pa.title} description="Edit copy, approach, keywords, hero, and SEO for this practice area." />
      <div className="p-8">
        {!hasDb && (
          <p className="mb-5 text-sm text-[var(--c-ink-muted)]">
            Showing seed content. Connect the database and run the seed to enable editing.
          </p>
        )}
        <PracticeAreaEditor
          initial={{
            slug: pa.slug,
            title: pa.title,
            tagline: pa.tagline,
            body: pa.body,
            approach: pa.approach,
            keywords: pa.keywords,
            heroImage: pa.heroImage ?? "",
            seoTitle: pa.seoTitle,
            seoDescription: pa.seoDescription,
            visible: true,
          }}
        />
      </div>
    </>
  );
}
