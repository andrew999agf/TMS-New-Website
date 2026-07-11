/** Central-Time date helpers shared by the time-clock report crons. */

export const CT = "America/Chicago";

/** The absolute instant of midnight (00:00) in Central Time on a calendar day. */
export function ctMidnight(y: number, m: number, d: number): Date {
  const candidate = new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00-06:00`);
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "2-digit", hour12: false }).format(candidate));
  if (h === 1) return new Date(candidate.getTime() - 3_600_000); // CDT (UTC-5)
  if (h === 23) return new Date(candidate.getTime() + 3_600_000);
  return candidate;
}

/** Calendar date (and weekday index, Mon=0) of an instant in Central Time. */
export function ctDate(now: Date): { y: number; m: number; d: number; dow: number; iso: string } {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = iso.split("-").map(Number);
  const dowName = new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short" }).format(now);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(dowName);
  return { y, m, d, dow: Math.max(dow, 0), iso };
}

/** Midnight CT at the start of the current CT week (Monday). */
export function ctWeekStart(now: Date): Date {
  const { y, m, d, dow } = ctDate(now);
  const mon = new Date(Date.UTC(y, m - 1, d) - dow * 86_400_000);
  return ctMidnight(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
}

export const fmtDayCT = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short", month: "numeric", day: "numeric" }).format(d);
export const fmtTimeCT = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "numeric", minute: "2-digit" }).format(d);
