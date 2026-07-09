"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { clockIn, clockOut } from "@/app/admin/(panel)/timeclock/actions";

function elapsed(sinceIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/**
 * The hourly time clock: a single clear button at the top of the admin
 * sidebar, just below the firm name — on every page, phone included. Green
 * "Clock In" when off the clock; red "Clock Out" with a live elapsed timer
 * while on it. Collapsed sidebar shows the compact icon version. Rendered
 * only for accounts marked hourly.
 */
export function TimeClockButton({ initialOpenSince, collapsed = false }: { initialOpenSince: string | null; collapsed?: boolean }) {
  const [openSince, setOpenSince] = useState<string | null>(initialOpenSince);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!openSince) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return (
    <button
      onClick={toggle}
      disabled={pending}
      title={
        openSince
          ? `On the clock since ${new Date(openSince).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — tap to clock out`
          : "Clock in"
      }
      className={`flex items-center justify-center gap-2 rounded-lg font-semibold text-white shadow transition hover:brightness-110 disabled:opacity-60 ${
        collapsed ? "h-10 w-10 mx-auto" : "w-full px-3 py-2.5 text-sm"
      } ${openSince ? "bg-[var(--c-error,#b91c1c)]" : "bg-[var(--c-success,#15803d)]"}`}
    >
      <Clock size={collapsed ? 17 : 15} className={openSince ? "animate-pulse" : ""} />
      {!collapsed && (pending ? "…" : openSince ? `Clock Out · ${elapsed(openSince, now)}` : "Clock In")}
    </button>
  );
}
