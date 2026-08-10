"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, Scale, Users, FileAudio } from "lucide-react";

/** Sub-navigation across the four views of one case. */
export function PreTrialTabs({ caseId }: { caseId: number }) {
  const pathname = usePathname();
  const base = `/admin/pre-trial/${caseId}`;
  const tabs = [
    { label: "Checklist", href: base, icon: ListChecks },
    { label: "Proof Matrix", href: `${base}/proof`, icon: Scale },
    { label: "Witnesses & Exhibits", href: `${base}/evidence`, icon: Users },
    { label: "Transcripts", href: `${base}/transcripts`, icon: FileAudio },
  ];
  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--c-border)] pb-2">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-[var(--c-accent)] text-white" : "text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]"
            }`}
          >
            <Icon size={14} /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
