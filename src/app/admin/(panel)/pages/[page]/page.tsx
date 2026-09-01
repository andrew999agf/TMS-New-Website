import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminShell";
import { BlockEditor } from "@/components/admin/BlockEditor";
import { getEditableBlocks, EDITABLE_PAGES } from "@/lib/content";
import { OPERATOR_BLOCK_KEYS } from "@/lib/content/defaults/blocks";

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

  // Operator-owned settings (like the Clio payment link) have exactly one
  // edit surface — Settings — so they never appear here as a second,
  // competing editor.
  const blocks = (await getEditableBlocks(page)).filter((b) => !OPERATOR_BLOCK_KEYS.has(b.key));

  return (
    <>
      <AdminHeader title={meta.label} description="Edit content, then publish. Changes go live site-wide." />
      <div className="p-8">
        {page === "payment" && (
          <p className="mb-6 max-w-3xl rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-sm text-[var(--c-ink-muted)]">
            The Clio payment link itself (where the &quot;Make a Payment&quot; button sends people) is set in{" "}
            <Link href="/admin/settings" className="text-[var(--c-accent)]">Settings → Make a Payment</Link>.
            This page only edits the wording and banner shown if that link is ever missing.
          </p>
        )}
        <BlockEditor blocks={blocks} previewHref={PREVIEW[page]} />
      </div>
    </>
  );
}
