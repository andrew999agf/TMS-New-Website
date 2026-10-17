"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Shown to a recipient while a big folder's download package is being
 * prepared on the server. Polls the status and refreshes the page the moment
 * the package is ready — nothing to click, nobody to ask.
 */
export function PackagePreparing({ token, done, total, bytes }: { token: string; done: number; total: number; bytes: number }) {
  const router = useRouter();
  const [s, setS] = useState({ done, total });
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/share/${token}/package/status`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { state: string; done: number; total: number };
        if (stop) return;
        setS({ done: j.done, total: j.total });
        if (j.state === "ready" || j.state === "stale") router.refresh();
      } catch { /* try again next tick */ }
    };
    const t = setInterval(() => void tick(), 5000);
    return () => { stop = true; clearInterval(t); };
  }, [token, router]);
  const gb = (bytes / 1024 ** 3).toFixed(1);
  return (
    <div className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs text-[var(--c-ink-muted)]" data-testid="package-preparing" role="status" aria-live="polite">
      <p className="inline-flex items-center gap-2 font-medium text-[var(--c-ink)]"><Loader2 size={13} className="animate-spin" /> Preparing your complete download ({gb} GB){s.total > 0 ? ` · ${s.done} of ${s.total} parts ready` : ""}</p>
      <p className="mt-0.5">This takes a few minutes for a folder this size and happens on our end. The download links appear here on their own; you can also open any sub-folder below right away.</p>
    </div>
  );
}
