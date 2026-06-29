"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import {
  getUserTraining,
  setUserModuleAccess,
  type UserTrainingView,
} from "@/app/admin/(panel)/training/admin-actions";

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function UserTrainingPanel({ userId, fullAdmin }: { userId: number; fullAdmin: boolean }) {
  const [data, setData] = useState<UserTrainingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    getUserTraining(String(userId))
      .then((d) => alive && setData(d))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  function toggle(slug: string, allowed: boolean) {
    if (!data) return;
    // Optimistic update, reconciled with the server's authoritative list.
    setData({
      ...data,
      allowed: allowed ? [...new Set([...data.allowed, slug])] : data.allowed.filter((s) => s !== slug),
    });
    start(async () => {
      const res = await setUserModuleAccess(String(userId), slug, allowed);
      if (res.ok && res.allowed) setData((d) => (d ? { ...d, allowed: res.allowed! } : d));
    });
  }

  if (loading) {
    return (
      <div className="rounded-md bg-[var(--c-surface2)] p-3 flex items-center gap-2 text-sm text-[var(--c-ink-muted)]">
        <Loader2 size={15} className="animate-spin" /> Loading training…
      </div>
    );
  }
  if (!data) {
    return <div className="rounded-md bg-[var(--c-surface2)] p-3 text-sm text-[var(--c-ink-muted)]">Couldn&apos;t load training.</div>;
  }

  const done = data.modules.filter((m) => data.completion[m.slug]).length;

  return (
    <div className="rounded-md bg-[var(--c-surface2)] p-3">
      <p className="text-xs text-[var(--c-ink-muted)] mb-2">
        Progress: <span className="font-semibold text-[var(--c-ink)]">{done}</span> of{" "}
        <span className="font-semibold text-[var(--c-ink)]">{data.modules.length}</span> modules completed.
        {" "}Check a box to control which modules this person can access.
      </p>
      <div className="divide-y divide-[var(--c-border)]">
        {data.modules.map((m) => {
          const at = data.completion[m.slug];
          const allowed = fullAdmin || data.allowed.includes(m.slug);
          return (
            <div key={m.slug} className="flex items-center justify-between gap-3 py-1.5">
              <label className="flex min-w-0 items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-[var(--c-accent)]"
                  checked={allowed}
                  disabled={fullAdmin || pending}
                  onChange={(e) => toggle(m.slug, e.target.checked)}
                />
                <span className="truncate text-[var(--c-ink)]">{m.title}</span>
              </label>
              <span className="shrink-0 text-xs flex items-center gap-1">
                {at ? (
                  <span className="flex items-center gap-1 text-[var(--c-accent)]">
                    <CheckCircle2 size={13} /> {fmt(at)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[var(--c-ink-muted)]">
                    <Circle size={13} /> Not started
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--c-ink-muted)] mt-2">
        {fullAdmin
          ? "This is a full-admin account — it can access every module."
          : "Access changes take effect the next time they open Training."}
      </p>
    </div>
  );
}
