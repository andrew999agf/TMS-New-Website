/**
 * DFW (America/Chicago) date and time helpers.
 *
 * On daylight saving: no external service is used or needed to get this right.
 * Every browser and Node runtime ships the IANA time-zone database, and
 * `Intl.DateTimeFormat` with `timeZone: "America/Chicago"` applies the correct
 * CST/CDT offset for any instant — including across the March and November
 * switches — and keeps working when Congress or the IANA rules change, because
 * the database is updated with the runtime. A third-party time API would add a
 * network dependency and an outage mode without making the offset any more
 * accurate.
 *
 * What an outside source *can* fix is a wrong clock on the viewer's own machine.
 * For that the admin clock syncs against our own server (see /api/time), which
 * is NTP-synced by the host — free, no rate limits, and no third party.
 */

export const DFW_TZ = "America/Chicago";

/** The wall-clock reading in `tz`, expressed as a UTC timestamp for arithmetic. */
function zonedAsUtc(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Intl can emit hour "24" for midnight in some engines.
  const hour = g("hour") % 24;
  return Date.UTC(g("year"), g("month") - 1, g("day"), hour, g("minute"), g("second"));
}

/** UTC offset of `tz` at this instant, in minutes (e.g. -360 CST, -300 CDT). */
export function offsetMinutes(d: Date, tz: string = DFW_TZ): number {
  return Math.round((zonedAsUtc(d, tz) - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** "CST" or "CDT" for this instant. */
export function tzAbbrev(d: Date, tz: string = DFW_TZ): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** True when daylight saving is in effect (the offset is the shorter of the year's two). */
export function isDST(d: Date, tz: string = DFW_TZ): boolean {
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d));
  const jan = offsetMinutes(new Date(Date.UTC(year, 0, 15)), tz);
  const jul = offsetMinutes(new Date(Date.UTC(year, 6, 15)), tz);
  return offsetMinutes(d, tz) === Math.max(jan, jul) && jan !== jul;
}

export type DstTransitions = { start: Date | null; end: Date | null };

/**
 * The two instants in `year` when the offset changes — found by walking the
 * year day by day for a change, then narrowing to the minute. Reads the same
 * IANA database the formatter uses, so it stays right if the rules change; no
 * network call and nothing to schedule.
 */
export function dstTransitions(year: number, tz: string = DFW_TZ): DstTransitions {
  const bounds: Date[] = [];
  let prev = offsetMinutes(new Date(Date.UTC(year, 0, 1)), tz);
  for (let day = 1; day <= 366; day++) {
    const at = new Date(Date.UTC(year, 0, 1 + day));
    if (at.getUTCFullYear() !== year) break;
    const cur = offsetMinutes(at, tz);
    if (cur !== prev) {
      // Narrow the 24h window down to the minute the offset flips.
      let lo = new Date(Date.UTC(year, 0, day)).getTime();
      let hi = at.getTime();
      const before = offsetMinutes(new Date(lo), tz);
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (offsetMinutes(new Date(mid), tz) === before) lo = mid;
        else hi = mid;
      }
      // `hi` is within a minute after the switch. Transitions fall exactly on a
      // minute, so floor to it — and step forward only if that lands back in the
      // old offset, which keeps the boundary exact rather than approximate.
      let exact = Math.floor(hi / 60_000) * 60_000;
      if (offsetMinutes(new Date(exact), tz) === before) exact += 60_000;
      bounds.push(new Date(exact));
      prev = cur;
    }
  }
  const jan = offsetMinutes(new Date(Date.UTC(year, 0, 15)), tz);
  const jul = offsetMinutes(new Date(Date.UTC(year, 6, 15)), tz);
  if (jan === jul || bounds.length < 2) return { start: bounds[0] ?? null, end: bounds[1] ?? null };
  // The transition into the longer offset starts DST.
  return jul > jan ? { start: bounds[0], end: bounds[1] } : { start: bounds[1], end: bounds[0] };
}

/** "Monday, August 10, 2026" */
export function formatDfwDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: DFW_TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
}

/** "3:42 PM" */
export function formatDfwTime(d: Date, withSeconds = false): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DFW_TZ,
    hour: "numeric",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
  }).format(d);
}

/** "Mar 8" — for naming the next changeover in the tooltip. */
export function formatDfwShort(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: DFW_TZ, month: "short", day: "numeric" }).format(d);
}
