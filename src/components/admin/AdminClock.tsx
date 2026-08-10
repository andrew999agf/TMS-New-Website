"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { dstTransitions, formatDfwDate, formatDfwShort, formatDfwTime, isDST, tzAbbrev } from "@/lib/dfw-time";

/**
 * Today's date and the current DFW time, shown on every admin page.
 *
 * Daylight saving is handled by the runtime's IANA time-zone database via
 * Intl — CST and CDT switch on their own, with no service to call and nothing
 * to schedule. The one thing worth correcting is a wrong clock on the viewer's
 * machine, so we take an offset against our own server on mount and re-check it
 * hourly. If that request ever fails we simply fall back to the local clock.
 */
export function AdminClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [skew, setSkew] = useState(0); // serverNow - deviceNow, in ms

  // Sync against the server, then re-check hourly (and after waking from sleep).
  useEffect(() => {
    let alive = true;
    async function sync() {
      try {
        const sent = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" });
        if (!res.ok) return;
        const { now: server } = (await res.json()) as { now: number };
        // Charge half the round trip to the response leg.
        const rtt = Date.now() - sent;
        if (alive && Number.isFinite(server)) setSkew(server + rtt / 2 - Date.now());
      } catch {
        /* keep using the device clock */
      }
    }
    sync();
    const id = setInterval(sync, 60 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Tick every second. Rendering starts only after mount so the server-rendered
  // markup and the first client paint can't disagree.
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + skew));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [skew]);

  const tooltip = useMemo(() => {
    if (!now) return "";
    const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric" }).format(now));
    const { start, end } = dstTransitions(year);
    const next = isDST(now) ? end : start && start > now ? start : dstTransitions(year + 1).start;
    const which = isDST(now) ? "Daylight saving ends" : "Daylight saving begins";
    return [
      `${formatDfwDate(now)} · ${formatDfwTime(now, true)} ${tzAbbrev(now)}`,
      "Dallas–Fort Worth (America/Chicago)",
      next ? `${which} ${formatDfwShort(next)}` : "",
      "Synced to the firm's server",
    ].filter(Boolean).join("\n");
  }, [now]);

  if (!now) {
    // Reserve the space so the bar doesn't jump when the clock appears.
    return <span className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)]"><Clock size={13} /> —</span>;
  }

  return (
    <span title={tooltip} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--c-ink-muted)]" suppressHydrationWarning>
      <Clock size={13} className="shrink-0 text-[var(--c-accent)]" />
      <span className="hidden sm:inline">{formatDfwDate(now)}</span>
      <span className="sm:hidden">{formatDfwShort(now)}</span>
      <span className="font-semibold tabular-nums text-[var(--c-ink)]">{formatDfwTime(now)}</span>
      <span className="rounded bg-[var(--c-surface2)] px-1 py-0.5 text-[10px] font-semibold">{tzAbbrev(now)}</span>
    </span>
  );
}
