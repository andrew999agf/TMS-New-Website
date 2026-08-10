import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DFW_TZ, dstTransitions, offsetMinutes, tzAbbrev } from "@/lib/dfw-time";

export const runtime = "nodejs";
export const maxDuration = 30;

export const DST_KEY = "time.dfwDst";

/**
 * Yearly daylight-saving audit for DFW, run on 1 January (see vercel.json).
 *
 * The clock does not depend on this job. The CST/CDT offset comes from the IANA
 * time-zone database inside the runtime, which already knows every transition
 * and updates with the platform — that is what makes the clock correct in
 * perpetuity without a network call.
 *
 * What this job adds is a check on that assumption. Each year it records the two
 * transition dates it computes, then asks an independent public clock what the
 * DFW offset is right now and compares. Agreement means the runtime's time-zone
 * data is current. Disagreement is the one failure worth knowing about — it
 * would mean the platform is running a stale tz database (or the rules changed)
 * — and it gets recorded as unverified so it can be seen rather than silently
 * trusted. An unreachable API is not a failure: the computed dates still stand.
 */

/** Ask an outside clock for the current DFW offset, in minutes. Null if unreachable. */
async function externalOffsetMinutes(): Promise<{ minutes: number; source: string } | null> {
  const attempts: { url: string; pick: (j: unknown) => number | null }[] = [
    {
      url: `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(DFW_TZ)}`,
      // e.g. { ..., "dateTime": "2026-01-01T06:00:00", "currentUtcOffset": { "seconds": -21600 } }
      pick: (j) => {
        const o = (j as { currentUtcOffset?: { seconds?: number } })?.currentUtcOffset?.seconds;
        return typeof o === "number" ? Math.round(o / 60) : null;
      },
    },
    {
      url: `https://worldtimeapi.org/api/timezone/${DFW_TZ}`,
      // e.g. { "utc_offset": "-06:00", ... }
      pick: (j) => {
        const s = (j as { utc_offset?: string })?.utc_offset;
        const m = typeof s === "string" ? s.match(/^([+-])(\d{2}):(\d{2})$/) : null;
        return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
      },
    },
  ];

  for (const a of attempts) {
    try {
      const res = await fetch(a.url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const minutes = a.pick(await res.json());
      if (minutes !== null) return { minutes, source: new URL(a.url).host };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: DFW_TZ, year: "numeric" }).format(now));

  // Authoritative: computed from the runtime's tz database.
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const thisYear = dstTransitions(year);
  const nextYear = dstTransitions(year + 1);
  const computed = offsetMinutes(now);

  // Independent cross-check.
  const external = await externalOffsetMinutes();
  const verified = external ? external.minutes === computed : null;

  const record = {
    checkedAt: now.toISOString(),
    zone: DFW_TZ,
    year,
    abbreviation: tzAbbrev(now),
    offsetMinutes: computed,
    transitions: {
      [year]: { start: iso(thisYear.start), end: iso(thisYear.end) },
      [year + 1]: { start: iso(nextYear.start), end: iso(nextYear.end) },
    },
    verifiedAgainst: external?.source ?? null,
    externalOffsetMinutes: external?.minutes ?? null,
    /** true = agreed, false = MISMATCH (stale tz data), null = API unreachable. */
    verified,
  };

  if (verified === false) {
    console.error("[dst-check] DFW offset disagrees with", external?.source, {
      computed,
      external: external?.minutes,
    });
  }

  if (db) {
    try {
      await db
        .insert(settings)
        .values({ key: DST_KEY, value: record, updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value: record, updatedAt: now } });
    } catch (err) {
      console.error("[dst-check] couldn't record the audit:", err);
    }
  }

  return NextResponse.json({ ok: true, ...record });
}
