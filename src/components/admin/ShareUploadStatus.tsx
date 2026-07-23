"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Shown to anyone viewing a share link: if someone else is currently uploading,
 * a live "documents are being uploaded — 80 of 100" banner so they wait before
 * downloading. When the upload finishes, the page is refreshed so the new files
 * appear. Polls a tiny status endpoint every few seconds.
 */
export function ShareUploadStatus({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ uploading: boolean; total: number; done: number }>({ uploading: false, total: 0, done: 0 });
  const wasUploading = useRef(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/share/${token}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { uploading: boolean; total: number; done: number };
        if (!alive) return;
        setState(data);
        if (wasUploading.current && !data.uploading) router.refresh(); // uploads just finished → load the new files
        wasUploading.current = data.uploading;
      } catch {
        /* ignore transient poll errors */
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [token, router]);

  if (!state.uploading) return null;
  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
        <Loader2 size={15} className="animate-spin" /> Documents are being uploaded — {state.done} of {state.total}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-500/20">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-amber-700/80 dark:text-amber-300/80">Please wait until this finishes before downloading, so you get the complete set.</p>
    </div>
  );
}
