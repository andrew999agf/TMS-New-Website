import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminShell";
import { EDITABLE_PAGES } from "@/lib/content";

export default function PagesIndex() {
  return (
    <>
      <AdminHeader title="Pages" description="Edit every word on the public site. Nothing is hard-coded." />
      <div className="p-8 max-w-2xl">
        <div className="rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
          {EDITABLE_PAGES.map((p) => (
            <Link
              key={p.id}
              href={`/admin/pages/${p.id}`}
              className="flex items-center justify-between px-5 py-4 bg-[var(--c-surface)] hover:bg-[var(--c-surface2)] transition-colors"
            >
              <span className="font-medium">{p.label}</span>
              <ChevronRight size={18} className="text-[var(--c-ink-muted)]" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
