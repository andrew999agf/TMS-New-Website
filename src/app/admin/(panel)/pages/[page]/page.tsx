import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { BlockEditor } from "@/components/admin/BlockEditor";
import { getEditableBlocks, EDITABLE_PAGES } from "@/lib/content";

export const dynamic = "force-dynamic";

const PREVIEW: Record<string, string> = {
  home: "/",
  about: "/about",
  contact: "/contact",
  consultation: "/consultation",
  payment: "/payment",
};

export default async function PageBlocksEditor({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const meta = EDITABLE_PAGES.find((p) => p.id === page);
  if (!meta) notFound();

  const blocks = await getEditableBlocks(page);

  return (
    <>
      <AdminHeader title={meta.label} description="Edit content, then publish. Changes go live site-wide." />
      <div className="p-8">
        <BlockEditor blocks={blocks} previewHref={PREVIEW[page]} />
      </div>
    </>
  );
}
